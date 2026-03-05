const fs = require("fs");
const path = require("path");
const { OPENCLAW_HOME } = require("../config");

// Only real configured agents (not CLI tools like claude-code)
const AGENTS = [
  { id: "main",         name: "Sputnik",      icon: "🛰️" },
  { id: "github-agent", name: "GitHub Agent", icon: "🐙" },
];

const lastEmittedTimestamp = {}; // agentId → last message timestamp emitted
const THROTTLE_MS = 800;
const lastEmitTime = {};

function getLastMessage(sessionFile) {
  try {
    const data = fs.readFileSync(sessionFile, "utf8");
    const lines = data.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type !== "message") continue;
        const msg = obj.message || {};
        const role = msg.role;
        if (!role) continue;
        let content = "";
        if (typeof msg.content === "string") {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          const textItem = msg.content.find(c => c.type === "text");
          content = textItem?.text || "[tool call]";
        }
        return { role, content: content.slice(0, 120), timestamp: obj.timestamp || null };
      } catch {}
    }
  } catch {}
  return null;
}

function getMostRecentSession(sessionsJsonPath) {
  try {
    const sessions = JSON.parse(fs.readFileSync(sessionsJsonPath, "utf8"));
    let latest = null, latestTime = 0;
    for (const [key, s] of Object.entries(sessions)) {
      if ((s.updatedAt || 0) > latestTime) {
        latestTime = s.updatedAt;
        latest = s;
      }
    }
    return latest;
  } catch { return null; }
}

function startWatcher(broadcast, agentState) {
  for (const agent of AGENTS) {
    const sessionsJsonPath = path.join(OPENCLAW_HOME, "agents", agent.id, "sessions", "sessions.json");

    let debounceTimer = null;
    let resetTimer = null;

    const handleChange = () => {
      const now = Date.now();
      if ((now - (lastEmitTime[agent.id] || 0)) < THROTTLE_MS) return;
      lastEmitTime[agent.id] = now;

      const session = getMostRecentSession(sessionsJsonPath);
      if (!session?.sessionFile) return;

      const lastMsg = getLastMessage(session.sessionFile);
      if (!lastMsg) return;

      // Skip if we already emitted this message
      if (lastEmittedTimestamp[agent.id] === lastMsg.timestamp) return;
      lastEmittedTimestamp[agent.id] = lastMsg.timestamp;

      const isThinking = lastMsg.role === "user";
      const newStatus = isThinking ? "thinking" : "idle";

      agentState[agent.id] = {
        ...(agentState[agent.id] || {}),
        status: newStatus,
        task: isThinking ? lastMsg.content : null,
        lastMsg,
        updatedAt: now,
      };

      // Broadcast real message event
      broadcast("agent_event", {
        id: agent.id,
        name: agent.name,
        icon: agent.icon,
        status: newStatus,
        role: lastMsg.role,
        content: lastMsg.content,
        ts: new Date().toISOString(),
      });

      // Also broadcast status update for canvas
      broadcast("agent_update", { id: agent.id, status: newStatus, task: lastMsg.content });

      // Auto-reset thinking → idle after 45s (safety net)
      if (isThinking) {
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          if (agentState[agent.id]?.status === "thinking") {
            agentState[agent.id].status = "idle";
            agentState[agent.id].task = null;
            broadcast("agent_update", { id: agent.id, status: "idle", task: null });
          }
        }, 45000);
      }
    };

    // Try fs.watch; fall back to polling if file doesn't exist yet
    try {
      if (!fs.existsSync(sessionsJsonPath)) throw new Error("not found");
      
      fs.watch(sessionsJsonPath, { persistent: false }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleChange, 250);
      });

      // Also watch the sessions directory for new .jsonl files
      const sessionsDir = path.dirname(sessionsJsonPath);
      fs.watch(sessionsDir, { persistent: false }, (evt, filename) => {
        if (filename && filename.endsWith(".jsonl")) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(handleChange, 250);
        }
      });

      console.log(`[watcher] 👁 watching ${agent.id}`);
      // Emit initial state on startup
      setTimeout(handleChange, 1000 + AGENTS.indexOf(agent) * 300);
    } catch {
      // Polling fallback for agents that may not have sessions yet
      setInterval(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleChange, 250);
      }, 5000);
      console.log(`[watcher] 🔄 polling ${agent.id} (no sessions yet)`);
    }
  }
}

module.exports = { startWatcher };
