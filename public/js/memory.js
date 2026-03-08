let memOffset = 0;
let memQuery = "";
let memSearchTimer = null;

const MEM_TABS = ["timeline","entities","decisions","health","patterns"];

function switchMemTab(t) {
  MEM_TABS.forEach(n => {
    const el  = document.getElementById("mem-" + n);
    const btn = document.getElementById("mt-" + n);
    if (el)  el.style.display  = n === t ? "block" : "none";
    if (btn) btn.className = "mem-tab " + (n === t ? "on" : "off");
  });
  const qel = document.getElementById("mem-qdrant");
  if (qel) qel.style.display = "none";
  if (t === "timeline")  loadTimeline();
  if (t === "entities")  loadEntities();
  if (t === "decisions") loadDecisions();
  if (t === "health")    loadHealth();
  if (t === "patterns")  loadPatterns();
}

/* ─── Qdrant memories ─── */
function debouncedSearch() {
  clearTimeout(memSearchTimer);
  memSearchTimer = setTimeout(() => {
    memOffset = 0; memQuery = document.getElementById("mem-search").value;
    loadMemories(true);
  }, 300);
}

async function loadMemories(reset = false) {
  if (reset) { memOffset = 0; document.getElementById("mem-list").innerHTML = ""; }
  try {
    const q = encodeURIComponent(memQuery);
    const r = await fetch(`/api/memories/list?q=${q}&limit=20&offset=${memOffset}`);
    const { points, total } = await r.json();
    document.getElementById("mem-total").textContent = total + " pts";
    const el = document.getElementById("mem-list");
    if (reset && points.length === 0) {
      el.innerHTML = '<div class="text-white/30 text-sm">Нет записей</div>'; return;
    }
    points.forEach(p => {
      const d = document.createElement("div");
      d.className = "glass rounded-2xl px-4 py-3";
      d.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-sm text-white/80 leading-relaxed">${esc(p.text||"—")}</div>
            <div class="text-xs text-white/25 mt-1 mono">${p.metadata?.created_at ? new Date(p.metadata.created_at).toLocaleDateString("ru-RU") : ""}</div>
          </div>
          <button onclick="deleteMemory('${p.id}')" class="text-white/20 hover:text-red-400 transition text-sm flex-shrink-0" title="Удалить">🗑</button>
        </div>`;
      el.appendChild(d);
    });
    memOffset += points.length;
    document.getElementById("mem-load-more").classList.toggle("hidden", points.length < 20);
  } catch {
    document.getElementById("mem-list").innerHTML = '<div class="text-white/30 text-sm">Ошибка загрузки</div>';
  }
}

function loadMoreMemories() { loadMemories(false); }

async function saveToMemory(btn) {
  const text = btn.dataset.text; btn.textContent = "⏳"; btn.disabled = true;
  try {
    const r = await fetch("/api/memory/save", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({text}) });
    const d = await r.json();
    if (d.ok) { btn.textContent = "✅"; showToast("✅ Сохранено в память"); }
    else btn.textContent = "❌";
  } catch { btn.textContent = "❌"; }
}

async function deleteMemory(id) {
  if (!confirm("Удалить эту память?")) return;
  try { await fetch(`/api/memories/${encodeURIComponent(id)}`, {method:"DELETE"}); loadMemories(true); }
  catch { alert("Ошибка удаления"); }
}

/* ─── Timeline ─── */
async function loadTimeline() {
  const el = document.getElementById("mem-timeline");
  el.innerHTML = '<div class="text-white/30 text-sm">Загружаю...</div>';
  try {
    const rows = await fetch("/api/sqlite/timeline?limit=30").then(r=>r.json());
    if (!rows.length) { el.innerHTML = '<div class="text-white/30 text-sm">Нет событий. События добавляются автоматически из разговоров.</div>'; return; }
    const moodColor = { positive:"#10b981", negative:"#ef4444", neutral:"#6366f1", mixed:"#f59e0b" };
    el.innerHTML = rows.map(r => `
      <div class="glass rounded-2xl px-4 py-3 mb-2">
        <div class="flex items-start justify-between gap-2 mb-1">
          <span class="text-xs mono text-white/40">${r.date||""}</span>
          <span class="text-xs px-2 py-0.5 rounded-full" style="background:${(moodColor[r.mood]||'#6366f1')}22;color:${moodColor[r.mood]||'#a5b4fc'}">${r.mood||""}</span>
        </div>
        <div class="text-sm text-white/80 mb-1">${esc(r.summary||"")}</div>
        <div class="flex gap-3 mt-1">
          ${r.stress_level ? `<span class="text-xs text-white/30">😰 stress ${r.stress_level}/10</span>` : ""}
          ${r.energy_level ? `<span class="text-xs text-white/30">⚡ energy ${r.energy_level}/10</span>` : ""}
          ${r.domain ? `<span class="text-xs text-indigo-400/50">#${r.domain}</span>` : ""}
        </div>
      </div>`).join("");
  } catch { el.innerHTML = '<div class="text-red-400/60 text-sm">Ошибка</div>'; }
}

/* ─── Entities ─── */
async function loadEntities() {
  const el = document.getElementById("mem-entities");
  el.innerHTML = '<div class="text-white/30 text-sm">Загружаю...</div>';
  try {
    const rows = await fetch("/api/sqlite/entities?limit=30").then(r=>r.json());
    if (!rows.length) { el.innerHTML = '<div class="text-white/30 text-sm">Нет сущностей.</div>'; return; }
    const domainIcon = { person:"👤", finance:"💰", work:"💼", project:"🚀" };
    el.innerHTML = rows.map(r => `
      <div class="glass rounded-2xl px-4 py-3 mb-2">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-base">${domainIcon[r.domain]||"📌"}</span>
          <span class="text-sm font-medium text-white/90">${esc(r.name||"")}</span>
          <span class="text-xs text-indigo-400/50 ml-auto">${r.domain||""}</span>
        </div>
        ${r.notes ? `<div class="text-xs text-white/40 mt-1">${esc(r.notes)}</div>` : ""}
        ${r.amount ? `<div class="text-xs text-emerald-400/70 mt-1">${r.amount} ${r.currency||""} · ${r.category||""}</div>` : ""}
        ${r.status ? `<div class="text-xs text-white/30 mt-1">status: ${r.status}</div>` : ""}
      </div>`).join("");
  } catch { el.innerHTML = '<div class="text-red-400/60 text-sm">Ошибка</div>'; }
}

/* ─── Decisions ─── */
async function loadDecisions() {
  const el = document.getElementById("mem-decisions");
  el.innerHTML = '<div class="text-white/30 text-sm">Загружаю...</div>';
  try {
    const rows = await fetch("/api/sqlite/decisions?limit=20").then(r=>r.json());
    if (!rows.length) { el.innerHTML = '<div class="text-white/30 text-sm">Нет решений.</div>'; return; }
    el.innerHTML = rows.map(r => `
      <div class="glass rounded-2xl px-4 py-3 mb-2">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs mono text-white/40">${r.date||""}</span>
        </div>
        <div class="text-sm text-white/80 mb-1">${esc(r.dilemma||"")}</div>
        ${r.chosen ? `<div class="text-xs text-emerald-400/70">✅ Выбрано: ${esc(r.chosen)}</div>` : ""}
        ${r.reasoning ? `<div class="text-xs text-white/40 mt-1">${esc(r.reasoning)}</div>` : ""}
      </div>`).join("");
  } catch { el.innerHTML = '<div class="text-red-400/60 text-sm">Ошибка</div>'; }
}

/* ─── Health (Zepp) ─── */
async function loadHealth() {
  const el = document.getElementById("mem-health");
  el.innerHTML = '<div class="text-white/30 text-sm">Загружаю данные Zepp...</div>';
  try {
    const d = await fetch("/api/sqlite/health").then(r=>r.json());
    if (d.error) { el.innerHTML = `<div class="text-red-400/60 text-sm">${d.error}</div>`; return; }

    const { stats, sleepStats, activity, sleep, body } = d;

    let html = "";

    // Summary cards
    if (stats) {
      html += `<div class="grid grid-cols-2 gap-2 mb-4">
        <div class="glass rounded-2xl px-4 py-3 text-center">
          <div class="text-2xl font-bold text-emerald-400">${stats.avg_steps?.toLocaleString()||"—"}</div>
          <div class="text-xs text-white/40 mt-1">avg шагов / день</div>
        </div>
        <div class="glass rounded-2xl px-4 py-3 text-center">
          <div class="text-2xl font-bold text-indigo-400">${sleepStats?.avg_h||"—"}h</div>
          <div class="text-xs text-white/40 mt-1">avg сон / ночь</div>
        </div>
        <div class="glass rounded-2xl px-4 py-3 text-center">
          <div class="text-2xl font-bold text-purple-400">${sleepStats?.avg_deep||"—"}мин</div>
          <div class="text-xs text-white/40 mt-1">avg deep sleep</div>
        </div>
        <div class="glass rounded-2xl px-4 py-3 text-center">
          <div class="text-2xl font-bold text-sky-400">${stats.max_steps?.toLocaleString()||"—"}</div>
          <div class="text-xs text-white/40 mt-1">рекорд шагов</div>
        </div>
      </div>`;
      html += `<div class="text-xs text-white/25 mb-3 mono">📅 ${stats.from_date} → ${stats.to_date} · ${stats.days} дней</div>`;
    }

    // Activity chart (last 30 days as bars)
    if (activity?.length) {
      const maxSteps = Math.max(...activity.map(r=>r.steps||0));
      html += `<div class="mb-4">
        <div class="text-xs text-white/40 mb-2">🏃 Шаги (последние ${activity.length} дней)</div>
        <div class="flex items-end gap-0.5 h-16">
          ${activity.slice().reverse().map(r => {
            const pct = maxSteps > 0 ? Math.round((r.steps/maxSteps)*100) : 0;
            const color = r.steps >= 8000 ? "#10b981" : r.steps >= 5000 ? "#6366f1" : "#ef444466";
            return `<div title="${r.date}: ${r.steps?.toLocaleString()} шагов"
              style="flex:1;height:${Math.max(pct,3)}%;background:${color};border-radius:2px 2px 0 0;min-height:2px;cursor:default"></div>`;
          }).join("")}
        </div>
        <div class="flex justify-between text-xs text-white/20 mt-1 mono">
          <span>${activity[activity.length-1]?.date?.slice(5)||""}</span>
          <span>8k goal</span>
          <span>${activity[0]?.date?.slice(5)||""}</span>
        </div>
      </div>`;
    }

    // Sleep bars
    if (sleep?.length) {
      const maxH = Math.max(...sleep.map(r=>r.total_h||0));
      html += `<div class="mb-4">
        <div class="text-xs text-white/40 mb-2">😴 Сон (последние ${sleep.length} ночей)</div>
        <div class="flex items-end gap-0.5 h-12">
          ${sleep.slice().reverse().map(r => {
            const pct = maxH > 0 ? Math.round(((r.total_h||0)/maxH)*100) : 0;
            const color = r.total_h >= 7 ? "#6366f1" : r.total_h >= 5 ? "#f59e0b" : "#ef4444";
            return `<div title="${r.date}: ${r.total_h}h (deep ${r.deep_sleep_min}мин, REM ${r.rem_min}мин)"
              style="flex:1;height:${Math.max(pct,3)}%;background:${color};border-radius:2px 2px 0 0;min-height:2px;cursor:default"></div>`;
          }).join("")}
        </div>
      </div>`;
    }

    // Body weight
    if (body?.length) {
      html += `<div class="mb-2">
        <div class="text-xs text-white/40 mb-2">⚖️ Вес</div>
        ${body.map(r=>`
          <div class="flex justify-between text-xs py-1 border-b border-white/5">
            <span class="text-white/40 mono">${r.date}</span>
            <span class="text-white/70">${r.weight} кг</span>
            ${r.bmi ? `<span class="text-white/30">BMI ${r.bmi}</span>` : ""}
            ${r.fat_rate ? `<span class="text-white/30">fat ${r.fat_rate}%</span>` : ""}
          </div>`).join("")}
      </div>`;
    }

    el.innerHTML = html || '<div class="text-white/30 text-sm">Нет данных</div>';
  } catch(e) { el.innerHTML = `<div class="text-red-400/60 text-sm">Ошибка: ${e.message}</div>`; }
}

/* ─── Patterns ─── */
async function loadPatterns() {
  const el = document.getElementById("mem-patterns");
  el.innerHTML = '<div class="text-white/30 text-sm">Загружаю...</div>';
  try {
    const rows = await fetch("/api/sqlite/patterns").then(r=>r.json());
    if (!rows.length) { el.innerHTML = '<div class="text-white/30 text-sm">Паттерны ещё не обнаружены. Cron анализирует каждые 2 дня.</div>'; return; }
    el.innerHTML = rows.map(r => `
      <div class="glass rounded-2xl px-4 py-3 mb-2">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">${r.pattern_type||""}</span>
          <span class="text-xs text-white/30 ml-auto">conf ${Math.round((r.confidence||0)*100)}%</span>
        </div>
        <div class="text-sm text-white/80 mb-1">${esc(r.description||"")}</div>
        ${r.recommendation ? `<div class="text-xs text-emerald-400/70 mt-1">💡 ${esc(r.recommendation)}</div>` : ""}
        <div class="text-xs text-white/25 mt-1 mono">${r.ts?.slice(0,10)||""}</div>
      </div>`).join("");
  } catch { el.innerHTML = '<div class="text-red-400/60 text-sm">Ошибка</div>'; }
}

function showQdrant() {
  const allTabs = ["timeline","entities","decisions","health","patterns"];
  allTabs.forEach(n => {
    const el = document.getElementById("mem-" + n);
    const btn = document.getElementById("mt-" + n);
    if (el) el.style.display = "none";
    if (btn) btn.className = "mem-tab off";
  });
  const qel = document.getElementById("mem-qdrant");
  const qbtn = document.getElementById("mt-qdrant");
  if (qel) { qel.style.display = "block"; loadMemories(true); }
  if (qbtn) qbtn.className = "mem-tab on";
}
