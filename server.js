const express = require("express");
const http = require("http");
const path = require("path");

const app = express();
const server = http.createServer(app);

const GATEWAY = "http://localhost:18789";
const TOKEN = "19312506a9cb5d813ce65b2edacf09751d11561111830994";
const PORT = process.env.PORT || 3100;

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

// CHAT: streaming proxy to Gateway
app.post("/api/chat", async (req, res) => {
  const { message, sessionKey = "main" } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "x-openclaw-agent-id": "main",
        "x-openclaw-session-key": sessionKey,
      },
      body: JSON.stringify({
        model: "openclaw:main",
        messages: [{ role: "user", content: message }],
        stream: true,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      return res.end();
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            res.write("data: [DONE]\n\n");
            break;
          }
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content ?? "";
            if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
          } catch {}
        }
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛰️  Sputnik Mission Control`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Tailscale: https://sputniks-mac-mini.tailcde006.ts.net:8444\n`);
});
