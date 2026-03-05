const fs = require("fs");
const path = require("path");
const { OPENCLAW_HOME } = require("../config");

// Agents loaded dynamically from /api/agents at startup
let AGENTS = [
  { id: "main",    name: "Sputnik", icon: "🛰️" },
  { id: "pioneer", name: "Pioneer", icon: "🔭" },
];
// Will be overwritten with live data in startWatcher()

// Tool → emoji map for nice display
const TOOL_ICONS = {
  exec:          "⚡",
  Read:          "📖",
  Write:         "✍️",
  Edit:          "✏️",
  web_search:    "🔍",
  web_fetch:     "🌐",
  browser:       "🖥",
  image:         "🖼",
  message:       "💬",
  sessions_spawn:"🚀",
  subagents:     "👥",
  session_status:"📊",
  process:       "⚙️",
  nodes:         "📡",
  canvas:        "🎨",
  tts:           "🔊",
};

// Messages to skip (noise / system garbage)
const SKIP_PATTERNS = [
  /^pong\s*[🏓✅]?$/i,
  /^ping\s*[🏓]?$/i,
  /^HEARTBEAT_OK/i,
  /^Conversation info \(untrusted metadata\)/,
  /^Sender \(untrusted metadata\)/,
  /^\[object Object\]/,
  /^NO_REPLY$/,
  /^Read HEARTBEAT\.md/,
];

function shouldSkip(text) {
  if (!text) return true;
  const t = text.trim();
  if (!t || t.length < 2) return true;
  return SKIP_PATTERNS.some(p => p.test(t));
}

// Extract display info from a JSONL message entry
function extractEvent(obj) {
  if (obj.type !== "message") return null;
  const msg = obj.message || {};
  const role = msg.role;
  if (!role) return null;

  const content = msg.content;
  const ts = obj.timestamp || new Date().toISOString();

  // Tool calls from assistant (what I'm doing)
  if (role === "assistant" && Array.isArray(content)) {
    const events = [];
    for (const c of content) {
      if (c.type === "toolCall") {
        const toolName = c.name || c.toolName || "?";
        const args = c.arguments || c.input || {};
        const icon = TOOL_ICONS[toolName] || "🔧";
        // Build a short description of the tool call
        let desc = "";
        if (toolName === "exec" && args.command) {
          desc = args.command.split("\n")[0].slice(0, 70);
        } else if ((toolName === "Read" || toolName === "Write" || toolName === "Edit") && (args.path || args.file_path)) {
          desc = (args.path || args.file_path).replace(/^\/Users\/[^/]+/, "~");
        } else if (toolName === "web_search" && args.query) {
          desc = args.query.slice(0, 60);
        } else if (toolName === "web_fetch" && args.url) {
          desc = args.url.slice(0, 60);
        } else if (toolName === "message" && args.message) {
          desc = args.message.slice(0, 60);
        } else if (toolName === "sessions_spawn" && args.task) {
          desc = args.task.slice(0, 60);
        } else {
          desc = JSON.stringify(args).slice(0, 60);
        }
        events.push({ role: "tool", tool: toolName, icon, desc, ts });
      } else if (c.type === "text" && c.text) {
        const text = c.text.trim();
        if (!shouldSkip(text)) {
          events.push({ role: "assistant", text: text.slice(0, 120), ts });
        }
      }
    }
    return events.length ? events : null;
  }

  // Text message from user or assistant
  let text = "";
  if (typeof content === "string") {
    text = content.trim();
  } else if (Array.isArray(content)) {
    const textItem = content.find(c => c.type === "text");
    text = (textItem?.text || "").trim();
  }

  if (shouldSkip(text)) return null;

  // For user messages: skip if it's just system metadata blob
  if (role === "user" && text.length > 300 && text.includes("untrusted metadata")) return null;

  return [{ role, text: text.slice(0, 120), ts }];
}

// Read last N distinct events from a session file
function getLastEvents(sessionFile, n = 5) {
  try {
    const data = fs.readFileSync(sessionFile, "utf8");
    const lines = data.split("\n").filter(Boolean);
    const results = [];
    for (let i = lines.length - 1; i >= 0 && results.length < n; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        const events = extractEvent(obj);
        if (events) results.unshift(...events);
      } catch {}
    }
    return results.slice(-n);
  } catch { return []; }
}

