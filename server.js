const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

const GATEWAY_URL = "ws://localhost:18789";
const GATEWAY_TOKEN = "19312506a9cb5d813ce65b2edacf09751d11561111830994";
const PORT = process.env.PORT || 3100;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// API: status
app.get("/api/status", async (req, res) => {
  const status = {
    agent: "Sputnik 🛰️",
    model: "anthropic/claude-sonnet-4-6",
    gateway: false,
    qdrant: false,
    ollama: false,
    timestamp: new Date().toISOString(),
  };

  // Check Gateway
  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(GATEWAY_URL);
      ws.on("open", () => { status.gateway = true; ws.close(); resolve(); });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 2000);
    });
  } catch {}

  // Check Qdrant
  try {
    const { default: fetch } = await import("node-fetch").catch(() => ({ default: null }));
    if (fetch) {
      const r = await fetch("http://localhost:6333/healthz", { signal: AbortSignal.timeout(2000) });
      status.qdrant = r.ok;
    }
  } catch {}

  // Check Ollama
  try {
    const net = require("net");
    await new Promise((resolve, reject) => {
      const sock = net.createConnection(11434, "127.0.0.1");
      sock.on("connect", () => { status.ollama = true; sock.destroy(); resolve(); });
      sock.on("error", reject);
      setTimeout(() => reject(), 2000);
    });
  } catch {}

  res.json(status);
});

// API: memories count
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

// WebSocket proxy → Gateway
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (clientWs) => {
  console.log("[ws] browser connected");

  const gwWs = new WebSocket(GATEWAY_URL);
  let gwReady = false;
  const queue = [];

  // Connect to gateway after open
  gwWs.on("open", () => {
    gwReady = true;
    // Send connect frame
    const connectFrame = {
      type: "req",
      method: "connect",
      id: "connect-" + Date.now(),
      params: {
        client: "sputnik-mission-control",
        auth: { token: GATEWAY_TOKEN },
      },
    };
    gwWs.send(JSON.stringify(connectFrame));
    // Flush queued messages
    queue.forEach((m) => gwWs.send(m));
    queue.length = 0;
    console.log("[ws] gateway connected");
  });

  gwWs.on("message", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(String(data));
    }
  });

  gwWs.on("close", (code) => {
    console.log("[ws] gateway closed", code);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, "gateway closed");
    }
  });

  gwWs.on("error", (err) => {
    console.error("[ws] gateway error", err.message);
    clientWs.close(1011, "gateway error");
  });

  clientWs.on("message", (data) => {
    const raw = String(data);
    if (gwReady) {
      gwWs.send(raw);
    } else {
      queue.push(raw);
    }
  });

  clientWs.on("close", () => {
    console.log("[ws] browser disconnected");
    gwWs.close();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛰️  Sputnik Mission Control`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   Tailscale: https://sputniks-mac-mini.tailcde006.ts.net:8444\n`);
});
