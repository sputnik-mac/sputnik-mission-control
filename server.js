const express = require("express");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

const GATEWAY = "http://localhost:18789";
const TOKEN = "19312506a9cb5d813ce65b2edacf09751d11561111830994";
const PORT = process.env.PORT || 3100;

// In-memory job queue
const jobs = new Map(); // jobId -> { status, text, error, createdAt }

// Cleanup old jobs after 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 60 * 1000);

// Auto-cleanup orphan openai:* sessions every 24h
setInterval(cleanupOrphanSessions, 24 * 60 * 60 * 1000);
cleanupOrphanSessions();

function cleanupOrphanSessions() {
  const fs = require("fs");
  const agents = ["main", "github-agent", "claude-code"];
  let total = 0;
  for (const agent of agents) {
    try {
      const p = `${process.env.HOME}/.openclaw/agents/${agent}/sessions/sessions.json`;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      const cleaned = {};
      for (const [key, session] of Object.entries(data)) {
        if (/openai:[0-9a-f-]{36}/.test(key)) {
          const sf = session.sessionFile;
          if (sf) try { fs.unlinkSync(sf); } catch {}
          total++;
        } else {
          cleaned[key] = session;
        }
      }
      fs.writeFileSync(p, JSON.stringify(cleaned, null, 2));
    } catch {}
  }
  if (total > 0) console.log(`[cleanup] Removed ${total} orphan sessions`);
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// SQLite setup
const Database = require("better-sqlite3");
let db;
try {
  db = new Database("/Users/sputnik/.openclaw/memory/personal.sqlite", { readonly: true });
  console.log("[sqlite] Connected to personal.sqlite");
} catch (e) {
  db = null;
  console.warn("[sqlite] Not available:", e.message);
}
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now()-start}ms)`);
  });
  next();
});

// API: status
app.get("/api/status", async (req, res) => {
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

// API: memories
app.get("/api/memories", async (req, res) => {
  try {
    const r = await fetch("http://localhost:6333/collections/sputnik-memory", { signal: AbortSignal.timeout(2000) });
    const data = await r.json();
    res.json({ count: data?.result?.points_count ?? 0 });
  } catch { res.json({ count: 0 }); }
});

// API: memories list (with optional semantic search)
app.get("/api/memories/list", async (req, res) => {
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
      // Get total from collection info
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

// API: delete memory point
app.delete("/api/memories/:id", async (req, res) => {
  try {
    const id = req.params.id;
    // Try parsing as number, otherwise keep as string
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

// API: memory stats
app.get("/api/memories/stats", async (req, res) => {
  try {
    const infoRes = await fetch("http://localhost:6333/collections/sputnik-memory", { signal: AbortSignal.timeout(3000) });
    const info = await infoRes.json();
    const total = info?.result?.points_count ?? 0;
    // Scroll up to 1000 points for growth by day
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

// API: SQLite - timeline
app.get("/api/sqlite/timeline", (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = db.prepare("SELECT * FROM timeline ORDER BY ts DESC LIMIT ?").all(parseInt(req.query.limit) || 20);
    res.json(rows);
  } catch { res.json([]); }
});

// API: SQLite - entities
app.get("/api/sqlite/entities", (req, res) => {
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

// API: SQLite - decisions
app.get("/api/sqlite/decisions", (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = db.prepare("SELECT * FROM decisions ORDER BY ts DESC LIMIT ?").all(parseInt(req.query.limit) || 20);
    res.json(rows);
  } catch { res.json([]); }
});

// API: agents
app.get("/api/agents", async (req, res) => {
  const fs = require("fs");
  try {
    const agentsDir = `${process.env.HOME}/.openclaw/agents`;
    const dirs = fs.readdirSync(agentsDir).filter(d => {
      try { return fs.statSync(`${agentsDir}/${d}`).isDirectory(); } catch { return false; }
    });
    res.json(dirs.map(id => ({ id })));
  } catch { res.json([]); }
});

// API: sessions
app.get("/api/sessions", async (req, res) => {
  const fs = require("fs");
  const result = [];
  const agents = ["main", "github-agent", "claude-code"];
  for (const agent of agents) {
    try {
      const p = `${process.env.HOME}/.openclaw/agents/${agent}/sessions/sessions.json`;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const [key, s] of Object.entries(data)) {
        // Skip cron run sessions
        if (key.includes(":run:")) continue;
        const size = (() => {
          try { return fs.statSync(s.sessionFile || "").size; } catch { return 0; }
        })();
        result.push({
          key,
          agent,
          updatedAt: s.updatedAt,
          chatType: s.chatType || "direct",
          origin: s.origin?.provider || s.origin?.label || "unknown",
          sizeKb: Math.round(size / 1024),
          isTelegram: key.includes("telegram"),
          isMain: key === `agent:main:telegram:direct:277364372`,
        });
      }
    } catch {}
  }
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json(result);
});

// API: chat history
app.get("/api/chat/history", async (req, res) => {
  const fs = require("fs");
  const agentId = req.query.agentId || "main";
  const limit = parseInt(req.query.limit) || 30;
  try {
    const sessionsPath = `${process.env.HOME}/.openclaw/agents/${agentId}/sessions/sessions.json`;
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
    const sessionKey = `agent:${agentId}:telegram:direct:277364372`;
    const session = sessions[sessionKey];
    if (!session || !session.sessionFile) return res.json([]);

    const raw = fs.readFileSync(session.sessionFile, "utf8");
    const lines = raw.split("\n").filter(l => l.trim());
    const messages = [];
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.type === "compaction") continue;
      // Messages are nested: { type: "message", message: { role, content } }
      const msg = entry.message || entry;
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter(b => b && b.type === "text")
          .map(b => b.text || "")
          .join("\n");
      }
      if (!content.trim()) continue;
      messages.push({ role: msg.role, content });
    }
    // Return last `limit` messages
    res.json(messages.slice(-limit));
  } catch (e) {
    console.error("[history]", e.message);
    res.json([]);
  }
});

// API: delete session
app.delete("/api/sessions/:key", (req, res) => {
  const fs = require("fs");
  const key = decodeURIComponent(req.params.key);
  if (key === "agent:main:telegram:direct:277364372") {
    return res.status(403).json({ error: "Cannot delete main session" });
  }
  const agents = ["main", "github-agent", "claude-code"];
  for (const agent of agents) {
    try {
      const p = `${process.env.HOME}/.openclaw/agents/${agent}/sessions/sessions.json`;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (key in data) {
        const sf = data[key]?.sessionFile;
        if (sf) try { fs.unlinkSync(sf); } catch {}
        delete data[key];
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return res.json({ ok: true });
      }
    } catch {}
  }
  res.json({ ok: true }); // key not found, still ok
});

// API: cron - normalize format
app.get("/api/cron", async (req, res) => {
  const { execSync } = require("child_process");
  try {
    const out = execSync("openclaw cron list --json 2>/dev/null", { timeout: 5000 }).toString();
    const raw = JSON.parse(out);
    // openclaw cron list returns { jobs: [...] }
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

// API: trigger cron job manually
app.post("/api/cron/:id/run", (req, res) => {
  const { execSync } = require("child_process");
  try {
    execSync(`openclaw cron run ${req.params.id}`, { timeout: 10000 });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// CHAT: enqueue and return jobId immediately
app.post("/api/chat", (req, res) => {
  const { message, agentId = "main" } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending", text: null, error: null, createdAt: Date.now() });

  // Process in background - don't await
  processChat(jobId, message, agentId);

  res.json({ jobId, status: "pending" });
});

// CHAT: poll job status
app.get("/api/chat/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

async function processChat(jobId, message, agentId) {
  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "x-openclaw-agent-id": agentId,
        ...(agentId === "main" ? { "x-openclaw-session-key": "telegram:direct:277364372" } : {}),
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages: [{ role: "user", content: message }],
        stream: false,
        // Use Telegram session so Mission Control shares context with Telegram
        ...(agentId === "main" ? { session_key: "telegram:direct:277364372" } : {}),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!r.ok) {
      const err = await r.text();
      jobs.set(jobId, { ...jobs.get(jobId), status: "error", error: `Gateway ${r.status}: ${err.slice(0,200)}` });
      return;
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    jobs.set(jobId, { ...jobs.get(jobId), status: "done", text });
  } catch (err) {
    jobs.set(jobId, { ...jobs.get(jobId), status: "error", error: err.message });
  }
}

// API: stats/usage
app.get("/api/stats/usage", async (req, res) => {
  const fs = require("fs");
  const days = parseInt(req.query.days) || 7;
  const byDay = {};
  const PRICING = {
    input: 3 / 1e6,
    output: 15 / 1e6,
  };
  const sessionsPath = `${process.env.HOME}/.openclaw/agents/main/sessions/sessions.json`;
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

// API: stats/system
app.get("/api/stats/system", async (req, res) => {
  const { execSync } = require("child_process");
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
    uptimeHuman: `${Math.floor(uptimeSeconds/3600)}h ${Math.floor((uptimeSeconds%3600)/60)}m`,
    qdrantMb,
    sessionCount,
    sessionsMb,
    nodeVersion: process.version,
    pid: process.pid,
  });
});

// API: remind via Telegram
app.post("/api/remind", async (req, res) => {
  const { minutes = 5, text = "⏰ Напоминание!" } = req.body;
  setTimeout(async () => {
    try {
      await fetch(`https://api.telegram.org/bot8609157005:AAHkLreLALwc6dBh_X0Xr5FPJohNmW_a5dg/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: 277364372, text: `⏰ ${text}` }),
      });
    } catch {}
  }, minutes * 60 * 1000);
  res.json({ ok: true, scheduledFor: new Date(Date.now() + minutes * 60 * 1000).toISOString() });
});

// API: add to Things
app.post("/api/things", (req, res) => {
  const { execSync } = require("child_process");
  const { title = "Задача", notes = "", when = "today" } = req.body;
  try {
    const url = `things:///add?title=${encodeURIComponent(title)}&notes=${encodeURIComponent(notes)}&when=${when}`;
    execSync(`open "${url}"`, { timeout: 3000 });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛰️  Sputnik Mission Control`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Tailscale: https://sputniks-mac-mini.tailcde006.ts.net:8444\n`);
});
