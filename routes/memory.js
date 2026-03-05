const router = require("express").Router();

// GET /api/memories/list (with optional semantic search)
router.get("/memories/list", async (req, res) => {
  const q = req.query.q || "";
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  try {
    let points = [];
    let total = 0;
    if (q.trim()) {
      // Semantic search via Ollama embedding
      const embRes = await fetch("http://localhost:11434/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", prompt: q }),
        signal: AbortSignal.timeout(10000),
      });
      const embData = await embRes.json();
      const embedding = embData.embedding;
      const searchRes = await fetch("http://localhost:6333/collections/sputnik-memory/points/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: embedding, limit, with_payload: true }),
        signal: AbortSignal.timeout(10000),
      });
      const searchData = await searchRes.json();
      const rawPoints = searchData.result || [];
      total = rawPoints.length;
      points = rawPoints.map(p => ({
        id: p.id,
        text: p.payload?.data || p.payload?.text || p.payload?.memory || "",
        metadata: {
          user_id: p.payload?.user_id,
          created_at: p.payload?.created_at,
          categories: p.payload?.categories,
        },
      }));
    } else {
      // Scroll all points
      const scrollRes = await fetch("http://localhost:6333/collections/sputnik-memory/points/scroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, offset, with_payload: true, with_vector: false }),
        signal: AbortSignal.timeout(10000),
      });
      const scrollData = await scrollRes.json();
      const rawPoints = scrollData.result?.points || [];
      try {
        const infoRes = await fetch("http://localhost:6333/collections/sputnik-memory", { signal: AbortSignal.timeout(3000) });
        const info = await infoRes.json();
        total = info?.result?.points_count ?? rawPoints.length;
      } catch { total = rawPoints.length; }
      points = rawPoints.map(p => ({
        id: p.id,
        text: p.payload?.data || p.payload?.text || p.payload?.memory || "",
        metadata: {
          user_id: p.payload?.user_id,
          created_at: p.payload?.created_at,
          categories: p.payload?.categories,
        },
      }));
    }
    res.json({ points, total });
  } catch (e) {
    console.error("[memories/list]", e.message);
    res.json({ points: [], total: 0 });
  }
});

// DELETE /api/memories/:id
router.delete("/memories/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const pointId = /^\d+$/.test(id) ? parseInt(id) : id;
    await fetch("http://localhost:6333/collections/sputnik-memory/points/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: [pointId] }),
      signal: AbortSignal.timeout(5000),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/memories/stats
router.get("/memories/stats", async (req, res) => {
  try {
    const infoRes = await fetch("http://localhost:6333/collections/sputnik-memory", { signal: AbortSignal.timeout(3000) });
    const info = await infoRes.json();
    const total = info?.result?.points_count ?? 0;
    const scrollRes = await fetch("http://localhost:6333/collections/sputnik-memory/points/scroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1000, with_payload: true, with_vector: false }),
      signal: AbortSignal.timeout(10000),
    });
    const scrollData = await scrollRes.json();
    const pts = scrollData.result?.points || [];
    const byDayMap = {};
    for (const p of pts) {
      if (p.payload?.created_at) {
        const date = new Date(p.payload.created_at).toISOString().slice(0, 10);
        byDayMap[date] = (byDayMap[date] || 0) + 1;
      }
    }
    const byDay = Object.entries(byDayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
    res.json({ total, byDay });
  } catch (e) {
    res.json({ total: 0, byDay: [] });
  }
});

// POST /api/memory/save
router.post("/memory/save", async (req, res) => {
  const { GATEWAY, TOKEN } = require("../config");
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "x-openclaw-session-key": "telegram:direct:277364372",
      },
      body: JSON.stringify({
        model: "openclaw:main",
        messages: [{ role: "user", content: `Запомни это: ${text}` }],
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json();
    res.json({ ok: true, response: data.choices?.[0]?.message?.content?.slice(0, 100) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
