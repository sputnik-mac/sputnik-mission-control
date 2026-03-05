# Sputnik Mission Control — Technical Specification
> Version: 1.0 | Author: Sputnik 🛰️ | Date: 2026-03-05

## Overview

Sputnik Mission Control is a self-hosted web dashboard for managing the OpenClaw AI gateway, agents, memory, and cron jobs. It runs on a Mac Mini, accessible remotely via Tailscale HTTPS.

**Stack:**
- Backend: Node.js + Express (no framework bloat)
- Frontend: Vanilla JS + Tailwind CDN (no build step)
- Storage: OpenClaw `.jsonl` session files, Qdrant (vector DB), SQLite (`personal.sqlite`)
- Transport: HTTP polling (no SSE/WS — Tailscale buffers chunked responses)
- Auth: Bearer token in server-side proxy to Gateway (client never sees token)

**Current endpoints:**
```
GET  /api/status       → gateway + ollama + qdrant health
GET  /api/agents       → list agent directories
GET  /api/sessions     → parsed sessions.json for all agents
GET  /api/memories     → Qdrant collection point count
GET  /api/cron         → openclaw cron list (raw)
POST /api/chat         → enqueue message → { jobId }
GET  /api/chat/:jobId  → poll job status → { status, text }
```

---

## Block 1 — Chat UX

### 1.1 Session History on Load

**Goal:** When user opens MC, show last N messages from the active session file.

**Implementation:**
```
GET /api/chat/history?agentId=main&limit=30
```
- Read `sessions.json` → get `sessionFile` path for `agent:main:telegram:direct:277364372`
- Parse `.jsonl` — each line is a JSON object with `role` (`user`|`assistant`|`tool`) and `content`
- Skip `tool` role messages and compaction markers
- Return last 30 `user`/`assistant` pairs
- Filter out system prompt lines (they start with role: `system`)

**Frontend:**
- On `DOMContentLoaded` → fetch history → prepend messages to `#messages` div
- Show subtle separator: `── загружено из истории ──` before live messages
- Scroll to bottom after load

**Edge cases:**
- `.jsonl` may have compaction summary lines (JSON with `type: "compaction"`) — skip them
- Content may be array of content blocks (Anthropic format) — extract `.text` from `type: "text"` block
- File may be missing or empty — silently render empty state

---

### 1.2 Markdown Rendering

**Goal:** Render markdown in bot responses (code, bold, lists, headers).

