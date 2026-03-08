const router = require("express").Router();
const { randomUUID } = require("crypto");
const Database = require("better-sqlite3");
const { SQLITE_PATH, GATEWAY, TOKEN } = require("../config");

let db;
try {
  db = new Database(SQLITE_PATH, { readonly: true });
} catch (e) {
  db = null;
  console.warn("[health] SQLite not available:", e.message);
}

// In-memory job queue for Doc chat
const jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 60 * 1000);

// GET /api/health/dashboard
router.get("/health/dashboard", (req, res) => {
  if (!db) return res.json({ error: "db not available" });
  try {
    // Activity stats
    const activityStats = db.prepare(`
      SELECT COUNT(*) as days, ROUND(AVG(steps)) as avg_steps, MAX(steps) as max_steps,
        MIN(date) as from_date, MAX(date) as to_date,
        ROUND(AVG(calories)) as avg_calories, ROUND(AVG(distance),1) as avg_distance
      FROM zepp_activity WHERE steps > 100
    `).get();

    // Sleep stats
    const sleepStats = db.prepare(`
      SELECT ROUND(AVG((deep_sleep_min+shallow_sleep_min+rem_min)/60.0),1) as avg_h,
        ROUND(AVG(deep_sleep_min),0) as avg_deep,
        ROUND(AVG(shallow_sleep_min),0) as avg_shallow,
        ROUND(AVG(rem_min),0) as avg_rem
      FROM zepp_sleep WHERE (deep_sleep_min+shallow_sleep_min) > 0
    `).get();

    // Avg heart rate
    const hrStats = db.prepare(`
      SELECT ROUND(AVG(heart_rate)) as avg_hr, MIN(heart_rate) as min_hr, MAX(heart_rate) as max_hr
      FROM zepp_heartrate WHERE heart_rate > 30 AND heart_rate < 220
    `).get();

    // Steps timeline (last 90 days of data)
    const stepsTimeline = db.prepare(`
      SELECT date, steps, calories, distance
      FROM zepp_activity WHERE steps > 0
      ORDER BY date DESC LIMIT 90
    `).all().reverse();

    // Sleep breakdown by week
    const sleepWeekly = db.prepare(`
      SELECT strftime('%Y-W%W', date) as week,
        ROUND(AVG(deep_sleep_min),0) as deep,
        ROUND(AVG(shallow_sleep_min),0) as shallow,
        ROUND(AVG(rem_min),0) as rem
      FROM zepp_sleep WHERE (deep_sleep_min+shallow_sleep_min) > 0
      GROUP BY week ORDER BY week
    `).all();

    // Weight trend
    const weightTrend = db.prepare(`
      SELECT substr(time,1,10) as date, weight, bmi, fat_rate
      FROM zepp_body WHERE weight > 10
      ORDER BY time ASC
    `).all();

    // Heart rate distribution
    const hrDistribution = db.prepare(`
      SELECT
        SUM(CASE WHEN heart_rate < 60 THEN 1 ELSE 0 END) as under60,
        SUM(CASE WHEN heart_rate >= 60 AND heart_rate < 80 THEN 1 ELSE 0 END) as r60_80,
        SUM(CASE WHEN heart_rate >= 80 AND heart_rate < 100 THEN 1 ELSE 0 END) as r80_100,
        SUM(CASE WHEN heart_rate >= 100 THEN 1 ELSE 0 END) as over100
      FROM zepp_heartrate WHERE heart_rate > 30 AND heart_rate < 220
    `).get();

    // Insights - days with <5k steps
    const lowStepsDays = db.prepare(`
      SELECT COUNT(*) as cnt FROM zepp_activity WHERE steps > 0 AND steps < 5000
    `).get();
    const totalDays = db.prepare(`
      SELECT COUNT(*) as cnt FROM zepp_activity WHERE steps > 0
    `).get();

    // Insights - nights with <6h sleep
    const lowSleepNights = db.prepare(`
      SELECT COUNT(*) as cnt FROM zepp_sleep
      WHERE (deep_sleep_min+shallow_sleep_min+rem_min) < 360
      AND (deep_sleep_min+shallow_sleep_min) > 0
    `).get();
    const totalSleepNights = db.prepare(`
      SELECT COUNT(*) as cnt FROM zepp_sleep WHERE (deep_sleep_min+shallow_sleep_min) > 0
    `).get();

    // HR anomalies >120
    const hrAnomalies = db.prepare(`
      SELECT COUNT(*) as cnt FROM zepp_heartrate WHERE heart_rate > 120 AND heart_rate < 220
    `).get();
    const totalHr = db.prepare(`
      SELECT COUNT(*) as cnt FROM zepp_heartrate WHERE heart_rate > 30 AND heart_rate < 220
    `).get();

    // Best month by sleep
    const bestSleepMonth = db.prepare(`
      SELECT strftime('%Y-%m', date) as month,
        ROUND(AVG((deep_sleep_min+shallow_sleep_min+rem_min)/60.0),1) as avg_h
      FROM zepp_sleep WHERE (deep_sleep_min+shallow_sleep_min) > 0
      GROUP BY month ORDER BY avg_h DESC LIMIT 1
    `).get();

    // Best steps day
    const bestStepsDay = db.prepare(`
      SELECT date, steps FROM zepp_activity ORDER BY steps DESC LIMIT 1
    `).get();

    res.json({
      activityStats, sleepStats, hrStats,
      stepsTimeline, sleepWeekly, weightTrend, hrDistribution,
      insights: {
        lowStepsPct: totalDays.cnt > 0 ? Math.round(lowStepsDays.cnt / totalDays.cnt * 100) : 0,
        lowSleepPct: totalSleepNights.cnt > 0 ? Math.round(lowSleepNights.cnt / totalSleepNights.cnt * 100) : 0,
        hrAnomalyPct: totalHr.cnt > 0 ? Math.round(hrAnomalies.cnt / totalHr.cnt * 100) : 0,
        bestSleepMonth, bestStepsDay,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/health/streaks
router.get("/health/streaks", (req, res) => {
  if (!db) return res.json({ current: 0, best: 0, heatmap: [] });
  try {
    const days = db.prepare(`
      SELECT date, steps FROM zepp_activity WHERE steps > 0 ORDER BY date ASC
    `).all();

    let current = 0, best = 0, streak = 0;
    for (let i = 0; i < days.length; i++) {
      if (days[i].steps >= 8000) {
        streak++;
        if (streak > best) best = streak;
      } else {
        streak = 0;
      }
    }
    current = streak;

    // Last 60 days heatmap
    const heatmap = db.prepare(`
      SELECT date, steps FROM zepp_activity WHERE steps > 0 ORDER BY date DESC LIMIT 60
    `).all().reverse();

    res.json({ current, best, heatmap });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/health/chat
router.post("/health/chat", (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending", text: null, error: null, createdAt: Date.now() });

  // Build context with user stats
  let context = "";
  if (db) {
    try {
      const stats = db.prepare(`
        SELECT ROUND(AVG(steps)) as avg_steps, MAX(steps) as max_steps
        FROM zepp_activity WHERE steps > 100
      `).get();
      const sleep = db.prepare(`
        SELECT ROUND(AVG((deep_sleep_min+shallow_sleep_min+rem_min)/60.0),1) as avg_h
        FROM zepp_sleep WHERE (deep_sleep_min+shallow_sleep_min) > 0
      `).get();
      const hr = db.prepare(`
        SELECT ROUND(AVG(heart_rate)) as avg_hr
        FROM zepp_heartrate WHERE heart_rate > 30 AND heart_rate < 220
      `).get();
      const body = db.prepare(`
        SELECT weight, bmi FROM zepp_body WHERE weight > 10 ORDER BY time DESC LIMIT 1
      `).get();
      context = `[Health Context] Avg steps: ${stats?.avg_steps}, Avg sleep: ${sleep?.avg_h}h, Avg HR: ${hr?.avg_hr}bpm, Weight: ${body?.weight}kg, BMI: ${body?.bmi}. `;
    } catch {}
  }

  const canvasInstr = `\n\n[CANVAS INSTRUCTION] After your main answer, append a <CANVAS> block with a visual for the dashboard board. Choose the best format:
- For recommendations: <CANVAS type="actions" title="Action Plan">{"items":[{"title":"TITLE","body":"description"}]}</CANVAS>
- For stats comparison: <CANVAS type="stats" title="My Stats">{"items":[{"label":"name","value":123,"display":"123 unit","color":"rgba(0,200,255,.8)"}]}</CANVAS>
- For a flow/process: <CANVAS type="mermaid" title="Flow">flowchart LR\n  A[Start]-->B[End]</CANVAS>
Keep it short and data-driven. Use the health context provided.`;

  processDocChat(jobId, context + message + canvasInstr);
  res.json({ jobId, status: "pending" });
});

// GET /api/health/chat/:jobId
router.get("/health/chat/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

async function processDocChat(jobId, message) {
  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "x-openclaw-agent-id": "health",
        "x-openclaw-session-key": "agent:health:studio",
      },
      body: JSON.stringify({
        model: "openclaw:health",
        messages: [{ role: "user", content: message }],
        stream: false,
        session_key: "agent:health:studio",
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!r.ok) {
      const err = await r.text();
      jobs.set(jobId, { ...jobs.get(jobId), status: "error", error: `Gateway ${r.status}: ${err.slice(0, 200)}` });
      return;
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    jobs.set(jobId, { ...jobs.get(jobId), status: "done", text });
  } catch (err) {
    jobs.set(jobId, { ...jobs.get(jobId), status: "error", error: err.message });
  }
}

module.exports = router;
