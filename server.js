require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// Health
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Tasks CRUD
app.get('/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/tasks', async (req, res) => {
  try {
    const { title, description, assigned_to } = req.body;
    const result = await pool.query(
      "INSERT INTO tasks (title, description, status, assigned_to) VALUES ($1, $2, 'nowe', $3) RETURNING id",
      [title, description, assigned_to]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { status, fault, repair_procedure } = req.body;
    await pool.query(
      'UPDATE tasks SET status=$1, fault=$2, repair_procedure=$3 WHERE id=$4',
      [status, fault, repair_procedure, id]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on port ${port}`));
