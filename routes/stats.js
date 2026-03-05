const router = require("express").Router();
const fs = require("fs");
const { execSync } = require("child_process");
const { OPENCLAW_HOME } = require("../config");

const PRICING = { input: 3 / 1e6, output: 15 / 1e6 };

// GET /api/stats/usage
router.get("/stats/usage", async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const byDay = {};
  const sessionsPath = `${OPENCLAW_HOME}/agents/main/sessions/sessions.json`;
  try {
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
    for (const [key, s] of Object.entries(sessions)) {
      if (!s.sessionFile) continue;
      try {
        const lines = fs.readFileSync(s.sessionFile, "utf8").split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const usage = obj.usage || obj.message?.usage || obj.result?.usage;
            if (!usage) continue;
            const inputTok = usage.input_tokens || usage.prompt_tokens || 0;
            const outputTok = usage.output_tokens || usage.completion_tokens || 0;
            if (!inputTok && !outputTok) continue;
            const ts = obj.timestamp || obj.ts || s.updatedAt;
            const date = ts ? new Date(ts).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
            if (!byDay[date]) byDay[date] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
            byDay[date].inputTokens += inputTok;
            byDay[date].outputTokens += outputTok;
            byDay[date].costUsd += inputTok * PRICING.input + outputTok * PRICING.output;
          } catch {}
        }
      } catch {}
    }
  } catch {}
  const result = Object.entries(byDay)
    .map(([date, v]) => ({ date, ...v, costUsd: +v.costUsd.toFixed(4) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
  const total = result.reduce((acc, d) => ({
    inputTokens: acc.inputTokens + d.inputTokens,
    outputTokens: acc.outputTokens + d.outputTokens,
    costUsd: +(acc.costUsd + d.costUsd).toFixed(4),
  }), { inputTokens: 0, outputTokens: 0, costUsd: 0 });
  res.json({ byDay: result, total });
});

// GET /api/stats/system
router.get("/stats/system", async (req, res) => {
  let uptimeSeconds = 0;
  try { uptimeSeconds = Math.floor(process.uptime()); } catch {}
  let qdrantMb = 0;
  try {
    const out = execSync("du -sm ~/.qdrant/storage 2>/dev/null").toString();
    qdrantMb = parseInt(out.split("\t")[0]) || 0;
  } catch {}
  let sessionCount = 0, sessionsMb = 0;
  try {
    const out = execSync("du -sc ~/.openclaw/agents/*/sessions/*.jsonl 2>/dev/null | tail -1").toString();
    sessionsMb = Math.round(parseInt(out.split("\t")[0]) / 1024) || 0;
    const sOut = execSync("ls ~/.openclaw/agents/*/sessions/*.jsonl 2>/dev/null | wc -l").toString();
    sessionCount = parseInt(sOut.trim()) || 0;
  } catch {}
  res.json({
    uptimeSeconds,
    uptimeHuman: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
    qdrantMb,
    sessionCount,
    sessionsMb,
    nodeVersion: process.version,
    pid: process.pid,
  });
});

module.exports = router;