**Library:** [`marked`](https://cdn.jsdelivr.net/npm/marked/marked.min.js) + [`highlight.js`](https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js) — CDN, no build.

**Implementation:**
```js
import { marked } from "marked";
import hljs from "highlight.js";

marked.setOptions({
  highlight: (code, lang) => hljs.highlight(code, { language: lang || "plaintext" }).value,
  breaks: true,
  gfm: true,
});

function renderBotMsg(text) {
  return marked.parse(text); // returns HTML string
}
```

Set `innerHTML` instead of `textContent` for bot messages only. User messages stay plain text (XSS prevention).

**CSS additions:**
```css
.bot-content h1, h2, h3 { font-weight: 600; margin: 8px 0 4px; }
.bot-content ul, ol { padding-left: 16px; }
.bot-content pre { background: rgba(0,0,0,.3); border-radius: 8px; padding: 12px; overflow-x: auto; }
.bot-content code { font-family: "JetBrains Mono", monospace; font-size: 12px; }
.bot-content p { margin-bottom: 6px; }
```

**Copy button on code blocks:**
After `marked.parse()`, post-process the HTML: inject `<button class="copy-btn">` into each `<pre>` block via DOM manipulation.

---

### 1.3 "Save to Memory" Button

**Goal:** Any bot message can be saved to Qdrant mem0 with one click.

**API:**
```
POST /api/memory/save
Body: { text: "...", agentId: "main" }
Response: { ok: true, id: "..." }
```

**Server:**
- Forward to Gateway `POST /v1/chat/completions` with special system prompt instructing agent to save the text to mem0
- OR: call Qdrant API directly — add point to `sputnik-memory` collection with the text + `user_id: "serhii"` metadata

**Frontend:**
- Each bot message has a `⭐` icon (hidden, revealed on hover)
- Click → POST → show brief `✓ сохранено` toast (2s)

---

### 1.4 Agent Switch In-Chat

Already doable via sidebar. No extra work needed — sidebar always visible.

---

## Block 2 — Memory Browser

### 2.1 Qdrant Memory List + Search

**API:**
```
GET  /api/memories/list?q=&limit=20&offset=0
POST /api/memories/delete  Body: { id: "point-id" }
```

**Server — list:**
```js
// Qdrant scroll API
POST http://localhost:6333/collections/sputnik-memory/points/scroll
Body: {
  limit: 20,
  offset: offset,
  with_payload: true,
  with_vector: false,
  ...(q ? { filter: { must: [{ key: "data", match: { text: q } }] } } : {})
}
```

For semantic search (not text filter):
```
POST /collections/sputnik-memory/points/search
```
Requires embedding the query via Ollama first:
```js
const emb = await fetch("http://localhost:11434/api/embeddings", {
  method: "POST",
  body: JSON.stringify({ model: "nomic-embed-text", prompt: q })
});
const { embedding } = await emb.json();
// then use embedding in Qdrant search
```

**Server — delete:**
```js
DELETE http://localhost:6333/collections/sputnik-memory/points
Body: { points: [id] }
```

**Frontend — Memory tab:**
```
┌─────────────────────────────────────┐
│ 🔍 [поиск по памяти...     ]  44 pts│
├─────────────────────────────────────┤
│ ┌──────────────────────────────┐    │
│ │ Сергей работает в PaidPex    │    │
│ │ #work  2026-03-05  🗑         │    │
│ └──────────────────────────────┘    │
│ ┌──────────────────────────────┐    │
│ │ Зарплата $2500 USDT/month    │    │
│ │ #finance  2026-03-04  🗑      │    │
│ └──────────────────────────────┘    │
└─────────────────────────────────────┘
```

- Debounced search (300ms after typing)
- Pagination: load more button
- Delete with confirm dialog

---

### 2.2 SQLite Browser

**API:**
```
GET /api/sqlite/timeline?limit=20
GET /api/sqlite/entities?domain=&limit=20
GET /api/sqlite/decisions?limit=20
```

**Server:**
```js
const Database = require("better-sqlite3");
const db = new Database("/Users/sputnik/.openclaw/memory/personal.sqlite", { readonly: true });

app.get("/api/sqlite/timeline", (req, res) => {
  const rows = db.prepare("SELECT * FROM timeline ORDER BY ts DESC LIMIT ?").all(req.query.limit || 20);
  res.json(rows);
});
```

**Frontend:** Three sub-tabs inside Memory tab: `Qdrant` · `Timeline` · `Entities` · `Decisions`

---

### 2.3 Memory Growth Chart

**API:**
```
GET /api/memories/stats
Response: { total: 44, byDay: [{ date: "2026-03-05", count: 12 }, ...] }
```

**Implementation:**
- Qdrant points have `created_at` in payload (if mem0 sets it)
- Aggregate by date from payload metadata
- Use [Chart.js CDN](https://cdn.jsdelivr.net/npm/chart.js) for a simple bar chart

```js
// Minimal Chart.js bar chart
new Chart(ctx, {
  type: "bar",
  data: { labels: dates, datasets: [{ data: counts, backgroundColor: "#6366f1" }] },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
});
```

---

## Block 3 — Sessions

### 3.1 Delete Session from UI

**API:**
```
DELETE /api/sessions/:encodedKey
```

**Server:**
```js
app.delete("/api/sessions/:key", (req, res) => {
  const key = decodeURIComponent(req.params.key);
  // 1. Load sessions.json
  // 2. Get sessionFile path
  // 3. Delete .jsonl file
  // 4. Remove key from sessions.json
  // 5. Save sessions.json
  res.json({ ok: true });
});
```

**Guard:** Refuse to delete `agent:main:telegram:direct:277364372` — it's the main session.

**Frontend:** 🗑 button on each session card. Confirm dialog: "Удалить сессию X? Это удалит историю."

---

### 3.2 View Session History

**API:**
```
GET /api/sessions/:encodedKey/history?limit=20
```

**Server:** Same parsing logic as Block 1.1 but by session key.

**Frontend:** Click session card → expand inline → show last 10 messages in a scrollable mini-chat.

---

### 3.3 Auto-cleanup Cron

**Server-side:** Add an interval that runs every 24h:
```js
setInterval(cleanupOrphanSessions, 24 * 60 * 60 * 1000);

function cleanupOrphanSessions() {
  // For each agent: load sessions.json
  // Delete any key matching /openai:[0-9a-f-]{36}/ pattern
  // Delete their .jsonl files
  // Log count deleted to /tmp/mc.log
}
```

---

## Block 4 — Jobs / Cron

### 4.1 Cron Cards

**API:**
```
GET /api/cron         → full cron list with last run status
POST /api/cron/:id/run → trigger manual run
GET /api/cron/:id/log  → last run log (tail of session .jsonl)
```

**Server — cron list:**
```js
// openclaw cron list --json returns array of job objects
// Each has: id, label, schedule, lastRunAt, lastRunStatus, nextRunAt, agentId
const out = execSync("openclaw cron list --json 2>/dev/null", { timeout: 5000 });
res.json(JSON.parse(out));
```

**Server — manual trigger:**
```js
execSync(`openclaw cron run ${req.params.id}`, { timeout: 5000 });
```

**Frontend — card layout:**
```
┌─────────────────────────────────────────┐
│ 🌙 github-agent-night              [▶ Run]│
│ Schedule: 30 16 * * * (UTC) = 23:30 BKK│
│ Last run: 2026-03-05 16:30 ✅ success   │
│ Next run: 2026-03-06 16:30             │
│                              [📋 Logs]  │
└─────────────────────────────────────────┘
```

Status colors: `success` → green dot · `error` → red dot · `running` → pulse · `never` → gray

---

### 4.2 GitHub Night Agent Card

Special card (pinned to top) if `github-agent` is detected:
```
┌─────────────────────────────────────────┐
│ 🐙 GitHub Night Agent              [▶ Run]│
│ Status: last run 2026-03-05 ✅          │
│ [📋 View last report]                  │
└─────────────────────────────────────────┘
```

"View last report" → opens the last session `.jsonl` of `github-agent:cron:*` — extracts final assistant message.

---

## Block 5 — Stats / Dashboard

### 5.1 Token Usage

**Source:** OpenClaw may write usage logs — check `~/.openclaw/logs/` or `~/.openclaw/usage.json`.

**Fallback:** Parse `.jsonl` session files — each line may contain `usage: { input_tokens, output_tokens }` in tool result objects.

**API:**
```
GET /api/stats/usage?days=7
Response: { byDay: [{ date, inputTokens, outputTokens, costUsd }], total: {...} }
```

**Cost calculation:**
```js
const PRICING = {
  "claude-sonnet-4-6": { input: 3/1e6, output: 15/1e6 },   // $/token
  "llama-3.3-70b-versatile": { input: 0.59/1e6, output: 0.79/1e6 }, // Groq
};
```

---

### 5.2 System Stats Widget

Always-visible footer or sidebar section:
```
Gateway 🟢  Ollama 🟢  Qdrant 🟢
Memory: 44 pts  |  Sessions: 9  |  Uptime: 2h 34m
```

Refresh every 30s via `/api/status`.

---

### 5.3 Sessions by Size

Already available from Block 3 — `sizeKb` field. Show top-5 in Stats tab as a mini bar chart or sorted list.

---

## Block 6 — Quick Actions

### 6.1 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Send message |
| `Cmd+K` | Focus search (Memory tab) |
| `Cmd+1/2/3` | Switch tabs (Chat / Sessions / Settings) |
| `Esc` | Close modal/dialog |

**Implementation:**
```js
document.addEventListener("keydown", (e) => {
  if (e.metaKey && e.key === "Enter") sendMsg();
  if (e.metaKey && e.key === "1") switchTab("chat");
  if (e.metaKey && e.key === "2") switchTab("sessions");
  if (e.metaKey && e.key === "3") switchTab("settings");
});
```

---

### 6.2 "Remind in X minutes"

**Frontend:** Quick action panel below chat input:
```
[⏰ 5 min] [⏰ 15 min] [⏰ 30 min] [⏰ custom]
```

**API:**
```
POST /api/remind
Body: { minutes: 15, text: "напомни мне..." }
```

**Server:**
```js
setTimeout(async () => {
  await fetch("https://api.telegram.org/bot{TOKEN}/sendMessage", {
    method: "POST",
    body: JSON.stringify({ chat_id: 277364372, text: `⏰ ${body.text}` })
  });
}, minutes * 60 * 1000);
res.json({ ok: true });
```

---

### 6.3 "Add to Things"

**API:**
```
POST /api/things
Body: { title: "...", notes: "...", when: "today" }
```

**Server:**
```js
const { execSync } = require("child_process");
const url = `things:///add?title=${encodeURIComponent(title)}&notes=${encodeURIComponent(notes)}&when=${when}`;
execSync(`open "${url}"`);
res.json({ ok: true });
```

**Frontend:** Button on any message → pre-fill title from message text (truncated to 60 chars).

---

## Block 7 — Mobile-Friendly (PWA)

### 7.1 Responsive Layout

**Breakpoints:**
- `< 640px` (mobile): sidebar collapses → bottom nav bar
- `640px–1024px` (tablet): sidebar 200px wide
- `> 1024px` (desktop): current layout (sidebar 220px)

**Mobile bottom nav:**
```html
<nav class="mobile-nav">  <!-- only visible < 640px -->
  <button onclick="selectAgent('main')">🛰️</button>
  <button onclick="selectAgent('github-agent')">🐙</button>
  <button onclick="switchTab('sessions')">🔗</button>
  <button onclick="switchTab('settings')">⚙️</button>
</nav>
```

---

### 7.2 PWA Manifest

**`/public/manifest.json`:**
```json
{
  "name": "Sputnik Mission Control",
  "short_name": "Sputnik",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f1117",
  "theme_color": "#6366f1",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }]
}
```

Add to `<head>`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
```

