const router = require("express").Router();
const { execSync } = require("child_process");

// GET /api/cron
router.get("/cron", async (req, res) => {
  try {
    const out = execSync("openclaw cron list --json 2>/dev/null", { timeout: 5000 }).toString();
    const raw = JSON.parse(out);
    const jobs = Array.isArray(raw) ? raw : (raw.jobs || []);
    const normalized = jobs.map(j => ({
      id: j.id,
      name: j.name || j.label || j.id,
      description: j.description || "",
      schedule: typeof j.schedule === "object"
        ? (j.schedule?.expr || j.schedule?.kind || JSON.stringify(j.schedule))
        : (j.schedule || j.cron || ""),
      tz: j.schedule?.tz || "",
      lastRunStatus: j.state?.lastRunStatus === "ok" ? "success" : (j.state?.lastRunStatus || null),
      lastRunAt: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : null,
      nextRunAt: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
      enabled: j.enabled !== false,
    }));
    res.json(normalized);
  } catch { res.json([]); }
});

// POST /api/cron/:id/run
router.post("/cron/:id/run", (req, res) => {
  try {
    execSync(`openclaw cron run ${req.params.id}`, { timeout: 10000 });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
