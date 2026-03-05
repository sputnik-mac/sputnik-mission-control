const router = require("express").Router();
const { randomUUID } = require("crypto");
const fs = require("fs");
const { GATEWAY, TOKEN, OPENCLAW_HOME, MAIN_SESSION_KEY } = require("../config");

// In-memory job queue
const jobs = new Map(); // jobId -> { status, text, error, createdAt }

// Cleanup old jobs after 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 60 * 1000);

// POST /api/chat — enqueue and return jobId immediately
router.post("/chat", (req, res) => {
  const { message, agentId = "main" } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending", text: null, error: null, createdAt: Date.now() });

  // Process in background - don't await
  processChat(jobId, message, agentId);

  res.json({ jobId, status: "pending" });
});

// GET /api/chat/history
router.get("/chat/history", async (req, res) => {
  const agentId = req.query.agentId || "main";
  const limit = parseInt(req.query.limit) || 30;
  try {
    const sessionsPath = `${OPENCLAW_HOME}/agents/${agentId}/sessions/sessions.json`;
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
    // Try Telegram session first, then any session with a file
    const preferredKey = `agent:${agentId}:telegram:direct:277364372`;
    let session = sessions[preferredKey];
    if (!session || !session.sessionFile) {
      const fallback = Object.entries(sessions)
        .filter(([k, s]) => s.sessionFile && !k.includes(":cron:") && !k.includes(":run:"))
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))[0];
      if (fallback) session = fallback[1];
    }
    if (!session || !session.sessionFile) return res.json([]);

    const raw = fs.readFileSync(session.sessionFile, "utf8");
    const lines = raw.split("\n").filter(l => l.trim());
    const messages = [];
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.type === "compaction") continue;
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
    res.json(messages.slice(-limit));
  } catch (e) {
    console.error("[history]", e.message);
    res.json([]);
  }
});

// GET /api/chat/:jobId — poll job status
router.get("/chat/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

function notifyAgentStatus(agentId, status, task) {
  try {
    const cmd = require("./command");
    cmd.agentState[agentId] = { status, task: task || null, updatedAt: Date.now() };
    cmd.broadcast("agent_update", { id: agentId, status, task });
  } catch {}
}

async function processChat(jobId, message, agentId) {
  notifyAgentStatus(agentId, "thinking", message.slice(0, 60));
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
        ...(agentId === "main" ? { session_key: "telegram:direct:277364372" } : {}),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!r.ok) {
      const err = await r.text();
      jobs.set(jobId, { ...jobs.get(jobId), status: "error", error: `Gateway ${r.status}: ${err.slice(0, 200)}` });
      return;
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    jobs.set(jobId, { ...jobs.get(jobId), status: "done", text });
    notifyAgentStatus(agentId, "idle", null);
  } catch (err) {
    jobs.set(jobId, { ...jobs.get(jobId), status: "error", error: err.message });
    notifyAgentStatus(agentId, "idle", null);
  }
}

module.exports = router;