**Service Worker** (`/public/sw.js`) — cache static assets only (HTML, CSS, JS). Never cache API responses.

---

## Implementation Order

| Phase | Blocks | Est. effort |
|-------|--------|-------------|
| **Phase 1** | Chat history + Markdown | 1 day |
| **Phase 2** | Memory browser (Qdrant list + search + delete) | 1 day |
| **Phase 3** | Cron cards + manual run + logs | 0.5 day |
| **Phase 4** | Sessions delete + history expand + auto-cleanup | 0.5 day |
| **Phase 5** | Stats (usage, memory chart, system stats) | 1 day |
| **Phase 6** | Quick actions (shortcuts, remind, Things) | 0.5 day |
| **Phase 7** | Mobile + PWA | 1 day |

**Total: ~5.5 developer-days**

---

## File Structure (current + additions)

```
sputnik-mission-control/
├── server.js              # Express API server
├── package.json
├── SPEC.md                # This file
├── public/
│   ├── index.html         # Single-page app
│   ├── manifest.json      # PWA manifest (NEW)
│   ├── sw.js              # Service worker (NEW)
│   └── icon-192.png       # PWA icon (NEW)
└── .env                   # GATEWAY_TOKEN, PORT
```

---

## API Contract Summary (full, including new)

```
# Status
GET  /api/status                          → { gateway, ollama, qdrant, memoryCount, uptime }

# Agents
GET  /api/agents                          → [{ id }]

# Chat
POST /api/chat                            → { jobId, status: "pending" }
GET  /api/chat/:jobId                     → { status, text?, error? }
GET  /api/chat/history?agentId&limit      → [{ role, content, ts }]

# Memory — Qdrant
GET  /api/memories/list?q&limit&offset    → { points: [...], total }
POST /api/memories/save                   → { ok, id }
DELETE /api/memories/:id                  → { ok }
GET  /api/memories/stats                  → { total, byDay }

# Memory — SQLite
GET  /api/sqlite/timeline?limit           → [...]
GET  /api/sqlite/entities?domain&limit    → [...]
GET  /api/sqlite/decisions?limit          → [...]

# Sessions
GET  /api/sessions                        → [{ key, agent, origin, sizeKb, updatedAt, ... }]
DELETE /api/sessions/:key                 → { ok }
GET  /api/sessions/:key/history?limit     → [{ role, content }]

# Cron
GET  /api/cron                            → [{ id, label, schedule, lastRunAt, lastRunStatus, nextRunAt }]
POST /api/cron/:id/run                    → { ok }
GET  /api/cron/:id/log                    → { lines: [...] }

# Stats
GET  /api/stats/usage?days               → { byDay, total, costUsd }

# Quick Actions
POST /api/remind                          → { ok }   Body: { minutes, text }
POST /api/things                          → { ok }   Body: { title, notes, when }
```

