const router = require("express").Router();
const Database = require("better-sqlite3");
const { SQLITE_PATH } = require("../config");

let db;
try {
  db = new Database(SQLITE_PATH, { readonly: true });
  console.log("[sqlite] Connected to personal.sqlite");
} catch (e) {
  db = null;
  console.warn("[sqlite] Not available:", e.message);
}

// GET /api/sqlite/timeline
router.get("/sqlite/timeline", (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = db.prepare("SELECT * FROM timeline ORDER BY ts DESC LIMIT ?").all(parseInt(req.query.limit) || 20);
    res.json(rows);
  } catch { res.json([]); }
});

// GET /api/sqlite/entities
router.get("/sqlite/entities", (req, res) => {
  if (!db) return res.json([]);
  try {
    const domain = req.query.domain;
    const limit = parseInt(req.query.limit) || 20;
    const rows = domain
      ? db.prepare("SELECT * FROM entities WHERE domain = ? ORDER BY updated_at DESC LIMIT ?").all(domain, limit)
      : db.prepare("SELECT * FROM entities ORDER BY updated_at DESC LIMIT ?").all(limit);
    res.json(rows);
  } catch { res.json([]); }
});

// GET /api/sqlite/decisions
router.get("/sqlite/decisions", (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = db.prepare("SELECT * FROM decisions ORDER BY ts DESC LIMIT ?").all(parseInt(req.query.limit) || 20);
    res.json(rows);
  } catch { res.json([]); }
});

module.exports = router;
