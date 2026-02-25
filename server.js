require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

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
    status VARCHAR(50) DEFAULT 'nowe',
    assigned_to VARCHAR(100),
    assigned_by VARCHAR(100) DEFAULT 'kierownik',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).then(() => console.log('Table ready')).catch(console.error);

app.get('/health', (req, res) => res.json({ status: 'OK' }));

app.get('/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/tasks', async (req, res) => {
  const { title, description, assigned_to } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO tasks(title, description, assigned_to, status) VALUES($1, $2, $3, 'nowe') RETURNING id",
      [title, description, assigned_to]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/tasks/:id', async (req, res) => {
  const id = req.params.id;
  const { status, fault, repair_procedure } = req.body;
  try {
    await pool.query(
      'UPDATE tasks SET status=$1, fault=$2, repair_procedure=$3 WHERE id=$4',
      [status, fault, repair_procedure, id]
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
