require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/service_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Auto-create table on start
pool.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    fault TEXT,
    repair_procedure TEXT,
    status VARCHAR(50) DEFAULT 'utworzony',
    assigned_to VARCHAR(100),
    assigned_by VARCHAR(100) DEFAULT 'kierownik',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
  `).then(() => console.log('Table ready')).catch(console.error);

  // Create users table
  pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).then(() => console.log('Users table ready')).catch(console.error);

  // Add address/geo columns to tasks if missing
  pool.query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION
  `).then(() => console.log('Tasks table ensured address/geo columns')).catch(console.error);

  // Ensure priority column and status default
  pool.query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'med'
  `).then(() => console.log('Tasks table ensured priority column')).catch(console.error);

  pool.query(`
    ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'utworzony'
  `).then(() => console.log('Tasks status default ensured')).catch(() => {});

  // Seed admin user when ADMIN_PASSWORD provided
  if (process.env.ADMIN_PASSWORD) {
    (async () => {
      try {
        const { rows } = await pool.query('SELECT id FROM users WHERE username=$1', ['admin']);
        if (rows.length === 0) {
          const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
          await pool.query('INSERT INTO users(username,password,role) VALUES($1,$2,$3)', ['admin', hashed, 'admin']);
          console.log('Admin user created: username=admin');
        }
        // seed a default regular user for testing
        const { rows: urows } = await pool.query('SELECT id FROM users WHERE username=$1', ['user']);
        if (urows.length === 0) {
          const hup = await bcrypt.hash(process.env.DEFAULT_USER_PASSWORD || 'user123', 10);
          await pool.query('INSERT INTO users(username,password,role) VALUES($1,$2,$3)', ['user', hup, 'user']);
          console.log('Default user created: username=user');
        }
      } catch (e) {
        console.error('Error creating admin user', e);
      }
    })();
  }

// expose simple users list for suggestions (authenticated)
app.get('/users', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role FROM users ORDER BY username');
    res.json(result.rows.map(r=>({ id: r.id, username: r.username, role: r.role })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

app.get('/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Authentication endpoints ---
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users(username,password,role) VALUES($1,$2,$3) RETURNING id, username, role',
      [username, hashed, role || 'user']
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'username already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth middleware
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (req.user.role !== role) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

app.get('/me', requireAuth, (req, res) => res.json(req.user));

// PDF export for task
app.get('/tasks/:id/pdf', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const task = result.rows[0];
    // allow if admin or assigned user
    if (req.user.role !== 'admin' && req.user.username !== task.assigned_to) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="task-${id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text('Protokół zlecenia', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`ID: ${task.id}`);
    doc.text(`Tytuł: ${task.title || ''}`);
    doc.text(`Status: ${task.status || ''}`);
    doc.text(`Przypisany do: ${task.assigned_to || ''}`);
    doc.text(`Przypisany przez: ${task.assigned_by || ''}`);
    doc.text(`Data utworzenia: ${task.created_at}`);
    doc.moveDown();
    doc.fontSize(14).text('Adres i lokalizacja');
    doc.fontSize(12).text(`Adres: ${task.address || ''}`);
    doc.text(`Współrzędne: ${task.lat || ''}, ${task.lng || ''}`);
    if (task.lat && task.lng) {
      const osmLink = `https://www.openstreetmap.org/?mlat=${task.lat}&mlon=${task.lng}#map=18/${task.lat}/${task.lng}`;
      doc.moveDown();
      doc.text('Mapa:');
      doc.fillColor('blue').text(osmLink, { link: osmLink });
      doc.fillColor('black');
    }
    doc.moveDown();
    doc.fontSize(14).text('Opis zlecenia');
    doc.fontSize(12).text(task.description || '');

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/tasks', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, description, assigned_to, address, lat, lng, status, priority } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO tasks(title, description, assigned_to, status, priority, address, lat, lng) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [title, description, assigned_to, status || 'utworzony', priority || 'med', address || null, lat || null, lng || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/tasks/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { status, fault, repair_procedure, assigned_to, address, lat, lng } = req.body;
  try {
    // fetch task
    const existing = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const task = existing.rows[0];
    // allow if admin or assigned user
    if (req.user.role !== 'admin' && req.user.username !== task.assigned_to) {
      return res.status(403).json({ error: 'forbidden' });
    }
    await pool.query(
      'UPDATE tasks SET status=$1, fault=$2, repair_procedure=$3, assigned_to=$4, address=$5, lat=$6, lng=$7 WHERE id=$8',
      [status || task.status, fault || task.fault, repair_procedure || task.repair_procedure, assigned_to || task.assigned_to, address || task.address, lat || task.lat, lng || task.lng, id]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root: serve the frontend page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
