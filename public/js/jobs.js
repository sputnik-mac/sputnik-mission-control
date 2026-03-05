async function loadJobs() {
  try {
    const r = await fetch("/api/cron");
    const jobs = await r.json();
    const el = document.getElementById("jobs-list");
    if (!Array.isArray(jobs) || !jobs.length) {
      el.innerHTML = '<div class="text-white/30 text-sm">Нет задач</div>';
      return;
    }
    el.innerHTML = jobs.map(j => {
      const statusColor = j.lastRunStatus === "success" ? "text-green-400" :
                          j.lastRunStatus === "error" ? "text-red-400" :
                          j.lastRunStatus === "running" ? "text-yellow-400 animate-pulse" : "text-white/30";
      const lastRun = j.lastRunAt ? new Date(j.lastRunAt).toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "никогда";
      const nextRun = j.nextRunAt ? new Date(j.nextRunAt).toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
      const name = j.name || j.id || "Unknown";
      const schedule = j.schedule || "";
      const tz = j.tz ? ` (${j.tz})` : "";
      const enabledDot = j.enabled ? '<span class="dot dot-on"></span>' : '<span class="dot dot-off"></span>';
      return `
      <div class="glass rounded-2xl px-4 py-4">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              ${enabledDot}
              <div class="text-sm font-semibold text-white">${esc(name)}</div>
            </div>
            <div class="mono text-xs text-white/30 mt-0.5">${esc(schedule)}${tz}</div>
            ${j.description ? `<div class="text-xs text-white/40 mt-1">${esc(j.description)}</div>` : ""}
          </div>
          <button onclick="runJob('${esc(j.id || j.name || "")}')"
            class="text-xs bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/30 transition flex-shrink-0">
            ▶ Run
          </button>
        </div>
        <div class="flex items-center gap-4 text-xs text-white/40">
          <span>Последний: <span class="${statusColor}">${lastRun}</span></span>
          <span>Следующий: ${nextRun}</span>
        </div>
      </div>`;
    }).join("");
  } catch {
    document.getElementById("jobs-list").innerHTML = '<div class="text-red-400/60 text-sm">Ошибка загрузки</div>';
  }
}

async function runJob(id) {
  if (!confirm(`Запустить задачу ${id}?`)) return;
  try {
    const r = await fetch(`/api/cron/${encodeURIComponent(id)}/run`, { method: "POST" });
    const d = await r.json();
    if (d.ok) { alert("✅ Задача запущена"); loadJobs(); }
    else alert("❌ " + (d.error || "Ошибка"));
  } catch { alert("Ошибка"); }
}
