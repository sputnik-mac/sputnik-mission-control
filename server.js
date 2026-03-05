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

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
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

// API: cron
app.get("/api/cron", async (req, res) => {
  const { execSync } = require("child_process");
  try {
    const out = execSync("openclaw cron list --json 2>/dev/null", { timeout: 5000 }).toString();
    res.json(JSON.parse(out));
  } catch { res.json([]); }
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
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages: [{ role: "user", content: message }],
        stream: false,
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛰️  Sputnik Mission Control`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Tailscale: https://sputniks-mac-mini.tailcde006.ts.net:8444\n`);
});