---

## Notes for Developer

1. **Auth:** All `/api/*` routes are server-side only. Gateway token never exposed to browser.
2. **No build step:** All frontend is vanilla JS + CDN libraries. `node server.js` is all you need.
3. **Session key:** Mission Control always uses `x-openclaw-session-key: telegram:direct:277364372` for `main` agent — same context as Telegram.
4. **Qdrant:** Running locally on `localhost:6333`. Collection: `sputnik-memory`. Embeddings: Ollama `nomic-embed-text` (768 dims).
5. **SQLite:** Read-only access to `/Users/sputnik/.openclaw/memory/personal.sqlite`.
6. **Tailscale:** Serve config maps `https://sputniks-mac-mini.tailcde006.ts.net:8444` → `http://127.0.0.1:3100`.
7. **No SSE/WebSocket:** Tailscale buffers chunked responses. Use polling for all async operations.
8. **LaunchAgent:** Server auto-starts via `~/Library/LaunchAgents/dev.sputnik.mission-control.plist`. Logs to `/tmp/mc.log`.

---

## Block 8 — Автоски (Automated Scripts / Auto-tasks)

> Planned feature — to be implemented

### Concept
A system for creating and running automated scripts directly from Mission Control.
Instead of cron jobs (which are time-based), these are **trigger-based** or **on-demand** scripts.

### Use cases
- "Every time I open MC → run a quick summary of what happened while I was away"
- "When GitHub agent finishes → notify me with a summary"
- "Click a button → run a custom script (e.g. pull latest PRs, check salary data, scrape a site)"

### Planned UI
New tab `🤖 Automate` with:
- List of saved scripts (name, description, last run)
- ▶ Run button per script
- Script editor: prompt + schedule (optional) + trigger type
- Run history with output

### Planned API
```
GET  /api/automate          → list saved scripts
POST /api/automate          → create new script
POST /api/automate/:id/run  → run a script now
GET  /api/automate/:id/logs → last run output
DELETE /api/automate/:id    → delete script
```

### Storage
Scripts stored in `~/.openclaw/workspace/automate/` as `.json` files:
```json
{
  "id": "uuid",
  "name": "Daily Summary",
  "prompt": "Summarize what happened today...",
  "trigger": "manual",
  "lastRunAt": null,
  "lastRunStatus": null
}
```
