# Command Center v2 — Spec
> Date: 2026-03-05 | Status: implementing

## Problems to fix

### 1. Remove Qdrant from UI
- `public/command.html` — remove `bd-qd` Qdrant badge from header
- `public/index.html` — remove `🔮 Qdrant` sub-tab from Memory panel
- `public/js/memory.js` — remove qdrant from tab list
- `public/js/stats.js` — remove qdrant MB stat cell
- Keep backend routes (they may still be used internally), just remove from UI

### 2. Command Center — Real Live Activity Log
**Root cause**: Activity log only triggers from `routes/chat.js` (MC chat requests).
Heartbeat pings, Telegram messages, cron jobs → all go through Gateway directly,
never touching our chat route → no events emitted → log stays empty.

**Fix**: `lib/session-watcher.js` — fs.watch on session files
- Watch `sessions.json` for each agent (main, github-agent, claude-code)
- On change → read the last message from the session file
- Extract role + content → broadcast `agent_event` via SSE
- Auto-detect: if message.role=user → "received message", if assistant → "replied"
- Throttle: max 1 event per second per agent to avoid spam
- Status: "thinking" when last msg is user (waiting for reply), "idle" after assistant reply

### 3. Command Center — Visual Interaction
**Problems**:
- No visual feedback when agent is actually processing
- Orbits look static unless agent status=thinking
- No "last action" text under agent names

**Fix**:
- `session-watcher.js` → emit `thinking` when user msg arrives → `idle` after assistant msg
- Canvas: show "last action" text below agent status (e.g. "replied 2s ago")
- Particles spawn every time agent state changes (not just when thinking)
- Show message count badge on each agent node (total messages today)

### 4. Heartbeat + Cron agents visible
**Problem**: Heartbeat (every 30min) and night cron agents run and disappear — not visible in CC

**Fix**:
- In `lib/session-watcher.js`: also watch cron session files
- When a cron session updates → show "🕐 Cron: [job-name] running" in activity log
- Add agent for heartbeat events: when sessions.json changes for main agent at regular intervals,
  emit a heartbeat event

## Implementation

### New file: `lib/session-watcher.js`
```js
const fs = require("fs");
const path = require("path");
const { OPENCLAW_HOME } = require("../config");

const AGENTS = [
  { id: "main",         name: "Sputnik",      icon: "🛰️" },
  { id: "github-agent", name: "GitHub Agent", icon: "🐙" },
  { id: "claude-code",  name: "Claude Code",  icon: "💻" },
];

const lastMsgTime = {};   // agentId → timestamp of last emitted event
const THROTTLE_MS = 1500;

function getLastMessage(sessionFile) {
  try {
    const data = fs.readFileSync(sessionFile, "utf8");
    const lines = data.split("\n").filter(Boolean);
    // Walk backwards to find last message type
    for (let i = lines.length - 1; i >= 0; i--) {
      const obj = JSON.parse(lines[i]);
      if (obj.type === "message") {
        const msg = obj.message || {};
        const role = msg.role;
        let content = "";
        if (typeof msg.content === "string") content = msg.content;
        else if (Array.isArray(msg.content)) {
          const textItem = msg.content.find(c => c.type === "text");
          content = textItem ? textItem.text : "";
        }
        return { role, content: content.slice(0, 100), timestamp: obj.timestamp };
      }
    }
  } catch {}
  return null;
}

function startWatcher(broadcast, agentState) {
  for (const agent of AGENTS) {
    const sessionsJsonPath = path.join(OPENCLAW_HOME, "agents", agent.id, "sessions", "sessions.json");
    
    let watchTimer = null;
    
    const handleChange = () => {
      // Throttle
      const now = Date.now();
      if ((now - (lastMsgTime[agent.id] || 0)) < THROTTLE_MS) return;
      lastMsgTime[agent.id] = now;

      try {
        const sessions = JSON.parse(fs.readFileSync(sessionsJsonPath, "utf8"));
        // Find most recently updated session
        let latestSession = null;
        let latestTime = 0;
        for (const [key, s] of Object.entries(sessions)) {
          if ((s.updatedAt || 0) > latestTime) {
            latestTime = s.updatedAt;
            latestSession = s;
          }
        }
        if (!latestSession?.sessionFile) return;

        const lastMsg = getLastMessage(latestSession.sessionFile);
        if (!lastMsg) return;

        const isThinking = lastMsg.role === "user";
        const newStatus = isThinking ? "thinking" : "idle";
        
        // Only broadcast if status changed or new message
        const prev = agentState[agent.id] || {};
        if (prev.lastMsgTimestamp === lastMsg.timestamp) return; // same message, skip

        agentState[agent.id] = {
          status: newStatus,
          task: isThinking ? lastMsg.content : null,
          lastMsg: lastMsg,
          lastMsgTimestamp: lastMsg.timestamp,
          updatedAt: now,
        };

        broadcast("agent_event", {
          id: agent.id,
          name: agent.name,
          icon: agent.icon,
          status: newStatus,
          role: lastMsg.role,
          content: lastMsg.content,
          timestamp: lastMsg.timestamp || new Date().toISOString(),
        });

        // Auto-reset to idle after 30s if still "thinking"
        if (isThinking) {
          clearTimeout(watchTimer);
          watchTimer = setTimeout(() => {
            if (agentState[agent.id]?.status === "thinking") {
              agentState[agent.id].status = "idle";
              broadcast("agent_update", { id: agent.id, status: "idle", task: null });
            }
          }, 30000);
        }
      } catch {}
    };

    // Watch sessions.json
    try {
      fs.watch(sessionsJsonPath, { persistent: false }, () => {
        // Debounce — fs.watch fires multiple times
        clearTimeout(watchTimer);
        watchTimer = setTimeout(handleChange, 300);
      });
      console.log(`[watcher] watching ${agent.id}`);
    } catch {
      // File doesn't exist yet — poll instead
      setInterval(handleChange, 5000);
    }
  }
}

module.exports = { startWatcher };
```

