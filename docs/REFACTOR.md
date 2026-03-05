# Refactor Spec — Sputnik Mission Control
> Priority: HIGH | Type: Structural refactor | No new features

## Problem

Currently the entire application lives in two monolithic files:
- `server.js` — ~500 lines, all routes mixed together
- `public/index.html` — ~1000 lines, CSS + HTML + JS all in one file

This makes it hard to:
- Find specific logic quickly
- Test individual components
- Add new features without breaking others
- Let an AI agent work on one section without loading the entire codebase

## Goal

Split into focused modules. Each file should do **one thing only**.
No new features — pure structural refactor, same behavior after.

---

## Backend Structure (Node.js / Express)

### Before
```
server.js   ← everything
```

### After
```
server.js               ← entry point only: create app, register routes, start server
config.js               ← constants (GATEWAY, TOKEN, PORT, WORKSPACE, ALLOWED_FILES, etc.)
lib/
  cleanup.js            ← cleanupOrphanSessions() function + interval
  history.js            ← parseSessionHistory(sessionFile, limit) helper
routes/
  status.js             ← GET /api/status, GET /api/memories (count only)
  chat.js               ← POST /api/chat, GET /api/chat/:jobId, GET /api/chat/history
  sessions.js           ← GET /api/sessions, DELETE /api/sessions/:key
  memory.js             ← GET /api/memories/list, DELETE /api/memories/:id, GET /api/memories/stats
  sqlite.js             ← GET /api/sqlite/timeline|entities|decisions
  workspace.js          ← GET /api/workspace/:file, POST /api/workspace/:file
  cron.js               ← GET /api/cron, POST /api/cron/:id/run
  stats.js              ← GET /api/stats/usage, GET /api/stats/system
  agents.js             ← GET /api/agents
  remind.js             ← POST /api/remind, POST /api/things
```

### Entry point `server.js` (after refactor, ~30 lines):
```js
const express = require("express");
const http = require("http");
const path = require("path");
const { PORT } = require("./config");
const { startCleanup } = require("./lib/cleanup");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(require("cors")({ origin: "*" })); // or inline CORS handler
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now()-start}ms)`));
  next();
});

// Routes
app.use("/api", require("./routes/status"));
app.use("/api", require("./routes/chat"));
app.use("/api", require("./routes/sessions"));
app.use("/api", require("./routes/memory"));
app.use("/api", require("./routes/sqlite"));
app.use("/api", require("./routes/workspace"));
app.use("/api", require("./routes/cron"));
app.use("/api", require("./routes/stats"));
app.use("/api", require("./routes/agents"));
app.use("/api", require("./routes/remind"));

startCleanup();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛰️  Sputnik Mission Control`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Tailscale: https://sputniks-mac-mini.tailcde006.ts.net:8444\n`);
});
```

### `config.js`:
```js
module.exports = {
  GATEWAY: "http://localhost:18789",
  TOKEN: "19312506a9cb5d813ce65b2edacf09751d11561111830994",
  PORT: process.env.PORT || 3100,
  WORKSPACE: `${process.env.HOME}/.openclaw/workspace`,
  OPENCLAW_HOME: `${process.env.HOME}/.openclaw`,
  ALLOWED_FILES: ["SOUL.md", "MEMORY.md", "HEARTBEAT.md", "AGENTS.md", "USER.md", "TOOLS.md"],
  TELEGRAM_BOT_TOKEN: "8609157005:AAHkLreLALwc6dBh_X0Xr5FPJohNmW_a5dg",
  TELEGRAM_CHAT_ID: 277364372,
  MAIN_SESSION_KEY: "agent:main:telegram:direct:277364372",
};
```

### Route file template (e.g. `routes/status.js`):
```js
const router = require("express").Router();
const { GATEWAY, TOKEN } = require("../config");

router.get("/status", async (req, res) => {
  // ... handler code
});

module.exports = router;
```

### `lib/cleanup.js`:
```js
const fs = require("fs");
const { OPENCLAW_HOME } = require("../config");

function cleanupOrphanSessions() {
  // ... existing cleanup logic
}

function startCleanup() {
  cleanupOrphanSessions(); // on startup
  setInterval(cleanupOrphanSessions, 24 * 60 * 60 * 1000);
}

module.exports = { startCleanup, cleanupOrphanSessions };
```

### `lib/history.js`:
```js
const fs = require("fs");

// Parse a .jsonl session file and return [{role, content}] messages
function parseSessionHistory(sessionFile, limit = 30) {
  const raw = fs.readFileSync(sessionFile, "utf8");
  const messages = [];
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "compaction") continue;
      const msg = entry.message || entry;
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      let content = "";
      if (typeof msg.content === "string") content = msg.content;
      else if (Array.isArray(msg.content))
        content = msg.content.filter(b => b?.type === "text").map(b => b.text).join("\n");
      if (content.trim()) messages.push({ role: msg.role, content });
    } catch {}
  }
  return messages.slice(-limit);
}

module.exports = { parseSessionHistory };
```

---

## Frontend Structure

### Before
```
public/
  index.html   ← everything (CSS + HTML + JS)
