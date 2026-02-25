require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const fs = require('fs');

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

  // Add timing and signature columns
  pool.query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS start_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS end_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS executor_signature TEXT,
    ADD COLUMN IF NOT EXISTS receiver_signature TEXT,
    ADD COLUMN IF NOT EXISTS repair_short TEXT
  `).then(() => console.log('Tasks table ensured timing/signature columns')).catch(console.error);

  // photos table
  pool.query(`
    CREATE TABLE IF NOT EXISTS task_photos (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      uploaded_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).then(()=>console.log('task_photos table ready')).catch(console.error);

  // history table
  pool.query(`
    CREATE TABLE IF NOT EXISTS task_history (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      username VARCHAR(100),
      action TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).then(()=>console.log('task_history table ready')).catch(console.error);

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
    const result = await pool.query("SELECT *, EXTRACT(EPOCH FROM (end_time - start_time)) AS duration_seconds FROM tasks ORDER BY created_at DESC");
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
    doc.text(`Priorytet: ${task.priority || ''}`);
    doc.text(`Przypisany do: ${task.assigned_to || ''}`);
    doc.text(`Przypisany przez: ${task.assigned_by || ''}`);
    doc.text(`Data utworzenia: ${task.created_at}`);
    doc.text(`Rozpoczęcie: ${task.start_time || ''}`);
    doc.text(`Zakończenie: ${task.end_time || ''}`);
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
    doc.moveDown();
    doc.fontSize(14).text('Krótkie podsumowanie naprawy');
    doc.fontSize(12).text(task.repair_short || '');

    // signatures
    if (task.executor_signature) {
      try{
        const parts = task.executor_signature.split(',');
        const b64 = parts.length>1 ? parts[1] : parts[0];
        const buf = Buffer.from(b64, 'base64');
        doc.addPage();
        doc.fontSize(12).text('Podpis wykonawcy:', { underline: true });
        doc.image(buf, { width: 250 });
      }catch(e){ console.warn('Could not render executor signature', e); }
    }
    if (task.receiver_signature) {
      try{
        const parts = task.receiver_signature.split(',');
        const b64 = parts.length>1 ? parts[1] : parts[0];
        const buf = Buffer.from(b64, 'base64');
        doc.moveDown();
        doc.fontSize(12).text('Podpis odbiorcy:', { underline: true });
        doc.image(buf, { width: 250 });
      }catch(e){ console.warn('Could not render receiver signature', e); }
    }

    // include photos if present
    try{
      const photos = await pool.query('SELECT filename FROM task_photos WHERE task_id=$1 ORDER BY created_at', [id]);
      if(photos.rows.length){
        doc.addPage();
        doc.fontSize(14).text('Zdjęcia:', { underline: true });
        for(const p of photos.rows){
          const filePath = path.join(__dirname, 'public', 'uploads', p.filename);
          if(fs.existsSync(filePath)){
            try{ doc.addPage(); doc.image(filePath, { fit:[400,400], align:'center' }); }catch(e){ console.warn('Could not add photo to PDF', e); }
          }
        }
      }
    }catch(e){ console.warn('Photos to PDF failed', e); }

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
    const id = result.rows[0].id;
    await pool.query('INSERT INTO task_history(task_id, username, action, details) VALUES($1,$2,$3,$4)', [id, req.user.username, 'created', JSON.stringify({title,assigned_to})]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/tasks/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { status, fault, repair_procedure, assigned_to, address, lat, lng, start_time, end_time, executor_signature, receiver_signature, repair_short, priority } = req.body;
  try {
    // fetch task
    const existing = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const task = existing.rows[0];
    // allow if admin or assigned user
    if (req.user.role !== 'admin' && req.user.username !== task.assigned_to) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // set start_time automatically when moving to 'w trakcie'
    let newStart = task.start_time;
    let newEnd = task.end_time;
    if (status === 'w trakcie' && !task.start_time) {
      newStart = new Date();
    }
    if (status === 'zakończony' && !task.end_time) {
      newEnd = new Date();
    }

    await pool.query(
      `UPDATE tasks SET status=$1, fault=$2, repair_procedure=$3, assigned_to=$4, address=$5, lat=$6, lng=$7, start_time=$8, end_time=$9, executor_signature=$10, receiver_signature=$11, repair_short=$12, priority=$13 WHERE id=$14`,
      [status || task.status, fault || task.fault, repair_procedure || task.repair_procedure, assigned_to || task.assigned_to, address || task.address, lat || task.lat, lng || task.lng, start_time || newStart, end_time || newEnd, executor_signature || task.executor_signature, receiver_signature || task.receiver_signature, repair_short || task.repair_short, priority || task.priority, id]
    );
    await pool.query('INSERT INTO task_history(task_id, username, action, details) VALUES($1,$2,$3,$4)', [id, req.user.username, 'updated', JSON.stringify(req.body)]);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root: serve the frontend page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload photos
const uploadDir = path.join(__dirname, 'public', 'uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({ destination: uploadDir, filename: (req,file,cb)=>{ cb(null, Date.now() + '-' + file.originalname); } });
const upload = multer({ storage });

app.post('/tasks/:id/photos', requireAuth, upload.single('photo'), async (req,res)=>{
  const id = req.params.id;
  if(!req.file) return res.status(400).json({ error: 'no file' });
  try{
    await pool.query('INSERT INTO task_photos(task_id, filename, uploaded_by) VALUES($1,$2,$3)', [id, req.file.filename, req.user.username]);
    res.json({ filename: req.file.filename });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/tasks/:id/photos', requireAuth, async (req,res)=>{
  const id = req.params.id;
  try{
    const r = await pool.query('SELECT id, filename, uploaded_by, created_at FROM task_photos WHERE task_id=$1 ORDER BY created_at', [id]);
    res.json(r.rows);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// task history
app.get('/tasks/:id/history', requireAuth, async (req,res)=>{
  const id = req.params.id;
  try{
    const r = await pool.query('SELECT username, action, details, created_at FROM task_history WHERE task_id=$1 ORDER BY created_at DESC', [id]);
    res.json(r.rows);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