### Updates to `routes/command.js`
- Import and call `startWatcher(broadcast, agentState)` after module init
- Add `agent_event` type handler (different from `agent_update`)
- `agent_event` contains role + content → Activity Log shows real messages

### Updates to `public/command.html`
- Remove Qdrant badge from header
- Activity Log: handle both `agent_update` (status) and `agent_event` (real messages)
- For `agent_event` with role=user: show 💬 message preview
- For `agent_event` with role=assistant: show 🛰️ reply preview  
- Canvas: show `lastMsg.content.slice(0,30)` as ticker text under agent name
- Add "last active X sec ago" counter that updates every second

## Tasks for backlog (HEARTBEAT.md / Issues)
- [ ] Add more agents to Command Center as they're created
- [ ] Click agent → show mini session history popup (not just redirect)
- [ ] "Broadcast to all agents" button in Command Center
- [ ] Agent health score (response time, error rate)
- [ ] Night mode: dim offline agents more aggressively

---

## Task: Fix agent list — only show real configured agents

**Problem**: `/api/agents` returns `claude-code` which is an OpenClaw CLI tool, not an agent.
Config `agents.list` contains only: `main`, `github-agent`.

**Fix in `routes/agents.js`**: Read from `~/.openclaw/openclaw.json → agents.list` instead of scanning `~/.openclaw/agents/` directory.

```js
// routes/agents.js
const { OPENCLAW_HOME } = require("../config");
const fs = require("fs");
router.get("/agents", (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync(`${OPENCLAW_HOME}/openclaw.json`, "utf8"));
    const list = cfg.agents?.list || [];
    res.json(list.map(a => ({ id: a.id, name: a.identity?.name, model: a.model, emoji: a.identity?.emoji })));
  } catch {
    res.json([{ id: "main" }]);
  }
});
```

**Fix in `routes/command.js`**: Update AGENTS array to match config:
```js
const AGENTS = [
  { id: "main",         name: "Sputnik",      icon: "🛰️",  role: "primary" },
  { id: "github-agent", name: "GitHub Agent", icon: "🐙",  role: "secondary", parent: "main" },
];
```

---

## Task: Settings tab — show per-agent info when agent is switched

**Problem**: Settings tab always shows agent `main` info regardless of selected agent.

**Fix in `public/js/settings.js`**: 
- Listen for `agentChanged` event (dispatched by `selectAgent()` in agents.js)
- Re-render AGENT INFO section with current agent's data
- Show correct model, workspace path, config for selected agent

**Fix in `routes/status.js`**: Add `GET /api/agents/:id/info` endpoint:
```js
router.get("/agents/:id/info", (req, res) => {
  const cfg = JSON.parse(fs.readFileSync(`${OPENCLAW_HOME}/openclaw.json`));
  const agent = (cfg.agents?.list || []).find(a => a.id === req.params.id) || {};
  res.json({
    id: agent.id || req.params.id,
    name: agent.identity?.name || agent.id,
    model: agent.model || cfg.agents?.defaults?.model?.primary || "—",
    workspace: agent.workspace || cfg.agents?.defaults?.workspace || "—",
  });
});
```

**Fix in `public/js/agents.js`**: After `selectAgent(id)`, dispatch event:
```js
window.dispatchEvent(new CustomEvent("agentChanged", { detail: { id } }));
```

**Fix in `public/js/settings.js`**: Listen and reload agent info:
```js
window.addEventListener("agentChanged", e => loadAgentInfo(e.detail.id));
async function loadAgentInfo(agentId) {
  const r = await fetch(`/api/agents/${agentId}/info`);
  const d = await r.json();
  document.getElementById("si-id").textContent    = d.id;
  document.getElementById("si-model").textContent = d.model;
  document.getElementById("si-ws").textContent    = d.workspace;
}
```
