// Load agent info for Settings tab
async function loadAgentInfo(agentId) {
  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/info`);
    const d = await r.json();
    const idEl = document.getElementById("si-id");
    const modEl = document.getElementById("si-model");
    const wsEl  = document.getElementById("si-ws");
    if (idEl)  idEl.textContent  = d.id   || agentId;
    if (modEl) modEl.textContent = d.model || "—";
    if (wsEl)  wsEl.textContent  = (d.workspace || "—").replace(/^\/Users\/[^/]+/, "~");
  } catch {}
}

// Re-load settings when agent changes
window.addEventListener("agentChanged", e => {
  loadAgentInfo(e.detail.id);
});

function buildWorkspaceFiles() {
  const el = document.getElementById("workspace-files");
  if (!el) return;
  el.innerHTML = WS_FILES.map(f => `
    <div class="ws-file-card">
      <div class="ws-file-header" onclick="toggleWsFile('${f.name}')">
        <div class="flex items-center gap-2">
          <span>${f.emoji}</span>
          <span class="text-sm font-medium text-white/80">${f.name}</span>
          <span class="text-xs text-white/25">${f.desc}</span>
        </div>
        <span class="text-white/30 text-xs" id="ws-arrow-${f.name}">▶</span>
      </div>
      <div class="ws-file-body" id="ws-body-${f.name}">
        <textarea class="ws-textarea" id="ws-content-${f.name}" placeholder="Загружаю..."></textarea>
        <div class="flex items-center gap-3 mt-2">
          <button class="ws-save-btn" onclick="saveWsFile('${f.name}')">💾 Сохранить</button>
          <span class="text-xs text-white/0 transition-all" id="ws-saved-${f.name}">✓ Сохранено</span>
        </div>
      </div>
    </div>`).join("");
}

async function toggleWsFile(name) {
  const body = document.getElementById(`ws-body-${name}`);
  const arrow = document.getElementById(`ws-arrow-${name}`);
  const isOpen = body.classList.contains("open");
  if (isOpen) {
    body.classList.remove("open");
    arrow.textContent = "▶";
  } else {
    body.classList.add("open");
    arrow.textContent = "▼";
    const ta = document.getElementById(`ws-content-${name}`);
    if (ta.value === "" || ta.dataset.loaded !== "1") {
      ta.value = "Загружаю...";
      try {
        const r = await fetch(`/api/workspace/${encodeURIComponent(name)}`);
        const d = await r.json();
        ta.value = d.content || "";
        ta.dataset.loaded = "1";
      } catch { ta.value = "Ошибка загрузки"; }
    }
  }
}

async function saveWsFile(name) {
  const ta = document.getElementById(`ws-content-${name}`);
  const savedEl = document.getElementById(`ws-saved-${name}`);
  try {
    const r = await fetch(`/api/workspace/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: ta.value }),
    });
    const d = await r.json();
    if (d.ok) {
      savedEl.style.color = "rgba(52,211,153,.8)";
      setTimeout(() => savedEl.style.color = "rgba(255,255,255,0)", 2500);
      showToast("✅ " + name + " сохранён");
    } else {
      showToast("❌ " + (d.error || "Ошибка"));
    }
  } catch (e) {
    showToast("❌ " + e.message);
  }
}

async function loadCron() {
  try {
    const r = await fetch("/api/cron");
    const jobs = await r.json();
    const el = document.getElementById("cron-list");
    if (!Array.isArray(jobs) || !jobs.length) {
      el.innerHTML = '<span class="text-white/30 text-sm">Нет задач</span>';
      return;
    }
    el.innerHTML = '<div class="space-y-2">' + jobs.slice(0, 10).map(j => `
      <div class="flex justify-between items-center py-1">
        <span class="text-sm text-white/70">${j.name || j.id || "—"}</span>
        <span class="mono text-xs text-white/25">${j.schedule || j.cron || ""}</span>
      </div>`).join("") + "</div>";
  } catch {
    document.getElementById("cron-list").innerHTML = '<span class="text-white/30 text-sm">Недоступно</span>';
  }
}
