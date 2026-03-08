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

// GET /api/sqlite/health — Zepp summary
router.get("/sqlite/health", (req, res) => {
  if (!db) return res.json({ activity: [], sleep: [], body: [], heartrate: [] });
  try {
    const activity = db.prepare(`
      SELECT date, steps, distance, calories
      FROM zepp_activity WHERE steps > 0
      ORDER BY date DESC LIMIT 30
    `).all();
    const sleep = db.prepare(`
      SELECT date,
        deep_sleep_min, shallow_sleep_min, rem_min,
        ROUND((deep_sleep_min + shallow_sleep_min + rem_min) / 60.0, 1) as total_h,
        sleep_start, sleep_stop
      FROM zepp_sleep
      WHERE deep_sleep_min IS NOT NULL AND (deep_sleep_min + shallow_sleep_min) > 0
      ORDER BY date DESC LIMIT 30
    `).all();
    const body = db.prepare(`
      SELECT substr(time,1,10) as date, weight, bmi, fat_rate
      FROM zepp_body WHERE weight > 10
      ORDER BY time DESC LIMIT 20
    `).all();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as days,
        ROUND(AVG(steps)) as avg_steps,
        MAX(steps) as max_steps,
        MIN(date) as from_date,
        MAX(date) as to_date
      FROM zepp_activity WHERE steps > 100
    `).get();
    const sleepStats = db.prepare(`
      SELECT ROUND(AVG((deep_sleep_min+shallow_sleep_min+rem_min)/60.0),1) as avg_h,
        ROUND(AVG(deep_sleep_min),0) as avg_deep,
        ROUND(AVG(rem_min),0) as avg_rem
      FROM zepp_sleep WHERE (deep_sleep_min+shallow_sleep_min) > 0
    `).get();
    res.json({ activity, sleep, body, stats, sleepStats });
  } catch(e) { res.json({ error: e.message }); }
});

// GET /api/sqlite/patterns
router.get("/sqlite/patterns", (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = db.prepare("SELECT * FROM patterns WHERE active=1 ORDER BY ts DESC LIMIT 20").all();
    res.json(rows);
  } catch { res.json([]); }
});
