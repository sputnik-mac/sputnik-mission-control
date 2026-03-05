async function loadChatHistory(agentId) {
  agentId = agentId || "main";
  const msgs = document.getElementById("messages");
  const lb = agentLabel(agentId);
  try {
    const r = await fetch(`/api/chat/history?agentId=${encodeURIComponent(agentId)}&limit=30`);
    const history = await r.json();
    msgs.innerHTML = "";
    if (!Array.isArray(history) || history.length === 0) {
      msgs.innerHTML = `
        <div class="flex gap-3">
          <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center text-sm mt-0.5">${lb.icon}</div>
          <div class="msg-bot rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl">
            <div class="text-xs font-medium text-indigo-400 mb-1">${lb.name}</div>
            <div class="text-sm text-white/80 leading-relaxed">Привет! Выбери агента слева и пиши сообщение.</div>
          </div>
        </div>`;
      return;
    }
    for (const msg of history) {
      if (msg.role === "user") addUser(msg.content);
      else if (msg.role === "assistant") addBotMsg(msg.content, agentId);
    }
    const sep = document.createElement("div");
    sep.className = "history-sep";
    sep.textContent = "── история загружена ──";
    msgs.appendChild(sep);
    scroll();
  } catch (e) {
    console.warn("[history] failed:", e.message);
    msgs.innerHTML = `
      <div class="flex gap-3">
        <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center text-sm mt-0.5">${lb.icon}</div>
        <div class="msg-bot rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl">
          <div class="text-xs font-medium text-indigo-400 mb-1">${lb.name}</div>
          <div class="text-sm text-white/80 leading-relaxed">Привет! Пиши сообщение.</div>
        </div>
      </div>`;
  }
}

function clearChatAndLoadHistory(agentId) {
  msgQueue.length = 0;
  isProcessing = false;
  updateQueueBadge();
  const msgs = document.getElementById("messages");
  const lb = agentLabel(agentId);
  msgs.innerHTML = `
    <div class="flex gap-3">
      <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center text-sm mt-0.5">${lb.icon}</div>
      <div class="msg-bot rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl">
        <div class="text-xs font-medium text-indigo-400 mb-1">${lb.name}</div>
        <div class="text-sm text-white/80 leading-relaxed">Загружаю историю...</div>
      </div>
    </div>`;
  loadChatHistory(agentId);
}
