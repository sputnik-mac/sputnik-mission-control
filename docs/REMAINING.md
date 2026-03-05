# Remaining Tasks — Sputnik Mission Control
> Date: 2026-03-05 | Priority: HIGH

## Context

The project is now properly refactored:
- `server.js` — thin entry point (~44 lines)
- `routes/*.js` — one file per API route group
- `public/index.html` — 220 lines, HTML only
- `public/js/*.js` — separate JS modules
- `public/css/app.css` — extracted styles

## Task 1 — Agent chips in header (RE-APPLY)

The agent chips feature was implemented but then overwritten by the refactor commit.
Must re-apply to the CURRENT clean structure.

### Changes needed in `public/index.html`

Replace the current `<header>` block:
```html
<!-- Header -->
<header class="glass border-b border-white/8 px-5 py-3 flex items-center justify-between flex-shrink-0">
  <div class="flex items-center gap-3">
    <span class="text-xl">🛰️</span>
    <div>
      <h1 class="text-sm font-semibold leading-tight">Sputnik Mission Control</h1>
      <p class="text-xs text-white/30 mono" id="model-label">claude-sonnet-4-6</p>
    </div>
  </div>
  <div class="flex items-center gap-5 text-xs">
    <div class="flex items-center gap-1.5"><span class="dot" id="d-gw"></span><span class="text-white/40">Gateway</span></div>
    <div class="flex items-center gap-1.5"><span class="dot" id="d-ol"></span><span class="text-white/40">Ollama</span></div>
    <span class="text-white/20 mono text-xs" id="mem-count"></span>
  </div>
</header>
```

With:
```html
<!-- Header -->
<header class="glass border-b border-white/8 px-5 py-3 flex items-center gap-4 flex-shrink-0">
  <div class="flex items-center gap-2 flex-shrink-0">
    <span class="text-lg">🛰️</span>
    <h1 class="text-sm font-semibold">Mission Control</h1>
  </div>
  <!-- Agent chips — filled by agents.js -->
  <div class="flex items-center gap-2 flex-1 justify-center" id="agent-chips"></div>
  <!-- System status -->
  <div class="flex items-center gap-3 text-xs flex-shrink-0">
    <div class="flex items-center gap-1.5"><span class="dot" id="d-gw"></span><span class="text-white/35">GW</span></div>
    <div class="flex items-center gap-1.5"><span class="dot" id="d-ol"></span><span class="text-white/35">AI</span></div>
    <span class="text-white/20 mono" id="mem-count"></span>
  </div>
</header>
```

### Changes needed in `public/css/app.css`

Add at the end:
```css
/* Agent header chips */
.agent-chip { display:flex; align-items:center; gap:6px; padding:5px 10px; border-radius:20px; border:1px solid rgba(255,255,255,.08); cursor:pointer; transition:all .2s; user-select:none; }
.agent-chip:hover { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.15); }
.agent-chip.active-chip { border-color:rgba(99,102,241,.4); background:rgba(99,102,241,.1); }
.chip-icon { font-size:14px; line-height:1; }
.chip-name { font-size:12px; font-weight:500; color:rgba(255,255,255,.7); }
.chip-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.chip-dot-idle { background:#10b981; box-shadow:0 0 5px #10b981; }
.chip-dot-busy { background:#f59e0b; box-shadow:0 0 5px #f59e0b; animation:chipBusyPulse 1s ease-in-out infinite; }
.chip-dot-offline { background:rgba(255,255,255,.2); }
@keyframes chipBusyPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
.chip-status-text { overflow:hidden; max-width:0; opacity:0; white-space:nowrap; transition:max-width .3s ease, opacity .3s ease; }
.chip-status-text.visible { max-width:90px; opacity:1; }
```

### Changes needed in `public/js/agents.js`

Add these functions (and call `buildAgentChips(all)` inside `loadAgents()` after building sidebar HTML):

```js
function buildAgentChips(agents) {
  const el = document.getElementById("agent-chips");
  if (!el) return;
  el.innerHTML = agents.map(a => {
    const lb = agentLabel(a.id);
    return `
    <div class="agent-chip ${a.id === (window.activeAgent||'main') ? 'active-chip' : ''}"
         id="chip-${a.id}" onclick="selectAgent('${a.id}')">
      <span class="chip-icon">${lb.icon}</span>
      <span class="chip-name">${lb.name}</span>
      <span class="chip-dot chip-dot-idle" id="chip-dot-${a.id}"></span>
      <span class="chip-status chip-status-text" id="chip-txt-${a.id}"></span>
    </div>`;
  }).join('<span style="color:rgba(255,255,255,.15);font-size:11px">·</span>');
}

function setAgentChipStatus(agentId, status) {
  const dot = document.getElementById(`chip-dot-${agentId}`);
  const txt = document.getElementById(`chip-txt-${agentId}`);
  if (!dot || !txt) return;
  dot.className = "chip-dot " + (
    status === "idle" ? "chip-dot-idle" :
    status === "processing" ? "chip-dot-busy" : "chip-dot-offline"
  );
  txt.textContent = status === "processing" ? "thinking..." : status === "offline" ? "offline" : "";
  txt.classList.toggle("visible", status !== "idle");
}
```