function getMostRecentSession(sessionsJsonPath) {
  try {
    const sessions = JSON.parse(fs.readFileSync(sessionsJsonPath, "utf8"));
    let latest = null, latestTime = 0;
    for (const [, s] of Object.entries(sessions)) {
      if ((s.updatedAt || 0) > latestTime) { latestTime = s.updatedAt; latest = s; }
    }
    return latest;
  } catch { return null; }
}

// Track last emitted event per agent
const lastEmittedTs = {};
const lastEmitWallTime = {};
const THROTTLE_MS = 1000;

async function startWatcher(broadcast, agentState) {
  // Try to load live agent list from gateway
  try {
    const { GATEWAY, TOKEN } = require("../config");
    const r = await fetch(`${GATEWAY}/v1/agents`, {
      headers: { "Authorization": `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const list = await r.json();
      AGENTS = list.map(a => ({ id: a.id, name: a.name || a.id, icon: a.emoji || "🤖" }));
      console.log(`[watcher] loaded ${AGENTS.length} agents from gateway:`, AGENTS.map(a => a.id).join(", "));
    }
  } catch (e) {
    console.log("[watcher] using fallback agent list:", e.message);
  }

  for (const agent of AGENTS) {
    const sessionsJsonPath = path.join(OPENCLAW_HOME, "agents", agent.id, "sessions", "sessions.json");
    let debounce = null;
    let resetTimer = null;

    const handleChange = () => {
      const now = Date.now();
      if (now - (lastEmitWallTime[agent.id] || 0) < THROTTLE_MS) return;
      lastEmitWallTime[agent.id] = now;

      const session = getMostRecentSession(sessionsJsonPath);
      if (!session?.sessionFile) return;

      const events = getLastEvents(session.sessionFile, 3);
      if (!events.length) return;

      // Find newest event
      const newest = events[events.length - 1];
      if (!newest) return;

      // Skip if already emitted
      const key = newest.ts + (newest.text || newest.desc || "");
      if (lastEmittedTs[agent.id] === key) return;
      lastEmittedTs[agent.id] = key;

      // Determine agent status from last event
      const lastRole = newest.role;
      const isThinking = lastRole === "user";
      const newStatus = isThinking ? "thinking" : "idle";

      agentState[agent.id] = {
        ...(agentState[agent.id] || {}),
        status: newStatus,
        task: isThinking ? (newest.text || "").slice(0, 60) : null,
        updatedAt: now,
      };

      // Broadcast each event
      for (const ev of events) {
        broadcast("agent_event", {
          id: agent.id,
          name: agent.name,
          icon: agent.icon,
          role: ev.role,
          tool: ev.tool || null,
          toolIcon: ev.icon || null,
          text: ev.text || null,
          desc: ev.desc || null,
          ts: ev.ts || new Date().toISOString(),
        });
      }

      // Broadcast status
      broadcast("agent_update", { id: agent.id, status: newStatus, task: agentState[agent.id].task });

      // Auto-reset thinking → idle after 45s
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

    // Watch sessions.json + sessions dir
    try {
      if (!fs.existsSync(sessionsJsonPath)) throw new Error("not found");
      fs.watch(sessionsJsonPath, { persistent: false }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(handleChange, 300);
      });
      const sessionsDir = path.dirname(sessionsJsonPath);
      fs.watch(sessionsDir, { persistent: false }, (evt, fname) => {
        if (fname && fname.endsWith(".jsonl")) {
          clearTimeout(debounce);
          debounce = setTimeout(handleChange, 300);
        }
      });
      console.log(`[watcher] 👁 watching ${agent.id}`);
      setTimeout(handleChange, 1000 + AGENTS.indexOf(agent) * 400);
    } catch {
      setInterval(() => {
        clearTimeout(debounce);
        debounce = setTimeout(handleChange, 300);
      }, 5000);
      console.log(`[watcher] 🔄 polling ${agent.id}`);
    }
  }
}

module.exports = { startWatcher };
