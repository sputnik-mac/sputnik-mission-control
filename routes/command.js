const router = require("express").Router();
const fs = require("fs");
const { execSync } = require("child_process");
const { OPENCLAW_HOME } = require("../config");

// Global agent state — updated by chat.js when processing starts/ends
const agentState = global.agentState = global.agentState || {};
const sseClients = global.sseClients = global.sseClients || new Set();

// Agent list loaded dynamically from /api/agents (see getAgentList below)
let _agentList = [
  { id: "main",         name: "Sputnik",  icon: "🛰️", role: "primary",   parent: null },
  { id: "github-agent", name: "Pioneer",  icon: "🔭", role: "secondary", parent: "main" },
];

async function getAgentList() {
  try {
    const { GATEWAY, TOKEN } = require("../config");
    const r = await fetch(`${GATEWAY}/v1/agents`, {
      headers: { "Authorization": `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return _agentList;
    const agents = await r.json();
    _agentList = agents.map((a, i) => ({
      id: a.id,
      name: a.name || a.id,
      icon: a.emoji || "🤖",
      role: i === 0 ? "primary" : "secondary",
      parent: i === 0 ? null : "main",
    }));
    // Init state for new agents
    for (const a of _agentList) {
      if (!agentState[a.id]) agentState[a.id] = { status: "idle", task: null, updatedAt: Date.now() };
    }
    return _agentList;
  } catch {
    return _agentList;
  }
}

// Initialize known agent states
_agentList.forEach(a => {
  if (!agentState[a.id]) agentState[a.id] = { status: "idle", task: null, updatedAt: Date.now() };
});

// Refresh agent list every 60s
setInterval(getAgentList, 60_000);

// Read session last activity
function getAgentActivity(agentId) {
  try {
    const p = `${OPENCLAW_HOME}/agents/${agentId}/sessions/sessions.json`;
    const sessions = JSON.parse(fs.readFileSync(p, "utf8"));
    let latest = 0;
    let latestKey = null;
    for (const [key, s] of Object.entries(sessions)) {
      if ((s.updatedAt || 0) > latest) { latest = s.updatedAt; latestKey = key; }
    }
    const secAgo = Math.round((Date.now() - latest) / 1000);
    return { lastActiveAt: latest, secAgo, sessionKey: latestKey };
  } catch { return { lastActiveAt: 0, secAgo: 99999, sessionKey: null }; }
}

// Get cron info for agent
function getCronInfo() {
  try {
    const out = execSync("openclaw cron list --json 2>/dev/null", { timeout: 3000 }).toString();
    return JSON.parse(out);
  } catch { return []; }
}

// Build full agent snapshot
function buildSnapshot() {
  const agents = _agentList;

  const crons = getCronInfo();

  return agents.map(a => {
    const activity = getAgentActivity(a.id);
    const state = agentState[a.id] || { status: "idle", task: null };

    // Auto-detect: if session updated < 30s ago and state is idle, mark as recent
    let status = state.status;
    if (status === "idle" && activity.secAgo < 30) status = "recent";
    // Only mark offline if not actively thinking/working
    if (status !== "thinking" && activity.secAgo > 3600) status = "offline";

    // Find relevant cron jobs
    const cronList = Array.isArray(crons) ? crons : [];
    const myCrons = cronList.filter(c => c.agentId === a.id || (a.id === "main" && !c.agentId));

    return {
      ...a,
      status,
      task: state.task,
      lastActiveAt: activity.lastActiveAt,
      secAgo: activity.secAgo,
      sessionKey: activity.sessionKey,
      crons: myCrons.map(c => ({
        id: c.id,
        name: c.name || c.id,
        schedule: c.schedule,
        lastStatus: c.lastRunStatus,
        lastRunAt: c.lastRunAt,
        nextRunAt: c.nextRunAt,
      })),
    };
  });
}

// SSE: broadcast to all connected clients
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// Start session file watcher → real-time activity detection
const { startWatcher } = require("../lib/session-watcher");
setImmediate(() => startWatcher(broadcast, agentState));

// Periodic snapshot broadcast every 5s
setInterval(() => {
  if (sseClients.size > 0) {
    broadcast("snapshot", buildSnapshot());
  }
}, 5000);

// GET /api/command/snapshot — full current state
router.get("/command/snapshot", (req, res) => {
  res.json(buildSnapshot());
});

// GET /api/command/events — SSE stream
router.get("/command/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering

  // Send initial snapshot
  res.write(`event: snapshot\ndata: ${JSON.stringify(buildSnapshot())}\n\n`);
  res.write(`event: ping\ndata: connected\n\n`);

  sseClients.add(res);

  // Keepalive: SSE comment every 25s to prevent Tailscale/proxy from dropping idle connections
  const keepalive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); sseClients.delete(res); }
  }, 25000);

  req.on("close", () => { clearInterval(keepalive); sseClients.delete(res); });
});

// POST /api/command/agent/:id/status — update agent status (called internally)
router.post("/command/agent/:id/status", (req, res) => {
  const { id } = req.params;
  const { status, task } = req.body;
  agentState[id] = { status, task: task || null, updatedAt: Date.now() };
  broadcast("agent_update", { id, status, task });
  res.json({ ok: true });
});

module.exports = router;
module.exports.broadcast = broadcast;
module.exports.agentState = agentState;
