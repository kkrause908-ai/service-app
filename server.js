try { require('dotenv').config(); } catch (e) { /* dotenv not installed in production image */ }
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const fs = require('fs');

// Security and validation
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production';

const app = express();
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb' }));
app.use(mongoSanitize());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 100, // limit każdego IP do 100 requestów
  message: 'Zbyt wiele żądań, spróbuj później'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 prób logowania na IP
  message: 'Zbyt wiele prób logowania, spróbuj za 15 minut'
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 uploadów na minutę
  message: 'Zbyt wiele uploadów'
});

app.use(limiter);

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

  // Event log table for security auditing
  pool.query(`
    CREATE TABLE IF NOT EXISTS event_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(100),
      action VARCHAR(255),
      resource VARCHAR(255),
      details TEXT,
      ip_address VARCHAR(45),
      status VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).then(()=>console.log('event_logs table ready')).catch(console.error);

  // seed some demo tasks when database empty
// this helps frontend show something out of the box
(async function seedTasks(){
  try{
    const cnt = await pool.query('SELECT COUNT(*) FROM tasks');
    if(+cnt.rows[0].count === 0){
      console.log('Seeding demo tasks');
      await pool.query(`
        INSERT INTO tasks(title,description,status,priority,assigned_to,address) VALUES
          ('Pierwsze zlecenie','Testowy opis','utworzony','med','user','ul. Przykładowa 1'),
          ('Awaria sieci','Sprawdź połączenie','w trakcie','high','user','ul. Druga 2'),
          ('Serwis urządzenia','Regularny przegląd','zakończony','low','admin','ul. Trzecia 3')
      `);
    }
  }catch(e){ console.error('Task seeding failed', e); }
})();

// Seed admin user with retry (in case tables aren't ready yet)
if (process.env.ADMIN_PASSWORD) {
  (async () => {
    for (let i = 0; i < 20; i++) {
      try {
        const { rows } = await pool.query('SELECT id FROM users WHERE username=$1', ['admin']);
        if (rows.length === 0) {
          const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
          await pool.query('INSERT INTO users(username,password,role) VALUES($1,$2,$3)', ['admin', hashed, 'admin']);
          console.log('Admin user created: username=admin');
        }
        break;
      } catch (e) {
        // likely table not ready yet; wait and retry
        await new Promise(res => setTimeout(res, 1000));
      }
    }
    // ensure default test user exists
    try {
      const { rows: urows } = await pool.query('SELECT id FROM users WHERE username=$1', ['user']);
      if (urows.length === 0) {
        const hup = await bcrypt.hash(process.env.DEFAULT_USER_PASSWORD || 'user123', 10);
        await pool.query('INSERT INTO users(username,password,role) VALUES($1,$2,$3)', ['user', hup, 'user']);
        console.log('Default user created: username=user');
      }
    } catch (e) {
      console.error('Error ensuring default user', e);
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


// list tasks with optional filters (q, status, assigned_to) and pagination
app.get('/tasks', async (req, res) => {
  try {
    const { q, status, priority, assigned_to, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;
    
    const where = [];
    const params = [];
    let idx = 1;
    
    if (q) {
      where.push(`(title ILIKE $${idx} OR description ILIKE $${idx} OR address ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    if (status) {
      where.push(`status=$${idx}`);
      params.push(status);
      idx++;
    }
    if (priority) {
      where.push(`priority=$${idx}`);
      params.push(priority);
      idx++;
    }
    if (assigned_to) {
      where.push(`assigned_to=$${idx}`);
      params.push(assigned_to);
      idx++;
    }
    
    let sql = "SELECT *, EXTRACT(EPOCH FROM (end_time - start_time)) AS duration_seconds FROM tasks";
    if (where.length) sql += " WHERE " + where.join(' AND ');
    
    // Get total count
    const countSql = "SELECT COUNT(*) as count FROM tasks" + (where.length ? " WHERE " + where.join(' AND ') : "");
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count);
    
    sql += " ORDER BY created_at DESC LIMIT $" + (idx) + " OFFSET $" + (idx + 1);
    params.push(limitNum, offset);
    
    const result = await pool.query(sql, params);
    res.json({
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get single task details (authenticated)
app.get('/tasks/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const task = result.rows[0];
    // allow if admin or assigned user
    if (req.user.role !== 'admin' && req.user.username !== task.assigned_to) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Authentication endpoints ---
app.post('/register', authLimiter, async (req, res) => {
  const { username, password, role } = req.body || {};
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!username || !password) {
    await logEvent(null, username, 'register_attempt', 'auth', 'Invalid input', ip, 'failure');
    return res.status(400).json({ error: 'username and password required' });
  }
  if (username.length < 3 || username.length > 50) {
    await logEvent(null, username, 'register_attempt', 'auth', 'Username invalid length', ip, 'failure');
    return res.status(400).json({ error: 'username must be 3-50 characters' });
  }
  if (password.length < 6) {
    await logEvent(null, username, 'register_attempt', 'auth', 'Password too short', ip, 'failure');
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users(username,password,role) VALUES($1,$2,$3) RETURNING id, username, role',
      [username, hashed, role || 'user']
    );
    await logEvent(result.rows[0].id, username, 'register_success', 'auth', null, ip, 'success');
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      await logEvent(null, username, 'register_attempt', 'auth', 'Username exists', ip, 'failure');
      return res.status(400).json({ error: 'username already exists' });
    }
    await logEvent(null, username, 'register_attempt', 'auth', err.message, ip, 'failure');
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!username || !password) {
    await logEvent(null, username, 'login_attempt', 'auth', 'Missing credentials', ip, 'failure');
    return res.status(400).json({ error: 'username and password required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (result.rows.length === 0) {
      await logEvent(null, username, 'login_attempt', 'auth', 'User not found', ip, 'failure');
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      await logEvent(user.id, username, 'login_attempt', 'auth', 'Wrong password', ip, 'failure');
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    await logEvent(user.id, username, 'login_success', 'auth', null, ip, 'success');
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    await logEvent(null, username, 'login_attempt', 'auth', err.message, ip, 'failure');
    res.status(500).json({ error: 'Internal server error' });
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

// Logging helper function
async function logEvent(userId, username, action, resource, details, ip, status = 'success') {
  try {
    await pool.query(
      'INSERT INTO event_logs(user_id, username, action, resource, details, ip_address, status) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [userId || null, username || 'anonymous', action, resource, details, ip, status]
    );
  } catch (e) {
    console.error('Event logging failed:', e.message);
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

// Migration & seed initialization: ensure schema exists before server starts
async function ensureSchemaAndSeed() {
  // Create/alter tables to include required columns
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      fault TEXT,
      repair_procedure TEXT,
      status VARCHAR(50) DEFAULT 'utworzony',
      assigned_to VARCHAR(100),
      assigned_by VARCHAR(100) DEFAULT 'kierownik',
      address TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      priority VARCHAR(10) DEFAULT 'med',
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      executor_signature TEXT,
      receiver_signature TEXT,
      repair_short TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION
  `);

  await pool.query(`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'med'
  `);

  await pool.query(`
    ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'utworzony'
  `);

  await pool.query(`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS start_time TIMESTAMP,
      ADD COLUMN IF NOT EXISTS end_time TIMESTAMP,
      ADD COLUMN IF NOT EXISTS executor_signature TEXT,
      ADD COLUMN IF NOT EXISTS receiver_signature TEXT,
      ADD COLUMN IF NOT EXISTS repair_short TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_photos (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      uploaded_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_history (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      username VARCHAR(100),
      action TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(100),
      action VARCHAR(255),
      resource VARCHAR(255),
      details TEXT,
      ip_address VARCHAR(45),
      status VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed demo data if needed
  try {
    const cnt = await pool.query('SELECT COUNT(*) FROM tasks');
    if (+cnt.rows[0].count === 0) {
      await pool.query(`
        INSERT INTO tasks(title,description,status,priority,assigned_to,address) VALUES
          ('Pierwsze zlecenie','Testowy opis','utworzony','med','user','ul. Przykładowa 1'),
          ('Awaria sieci','Sprawdź połączenie','w trakcie','high','user','ul. Druga 2'),
          ('Serwis urządzenia','Regularny przegląd','zakończony','low','admin','ul. Trzecia 3')
      `);
    }
  } catch (e) {
    // ignore seed error here; we'll retry on next start
  }

  // Admin & default user seeds (respect .env)
  if (process.env.ADMIN_PASSWORD) {
    try {
      const { rows } = await pool.query('SELECT id FROM users WHERE username=$1', ['admin']);
      if (rows.length === 0) {
        const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        await pool.query('INSERT INTO users(username,password,role) VALUES($1,$2,$3)', ['admin', hashed, 'admin']);
        console.log('Admin user created: username=admin');
      }
    } catch (e) {
      // ignore
    }
  }
  try {
    const { rows: urows } = await pool.query('SELECT id FROM users WHERE username=$1', ['user']);
    if (urows.length === 0) {
      const hup = await bcrypt.hash(process.env.DEFAULT_USER_PASSWORD || 'user123', 10);
      await pool.query('INSERT INTO users(username,password,role) VALUES($1,$2,$3)', ['user', hup, 'user']);
      console.log('Default user created: username=user');
    }
  } catch (e) {
    // ignore
  }
}

// Statistics endpoint
app.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM tasks) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE status='utworzony') as new_tasks,
        (SELECT COUNT(*) FROM tasks WHERE status='w trakcie') as in_progress,
        (SELECT COUNT(*) FROM tasks WHERE status='zakończony') as completed,
        (SELECT COUNT(*) FROM tasks WHERE priority='high') as high_priority,
        (SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))) FROM tasks WHERE end_time IS NOT NULL) as avg_duration,
        (SELECT COUNT(DISTINCT assigned_to) FROM tasks) as total_techs,
        (SELECT COUNT(*) FROM users) as total_users
    `);
    res.json(stats.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

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

// Delete task (admin only)
app.delete('/tasks/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  try {
    const existing = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'not found' });
    await pool.query('DELETE FROM task_photos WHERE task_id=$1', [id]);
    await pool.query('DELETE FROM task_history WHERE task_id=$1', [id]);
    await pool.query('DELETE FROM tasks WHERE id=$1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root: serve the frontend page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
// Upload photos with validation and size limit
const uploadDir = path.join(__dirname, 'public', 'uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(new Error('Tylko pliki JPEG, PNG i WebP są dozwolone'));
  } else {
    cb(null, true);
  }
};

const storage = multer.diskStorage({ 
  destination: uploadDir, 
  filename: (req, file, cb) => { 
    cb(null, Date.now() + '-' + path.basename(file.originalname)); 
  } 
});

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

app.post('/tasks/:id/photos', requireAuth, uploadLimiter, upload.single('photo'), async (req, res) => {
  const id = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'no file provided' });
  
  try {
    // Verify task exists and user has access
    const task = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
    if (task.rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'task not found' });
    }
    
    const t = task.rows[0];
    if (req.user.role !== 'admin' && req.user.username !== t.assigned_to) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'forbidden' });
    }

    await pool.query(
      'INSERT INTO task_photos(task_id, filename, uploaded_by) VALUES($1,$2,$3)',
      [id, req.file.filename, req.user.username]
    );
    
    await logEvent(req.user.id, req.user.username, 'upload_photo', 'task_' + id, req.file.filename, req.ip, 'success');
    res.json({ filename: req.file.filename, size: req.file.size });
  } catch (e) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'upload failed' });
  }
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
(async () => {
  try {
    await ensureSchemaAndSeed();
  } catch (e) {
    console.error('Initialization failed', e);
    process.exit(1);
  }
  app.listen(port, () => console.log(`Server running on port ${port}`));
})();
