async function loadStats() {
  try {
    const r = await fetch("/api/stats/system");
    const s = await r.json();
    document.getElementById("stat-uptime").textContent = s.uptimeHuman || "—";
    document.getElementById("stat-qdrant").textContent = s.qdrantMb + " MB";
    document.getElementById("stat-sessions").textContent = s.sessionCount;
  } catch {}

  try {
    const r = await fetch("/api/stats/usage?days=7");
    const { byDay, total } = await r.json();
    document.getElementById("total-input").textContent = formatTokens(total.inputTokens);
    document.getElementById("total-output").textContent = formatTokens(total.outputTokens);
    document.getElementById("total-cost").textContent = "$" + total.costUsd.toFixed(4);
    const maxTokens = Math.max(...byDay.map(d => d.inputTokens + d.outputTokens), 1);
    const chartEl = document.getElementById("usage-chart");
    if (byDay.length === 0) {
      chartEl.innerHTML = '<div class="text-white/30 text-sm">Нет данных об использовании</div>';
    } else {
      chartEl.innerHTML = byDay.map(d => {
        const tot = d.inputTokens + d.outputTokens;
        const pct = Math.round((tot / maxTokens) * 100);
        const date = d.date.slice(5);
        return `<div class="flex items-center gap-3">
          <span class="text-xs text-white/30 mono w-10 flex-shrink-0">${date}</span>
          <div class="flex-1 bg-white/5 rounded-full h-2">
            <div class="bg-indigo-500 h-2 rounded-full transition-all" style="width:${pct}%"></div>
          </div>
          <span class="text-xs text-white/40 w-16 text-right">${formatTokens(tot)}</span>
        </div>`;
      }).join("");
    }
  } catch {}

  try {
    const r = await fetch("/api/memories/stats");
    const { total, byDay } = await r.json();
    const el = document.getElementById("mem-growth");
    if (!byDay || !byDay.length) {
      el.innerHTML = `<div class="text-sm text-white/60">Всего воспоминаний: <span class="text-white font-bold">${total}</span></div>`;
      return;
    }
    const maxCount = Math.max(...byDay.map(d => d.count), 1);
    el.innerHTML = `<div class="text-sm text-white/60 mb-3">Всего: <span class="text-white font-bold">${total}</span></div>` +
      byDay.map(d => {
        const pct = Math.round((d.count / maxCount) * 100);
        return `<div class="flex items-center gap-3">
          <span class="text-xs text-white/30 mono w-10 flex-shrink-0">${d.date.slice(5)}</span>
          <div class="flex-1 bg-white/5 rounded-full h-2">
            <div class="bg-emerald-500 h-2 rounded-full" style="width:${pct}%"></div>
          </div>
          <span class="text-xs text-white/40 w-8 text-right">${d.count}</span>
        </div>`;
      }).join("");
  } catch {}
}

function formatTokens(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n/1000000).toFixed(1) + "M";
  if (n >= 1000) return (n/1000).toFixed(1) + "K";
  return String(n);
}