Update `setAgentWorking(agentId, working)` to also call `setAgentChipStatus`:
```js
function setAgentWorking(agentId, working) {
  const icon = document.querySelector(`#ag-${agentId} .agent-icon`);
  if (icon) icon.classList.toggle("working", working);
  setAgentChipStatus(agentId, working ? "processing" : "idle");
}
```

Update `selectAgent(id)` to also update chip active state:
```js
// Add these lines inside selectAgent():
document.querySelectorAll(".agent-chip").forEach(el => el.classList.remove("active-chip"));
const chip = document.getElementById("chip-" + id);
if (chip) chip.classList.add("active-chip");
```

---

## Task 2 — Stats: fix token usage section

**Discovery:** OpenClaw does NOT store token usage in `.jsonl` session files.
The JSONL entry types are: `session`, `message`, `custom`, `compaction`, `model_change`, `thinking_level_change`.
None contain `usage.input_tokens`.

**Fix in `routes/stats.js`:** Change `/api/stats/usage` to return real data:
- Instead of scanning for token usage (which doesn't exist), count message volume by day
- Count `message` type entries with `role: assistant` per day as a proxy metric

```js
// In routes/stats.js, replace the usage scanning logic:
router.get("/stats/usage", async (req, res) => {
  const fs = require("fs");
  const { OPENCLAW_HOME } = require("../config");
  const days = parseInt(req.query.days) || 7;
  const byDay = {};

  try {
    const sessionsPath = `${OPENCLAW_HOME}/agents/main/sessions/sessions.json`;
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
    for (const [key, s] of Object.entries(sessions)) {
      if (!s.sessionFile) continue;
      try {
        const lines = fs.readFileSync(s.sessionFile, "utf8").split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            if (obj.type !== "message") continue;
            const msg = obj.message || {};
            if (msg.role !== "assistant") continue;
            const date = (obj.timestamp || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
            if (!byDay[date]) byDay[date] = { messages: 0, costUsd: 0 };
            byDay[date].messages += 1;
            // Rough cost estimate: ~$0.01 per assistant message average
            byDay[date].costUsd += 0.01;
          } catch {}
        }
      } catch {}
    }
  } catch {}

  const result = Object.entries(byDay)
    .map(([date, v]) => ({ date, messages: v.messages, costUsd: +v.costUsd.toFixed(2) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);

  const total = result.reduce((acc, d) => ({
    messages: acc.messages + d.messages,
    costUsd: +(acc.costUsd + d.costUsd).toFixed(2),
  }), { messages: 0, costUsd: 0 });

  res.json({ byDay: result, total, note: "Token data not available — showing message count" });
});
```

**Fix in `public/js/stats.js`:** Update the chart to show messages instead of tokens:
- Replace `inputTokens`/`outputTokens` labels with `messages`
- Show message count per day on the bar chart
- Remove Input/Output token display, show just Messages and ~Cost

---

## Task 3 — Save to memory button on bot messages

### New server endpoint in `routes/memory.js`:
```js
router.post("/memory/save", async (req, res) => {
  const { GATEWAY, TOKEN } = require("../config");
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    // Send to gateway asking agent to save to memory
    const r = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "x-openclaw-session-key": "telegram:direct:277364372",
      },
      body: JSON.stringify({
        model: "openclaw:main",
        messages: [{ role: "user", content: `Запомни это: ${text}` }],
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json();
    res.json({ ok: true, response: data.choices?.[0]?.message?.content?.slice(0, 100) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

### Frontend in `public/js/chat.js`:

In `addBotMsg(text, agentId)` function — add a ⭐ save button overlay on the message bubble. Reveal on hover:

```js
// Add to the bot message HTML in addBotMsg():
// After the bot-content div, add:
`<div class="msg-actions">
  <button class="save-mem-btn" onclick="saveToMemory(this)" data-text="${text.replace(/"/g,'&quot;').slice(0,500)}" title="Сохранить в память">⭐</button>
</div>`
```

Add CSS to `public/css/app.css`:
```css
.msg-actions { display:flex; justify-content:flex-end; margin-top:6px; opacity:0; transition:opacity .2s; }
.msg-bot:hover .msg-actions { opacity:1; }
.save-mem-btn { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:8px; padding:3px 8px; font-size:11px; cursor:pointer; color:rgba(255,255,255,.4); transition:all .15s; }
.save-mem-btn:hover { background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.3); color:#fbbf24; }
```

Add function `saveToMemory(btn)` to `public/js/memory.js`:
```js
async function saveToMemory(btn) {
  const text = btn.dataset.text;
  btn.textContent = "⏳";
  btn.disabled = true;
  try {
    const r = await fetch("/api/memory/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const d = await r.json();
    if (d.ok) { btn.textContent = "✅"; showToast("✅ Сохранено в память"); }
    else { btn.textContent = "❌"; }
  } catch { btn.textContent = "❌"; }
}
```

---

## Task 4 — Session history expand in Sessions tab

### Server endpoint already in SPEC but not implemented:
Add to `routes/sessions.js`:
```js
router.get("/sessions/:key/history", (req, res) => {
  const fs = require("fs");
  const { OPENCLAW_HOME } = require("../config");
  const { parseSessionHistory } = require("../lib/history");
  const key = decodeURIComponent(req.params.key);
  const limit = parseInt(req.query.limit) || 10;
  const agents = ["main", "github-agent", "claude-code"];

  for (const agent of agents) {
    try {
      const p = `${OPENCLAW_HOME}/agents/${agent}/sessions/sessions.json`;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (data[key] && data[key].sessionFile) {
        const messages = parseSessionHistory(data[key].sessionFile, limit);
        return res.json(messages);
      }
    } catch {}
  }
  res.json([]);
});
```

### Frontend in `public/js/sessions.js`:

Update session card HTML to include an expand button:
```html
<!-- Add to each session card: -->
<button onclick="toggleSessionHistory('${encodeURIComponent(s.key)}')" 
  class="text-xs text-white/25 hover:text-indigo-400 transition">📋</button>
<!-- And below the card div, add a collapsible history panel: -->
<div id="sh-${encodeURIComponent(s.key).replace(/%/g,'_')}" class="hidden mt-2 space-y-2 pl-2">
</div>
```

Add function:
```js
async function toggleSessionHistory(encodedKey) {
  const safeId = encodedKey.replace(/%/g, '_');
  const el = document.getElementById(`sh-${safeId}`);
  if (!el) return;
  if (el.classList.contains("hidden")) {
    el.classList.remove("hidden");
    el.innerHTML = '<div class="text-white/30 text-xs py-2">Загружаю...</div>';
    try {
      const r = await fetch(`/api/sessions/${encodedKey}/history?limit=10`);
      const msgs = await r.json();
      if (!msgs.length) { el.innerHTML = '<div class="text-white/30 text-xs py-2">Нет сообщений</div>'; return; }
      el.innerHTML = msgs.map(m => `
        <div class="glass rounded-xl px-3 py-2 ${m.role === 'user' ? 'ml-4' : 'mr-4'}">
          <div class="text-xs text-white/25 mb-1">${m.role === 'user' ? '👤' : '🛰️'}</div>
          <div class="text-xs text-white/60 leading-relaxed">${esc(String(m.content).slice(0, 200))}${m.content.length > 200 ? '…' : ''}</div>
        </div>`).join("");
    } catch { el.innerHTML = '<div class="text-red-400/60 text-xs py-2">Ошибка</div>'; }
  } else {
    el.classList.add("hidden");
  }
}
```

---

## Implementation Order

1. Task 1 (agent chips) — HTML + CSS + agents.js changes
2. Task 2 (stats fix) — routes/stats.js + public/js/stats.js
3. Task 3 (save to memory) — routes/memory.js + chat.js + memory.js + css
4. Task 4 (session history) — routes/sessions.js + sessions.js

## Testing checklist

```bash
# After each task:
pkill -f "node server.js"; sleep 2
cd /Users/sputnik/Projects/sputnik-mission-control
nohup node server.js > /tmp/mc.log 2>&1 &
sleep 3

# Task 1: check header has agent-chips div
curl -s http://localhost:3100/ | grep -c "agent-chips"  # should be 1

# Task 2: check usage returns messages count  
curl -s http://localhost:3100/api/stats/usage | python3 -c "import sys,json;d=json.load(sys.stdin);print('total messages:',d['total'].get('messages',0))"

# Task 3: test save to memory
curl -s -X POST http://localhost:3100/api/memory/save \
  -H "Content-Type: application/json" \
  -d '{"text":"test memory save"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok:',d.get('ok'))"

# Task 4: test session history endpoint
curl -s "http://localhost:3100/api/sessions/agent%3Amain%3Atelegram%3Adirect%3A277364372/history?limit=3" | python3 -c "import sys,json;d=json.load(sys.stdin);print('messages:',len(d))"
```

## Git commits

```bash
git add -A && git commit -m "feat: agent chips in header, stats fix, save-to-memory, session history expand"
git push origin main
```
