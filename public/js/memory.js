let memOffset = 0;
let memQuery = "";
let memSearchTimer = null;

function switchMemTab(t) {
  ["qdrant","timeline","entities","decisions"].forEach(n => {
    const el = document.getElementById("mem-" + n);
    const btn = document.getElementById("mt-" + n);
    if (el) el.style.display = n === t ? "block" : "none";
    if (btn) btn.className = "mem-tab " + (n === t ? "on" : "off");
  });
  if (t === "timeline") loadSqliteTab("timeline");
  if (t === "entities") loadSqliteTab("entities");
  if (t === "decisions") loadSqliteTab("decisions");
}

function debouncedSearch() {
  clearTimeout(memSearchTimer);
  memSearchTimer = setTimeout(() => {
    memOffset = 0;
    memQuery = document.getElementById("mem-search").value;
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
      el.innerHTML = '<div class="text-white/30 text-sm">Нет записей</div>';
      return;
    }
    points.forEach(p => {
      const d = document.createElement("div");
      d.className = "glass rounded-2xl px-4 py-3";
      d.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-sm text-white/80 leading-relaxed">${esc(p.text || "—")}</div>
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

async function deleteMemory(id) {
  if (!confirm("Удалить эту память?")) return;
  try {
    await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
    loadMemories(true);
  } catch { alert("Ошибка удаления"); }
}

async function loadSqliteTab(table) {
  const el = document.getElementById("mem-" + table);
  el.innerHTML = '<div class="text-white/30 text-sm">Загружаю...</div>';
  try {
    const r = await fetch(`/api/sqlite/${table}?limit=30`);
    const rows = await r.json();
    if (!rows.length) { el.innerHTML = '<div class="text-white/30 text-sm">Нет данных</div>'; return; }
    el.innerHTML = rows.map(row => `
      <div class="glass rounded-2xl px-4 py-3">
        <div class="text-sm text-white/80 whitespace-pre-wrap mono text-xs">${esc(JSON.stringify(row, null, 2))}</div>
      </div>`).join("");
  } catch { el.innerHTML = '<div class="text-red-400/60 text-sm">Ошибка</div>'; }
}
