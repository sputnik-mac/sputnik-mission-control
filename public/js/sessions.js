async function loadSessions() {
  try {
    const r = await fetch("/api/sessions");
    const sessions = await r.json();
    document.getElementById("sessions-count").textContent = sessions.length + " sessions";
    const el = document.getElementById("sessions-list");
    if (!sessions.length) { el.innerHTML = '<div class="text-white/30 text-sm">Нет сессий</div>'; return; }
    el.innerHTML = sessions.map(s => {
      const date = s.updatedAt ? new Date(s.updatedAt).toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
      const badge = s.isMain ? '<span class="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/30">Telegram + Mission Control</span>' :
                    s.isTelegram ? '<span class="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">Telegram</span>' :
                    s.origin === "heartbeat" ? '<span class="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">Heartbeat</span>' :
                    s.origin === "cron" ? '<span class="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30">Cron</span>' :
                    '<span class="text-xs bg-white/10 text-white/40 px-2 py-0.5 rounded-full">' + s.origin + '</span>';
      const safeId = encodeURIComponent(s.key).replace(/%/g, '_');
      return `
      <div class="glass rounded-2xl px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              ${badge}
              <span class="mono text-xs text-white/25">${s.sizeKb}kb</span>
            </div>
            <div class="mono text-xs text-white/30 mt-1.5 truncate">${s.key}</div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="text-xs text-white/30">${date}</div>
            <button onclick="toggleSessionHistory('${encodeURIComponent(s.key)}')"
              class="text-xs text-white/25 hover:text-indigo-400 transition" title="История">📋</button>
            <button onclick="deleteSession('${encodeURIComponent(s.key)}', '${s.isMain}')"
              class="text-white/20 hover:text-red-400 transition text-sm flex-shrink-0 ${s.isMain ? 'opacity-30 cursor-not-allowed' : ''}"
              ${s.isMain ? 'disabled title="Основная сессия"' : 'title="Удалить сессию"'}>🗑</button>
          </div>
        </div>
        <div id="sh-${safeId}" class="hidden mt-2 space-y-2 pl-2"></div>
      </div>`;
    }).join("");
  } catch {
    document.getElementById("sessions-list").innerHTML = '<div class="text-red-400/60 text-sm">Ошибка загрузки</div>';
  }
}

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

async function deleteSession(encodedKey, isMain) {
  if (isMain === 'true') return;
  if (!confirm("Удалить сессию? История будет потеряна.")) return;
  try {
    const r = await fetch(`/api/sessions/${encodedKey}`, { method: "DELETE" });
    const d = await r.json();
    if (d.error) return alert(d.error);
    loadSessions();
  } catch { alert("Ошибка удаления"); }
}