```

### After
```
public/
  index.html          ← HTML skeleton only, no inline JS, no inline CSS
  css/
    app.css           ← all custom styles (extracted from <style> block)
  js/
    config.js         ← AGENT_LABELS, WS_FILES constants
    ui.js             ← esc(), scroll(), showToast(), renderMarkdown(), addCopyButtons()
    agents.js         ← loadAgents(), selectAgent(), agentLabel(), setAgentWorking()
    chat.js           ← sendMsg(), processQueue(), addUser(), addBotMsg(), addBotPlaceholder(), updateBotMsg(), fetchWithRetry(), sleep()
    history.js        ← loadChatHistory(), clearChatAndLoadHistory()
    memory.js         ← loadMemories(), loadMoreMemories(), deleteMemory(), loadSqliteTab(), switchMemTab(), debouncedSearch()
    sessions.js       ← loadSessions(), deleteSession()
    jobs.js           ← loadJobs(), runJob()
    stats.js          ← loadStats(), formatTokens()
    settings.js       ← buildWorkspaceFiles(), toggleWsFile(), saveWsFile(), loadCron()
    quickactions.js   ← sendReminder(), sendCustomReminder(), addToThings()
    app.js            ← switchTab(), loadStatus(), setDot(), init (DOMContentLoaded)
  manifest.json
  sw.js
```

### `public/index.html` (after refactor, ~100 lines):
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>🛰️ Sputnik Mission Control</title>
  <!-- External CDNs -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <!-- App styles -->
  <link rel="stylesheet" href="/css/app.css"/>
  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <meta name="apple-mobile-web-app-capable" content="yes">
</head>
<body class="text-white flex flex-col" style="height:100vh">

  <!-- Header -->
  <!-- ... HTML structure only, no onclick= inline handlers where possible ... -->

  <!-- Scripts (load order matters) -->
  <script src="/js/config.js"></script>
  <script src="/js/ui.js"></script>
  <script src="/js/agents.js"></script>
  <script src="/js/chat.js"></script>
  <script src="/js/history.js"></script>
  <script src="/js/memory.js"></script>
  <script src="/js/sessions.js"></script>
  <script src="/js/jobs.js"></script>
  <script src="/js/stats.js"></script>
  <script src="/js/settings.js"></script>
  <script src="/js/quickactions.js"></script>
  <script src="/js/app.js"></script>   <!-- last: calls init() -->
</body>
</html>
```

### JS module dependencies (load order):
```
config.js       ← no deps
ui.js           ← no deps (uses marked, hljs from CDN)
agents.js       ← config.js, ui.js
chat.js         ← config.js, ui.js, agents.js
history.js      ← ui.js, agents.js, chat.js
memory.js       ← ui.js
sessions.js     ← ui.js
jobs.js         ← ui.js
stats.js        ← ui.js, memory.js
settings.js     ← ui.js
quickactions.js ← ui.js
app.js          ← all of the above (init + switchTab)
```

---

## File sizes (target)

| File | Target lines |
|------|-------------|
| server.js | ~30 |
| config.js | ~15 |
| routes/*.js | ~30–60 each |
| lib/*.js | ~30–50 each |
| public/index.html | ~100 |
| public/css/app.css | ~80 |
| public/js/*.js | ~30–80 each |

---

## Implementation Steps

### Step 1 — Backend

1. Create `config.js` with all constants
2. Create `lib/cleanup.js` — extract `cleanupOrphanSessions()` + `startCleanup()`
3. Create `lib/history.js` — extract `parseSessionHistory()` helper
4. Create `routes/` folder — create one file per route group, move handlers
5. Rewrite `server.js` as thin entry point
6. Test: `node server.js` starts, all endpoints respond

**Test all endpoints after:**
```bash
curl http://localhost:3100/api/status
curl http://localhost:3100/api/chat/history?agentId=main&limit=2
curl http://localhost:3100/api/sessions
curl http://localhost:3100/api/memories/list?limit=2
curl http://localhost:3100/api/cron
curl http://localhost:3100/api/stats/system
```

### Step 2 — Frontend

1. Extract `<style>` block → `public/css/app.css`
2. Create `public/js/config.js` with `AGENT_LABELS`, `WS_FILES`
3. Create `public/js/ui.js` — shared helpers
4. Create remaining JS modules — move functions from index.html
5. Strip index.html to HTML skeleton + `<script src=...>` tags
6. Test: open browser, verify all tabs work

### Step 3 — Cleanup

1. Delete old `SPEC.md` from root (already moved to `docs/`)
2. Git commit: `refactor: split monolithic files into modules`
3. Git push

---

## Rules for the implementing agent

- **Do NOT add any new features** — pure refactor only
- **Do NOT change any API contracts** — same URLs, same response shapes
- **Do NOT change any HTML structure or CSS classes** — same visual result
- **Test after EACH step** before moving to the next
- **If something breaks** — fix it before continuing
- **Commit after backend refactor** and **again after frontend refactor**
