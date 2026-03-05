const express = require("express");
const http = require("http");
const path = require("path");

const app = express();
const server = http.createServer(app);

const GATEWAY = "http://localhost:18789";
const TOKEN = "19312506a9cb5d813ce65b2edacf09751d11561111830994";
const PORT = process.env.PORT || 3100;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// API: status
app.get("/api/status", async (req, res) => {
  const status = {
    agent: "Sputnik",
    model: "anthropic/claude-sonnet-4-6",
    gateway: false,
    ollama: false,
    timestamp: new Date().toISOString(),
  };

  // Check Gateway via chat completions
  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "openclaw:main", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(3000),
    });
    status.gateway = r.status < 500;
  } catch {}

  // Check Ollama
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    status.ollama = r.ok;
  } catch {}

  res.json(status);
});

// API: memories count from Qdrant
app.get("/api/memories", async (req, res) => {
  try {
    const r = await fetch("http://localhost:6333/collections/sputnik-memory", {
      signal: AbortSignal.timeout(2000)
    });
    const data = await r.json();
    res.json({ count: data?.result?.points_count ?? 0 });
  } catch {
    res.json({ count: 0 });
  }
});

// API: list agents
app.get("/api/agents", async (req, res) => {
  const fs = require("fs");
  try {
    const agentsDir = `${process.env.HOME}/.openclaw/agents`;
    const dirs = fs.readdirSync(agentsDir).filter(d => {
      try { return fs.statSync(`${agentsDir}/${d}`).isDirectory(); } catch { return false; }
    });
    const agents = dirs.map(id => {
      let soul = "";
      try { soul = fs.readFileSync(`${agentsDir}/${id}/workspace/SOUL.md`, "utf8").slice(0, 100); } catch {}
      return { id, soul };
    });
    res.json(agents);
  } catch {
    res.json([]);
  }
});

// API: cron jobs
app.get("/api/cron", async (req, res) => {
  const { execSync } = require("child_process");
  try {
    const out = execSync("openclaw cron list --json 2>/dev/null", { timeout: 5000 }).toString();
    res.json(JSON.parse(out));
  } catch {
    res.json([]);
  }
});

// CHAT: simple JSON (no streaming — works reliably over Tailscale)
app.post("/api/chat", async (req, res) => {
  const { message, agentId = "main", sessionKey } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "x-openclaw-agent-id": agentId,
        ...(sessionKey ? { "x-openclaw-session-key": sessionKey } : {}),
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages: [{ role: "user", content: message }],
        stream: false,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(502).json({ error: `Gateway error ${r.status}: ${err.slice(0, 200)}` });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛰️  Sputnik Mission Control`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Tailscale: https://sputniks-mac-mini.tailcde006.ts.net:8444\n`);
});
