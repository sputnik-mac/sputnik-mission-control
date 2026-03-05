const router = require("express").Router();
const { GATEWAY, TOKEN } = require("../config");

// GET /api/status
router.get("/status", async (req, res) => {
  const status = {
    agent: "Sputnik",
    model: "anthropic/claude-sonnet-4-6",
    gateway: false,
    ollama: false,
    timestamp: new Date().toISOString(),
  };
  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openclaw:main", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(3000),
    });
    status.gateway = r.status < 500;
  } catch {}
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    status.ollama = r.ok;
  } catch {}
  res.json(status);
});

// GET /api/memories (count only)
router.get("/memories", async (req, res) => {
  try {
    const r = await fetch("http://localhost:6333/collections/sputnik-memory", { signal: AbortSignal.timeout(2000) });
    const data = await r.json();
    res.json({ count: data?.result?.points_count ?? 0 });
  } catch { res.json({ count: 0 }); }
});

module.exports = router;
