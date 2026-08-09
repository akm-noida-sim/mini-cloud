const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const DB_PATH = path.join(ROOT_DIR, 'nebula.db');

// Create directories if they don't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

// ─── SQLite Database Setup ─────────────────────────────────
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'file',
      mime_type TEXT,
      stored_name TEXT,
      url TEXT,
      trashed INTEGER DEFAULT 0,
      starred INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
});

// ─── Multer Storage Config ─────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/\s+/g, '_')
      .replace(/[^\w.\-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

// ─── API: Get all files ────────────────────────────────────
app.get('/api/files', (req, res) => {
  const view = req.query.view || 'all';

  let sql;
  if (view === 'trash') {
    sql = `SELECT * FROM files WHERE trashed = 1 ORDER BY datetime(created_at) DESC`;
  } else if (view === 'starred') {
    sql = `SELECT * FROM files WHERE starred = 1 AND trashed = 0 ORDER BY datetime(created_at) DESC`;
  } else {
    sql = `SELECT * FROM files WHERE trashed = 0 ORDER BY datetime(created_at) DESC`;
  }

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── API: Upload files ─────────────────────────────────────
app.post('/api/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const stmt = db.prepare(`
    INSERT INTO files (name, size, kind, mime_type, stored_name, url)
    VALUES (?, ?, 'file', ?, ?, ?)
  `);

  req.files.forEach((file) => {
    stmt.run(
      file.originalname,
      file.size,
      file.mimetype,
      file.filename,
      `/uploads/${file.filename}`
    );
  });

  stmt.finalize((err) => {
    if (err) return res.status(500).json({ error: err.message });

    logActivity('upload', `📄 ${req.files.length} file(s) uploaded`);
    res.json({ success: true, uploaded: req.files.length });
  });
});

// ─── API: Create folder ────────────────────────────────────
app.post('/api/folders', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Folder name required' });

  db.run(
    `INSERT INTO files (name, size, kind) VALUES (?, 0, 'folder')`,
    [name],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      logActivity('create_folder', `📁 Folder "${name}" created`);
      res.json({ success: true, id: this.lastID });
    }
  );
});

// ─── API: Move to trash ────────────────────────────────────
app.patch('/api/files/:id/trash', (req, res) => {
  db.run(
    `UPDATE files SET trashed = 1 WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ─── API: Restore from trash ───────────────────────────────
app.patch('/api/files/:id/restore', (req, res) => {
  db.run(
    `UPDATE files SET trashed = 0 WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ─── API: Permanently delete file ──────────────────────────
app.delete('/api/files/:id', (req, res) => {
  db.get(`SELECT * FROM files WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'File not found' });

    const deleteFromDb = () => {
      db.run(`DELETE FROM files WHERE id = ?`, [req.params.id], function (delErr) {
        if (delErr) return res.status(500).json({ error: delErr.message });
        logActivity('delete', `🗑️ "${row.name}" deleted permanently`);
        res.json({ success: true });
      });
    };

    if (row.stored_name) {
      const filePath = path.join(UPLOAD_DIR, row.stored_name);
      fs.unlink(filePath, () => deleteFromDb());
    } else {
      deleteFromDb();
    }
  });
});

// ─── API: Get activity log ─────────────────────────────────
app.get('/api/activity', (req, res) => {
  db.all(
    `SELECT * FROM activity ORDER BY datetime(timestamp) DESC LIMIT 20`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ─── API: Storage stats ────────────────────────────────────
app.get('/api/stats', (req, res) => {
  db.get(
    `SELECT COALESCE(SUM(size), 0) AS totalBytes,
            COUNT(*) AS totalFiles
     FROM files WHERE trashed = 0`,
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        usedBytes: row.totalBytes,
        totalBytes: 20 * 1024 * 1024 * 1024, // 20 GB virtual limit
        totalFiles: row.totalFiles,
        uploadsToday: 0 // simplified for now
      });
    }
  );
});

// ─── Helper: Log activity ──────────────────────────────────
function logActivity(type, title, subtitle = '') {
  db.run(
    `INSERT INTO activity (type, title, subtitle) VALUES (?, ?, ?)`,
    [type, title, subtitle]
  );
}

// ─── Start Server ──────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🚀 Nebula Cloud running at:\n`);
  console.log(`  →  http://localhost:${PORT}`);
  console.log(`  →  http://YOUR_PC_IP:${PORT}  (other devices on same Wi-Fi)\n`);
});
