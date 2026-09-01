import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import { DBSCAN } from './algorithms/dbscan.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let db;

async function initDB() {
  const SQL = await initSqlJs();
  
  const dbPath = path.join(__dirname, '..', 'data.db');
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      category TEXT,
      price REAL,
      contact TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      code TEXT,
      author TEXT,
      github TEXT,
      downloads INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  saveDB();
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbPath = path.join(__dirname, '..', 'data.db');
  fs.writeFileSync(dbPath, buffer);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

app.get('/api/items', (req, res) => {
  const { type, category, status } = req.query;
  let sql = 'SELECT * FROM items WHERE 1=1';
  const params = [];
  
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const items = queryAll(sql, params);
  res.json(items);
});

app.get('/api/items/:id', (req, res) => {
  const item = queryOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  res.json(item);
});

app.post('/api/items', (req, res) => {
  const { type, title, description, latitude, longitude, category, price, contact } = req.body;
  
  if (!type || !title || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const id = uuidv4();
  const now = new Date().toISOString();
  
  db.run(`
    INSERT INTO items (id, type, title, description, latitude, longitude, category, price, contact, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, type, title, description || null, latitude, longitude, category || null, price || null, contact || null, now, now]);
  
  saveDB();
  
  const newItem = queryOne('SELECT * FROM items WHERE id = ?', [id]);
  res.status(201).json(newItem);
});

app.put('/api/items/:id', (req, res) => {
  const { title, description, latitude, longitude, category, price, contact, status } = req.body;
  
  const existing = queryOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  const now = new Date().toISOString();
  
  db.run(`
    UPDATE items 
    SET title = ?, description = ?, latitude = ?, longitude = ?, category = ?, price = ?, contact = ?, status = ?, updated_at = ?
    WHERE id = ?
  `, [
    title ?? existing.title,
    description ?? existing.description,
    latitude ?? existing.latitude,
    longitude ?? existing.longitude,
    category ?? existing.category,
    price ?? existing.price,
    contact ?? existing.contact,
    status ?? existing.status,
    now,
    req.params.id
  ]);
  
  saveDB();
  
  const updated = queryOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
  res.json(updated);
});

app.delete('/api/items/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  db.run('DELETE FROM items WHERE id = ?', [req.params.id]);
  saveDB();
  res.status(204).send();
});

app.post('/api/cluster', (req, res) => {
  const { epsilon = 0.01, minPoints = 3, type } = req.body;
  
  let sql = 'SELECT * FROM items WHERE status = ?';
  const params = ['active'];
  
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  
  const items = queryAll(sql, params);
  
  if (items.length === 0) {
    return res.json({ clusters: [], noise: [] });
  }
  
  const points = items.map(item => ({
    id: item.id,
    coordinates: [item.longitude, item.latitude],
    data: item
  }));
  
  const dbscan = new DBSCAN(points, epsilon, minPoints);
  const result = dbscan.run();
  
  res.json(result);
});

app.get('/api/stats', (req, res) => {
  const stats = {
    total: queryOne('SELECT COUNT(*) as count FROM items')?.count || 0,
    secondhand: queryOne('SELECT COUNT(*) as count FROM items WHERE type = ?', ['secondhand'])?.count || 0,
    lostfound: queryOne('SELECT COUNT(*) as count FROM items WHERE type = ?', ['lostfound'])?.count || 0,
    emergency: queryOne('SELECT COUNT(*) as count FROM items WHERE type = ?', ['emergency'])?.count || 0,
    discussion: queryOne('SELECT COUNT(*) as count FROM items WHERE type = ?', ['discussion'])?.count || 0,
    active: queryOne('SELECT COUNT(*) as count FROM items WHERE status = ?', ['active'])?.count || 0
  };
  res.json(stats);
});

app.get('/api/plugins', (req, res) => {
  const plugins = queryAll('SELECT * FROM plugins ORDER BY created_at DESC');
  res.json(plugins);
});

app.get('/api/plugins/:id', (req, res) => {
  const plugin = queryOne('SELECT * FROM plugins WHERE id = ?', [req.params.id]);
  if (!plugin) {
    return res.status(404).json({ error: 'Plugin not found' });
  }
  res.json(plugin);
});

app.post('/api/plugins', (req, res) => {
  const { name, description, category, code, author, github } = req.body;
  
  if (!name || !code) {
    return res.status(400).json({ error: 'Name and code are required' });
  }
  
  const id = uuidv4();
  const now = new Date().toISOString();
  
  db.run(`
    INSERT INTO plugins (id, name, description, category, code, author, github, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, name, description || null, category || null, code, author || null, github || null, now]);
  
  saveDB();
  
  const newPlugin = queryOne('SELECT * FROM plugins WHERE id = ?', [id]);
  res.status(201).json(newPlugin);
});

app.put('/api/plugins/:id', (req, res) => {
  const { name, description, category, code, author, github } = req.body;
  
  const existing = queryOne('SELECT * FROM plugins WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Plugin not found' });
  }
  
  db.run(`
    UPDATE plugins 
    SET name = ?, description = ?, category = ?, code = ?, author = ?, github = ?
    WHERE id = ?
  `, [
    name ?? existing.name,
    description ?? existing.description,
    category ?? existing.category,
    code ?? existing.code,
    author ?? existing.author,
    github ?? existing.github,
    req.params.id
  ]);
  
  saveDB();
  
  const updated = queryOne('SELECT * FROM plugins WHERE id = ?', [req.params.id]);
  res.json(updated);
});

app.post('/api/plugins/:id/download', (req, res) => {
  const existing = queryOne('SELECT * FROM plugins WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Plugin not found' });
  }
  
  db.run('UPDATE plugins SET downloads = downloads + 1 WHERE id = ?', [req.params.id]);
  saveDB();
  
  res.json({ success: true });
});

app.delete('/api/plugins/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM plugins WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Plugin not found' });
  }
  
  db.run('DELETE FROM plugins WHERE id = ?', [req.params.id]);
  saveDB();
  res.status(204).send();
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
