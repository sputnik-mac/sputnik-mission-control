const msgQueue = [];
let isProcessing = false;

async function sendMsg() {
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text) return;
  addUser(text);
  input.value = ""; input.style.height = "24px";
  msgQueue.push({ text, agentId: activeAgent });
  updateQueueBadge();
  if (!isProcessing) processQueue();
}

function updateQueueBadge() {
  const btn = document.getElementById("send-btn");
  const total = msgQueue.length + (isProcessing ? 1 : 0);
  if (total > 0) {
    btn.innerHTML = `<span class="text-xs font-bold text-white">${total}</span>`;
  } else {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/></svg>';
  }
}

async function processQueue() {
  if (msgQueue.length === 0) {
    isProcessing = false;
    updateQueueBadge();
    setAgentWorking(activeAgent, false);
    return;
  }
  isProcessing = true;
  const job = msgQueue.shift();
  updateQueueBadge();

  const placeholderId = addBotPlaceholder(job.agentId, "печатает…");
  setAgentWorking(job.agentId, true);

  try {
    const enqRes = await fetchWithRetry("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: job.text, agentId: job.agentId }),
    });
    const { jobId } = await enqRes.json();

    let result = null;
    for (let i = 0; i < 120; i++) {
      await sleep(1500);
      try {
        const pollRes = await fetchWithRetry(`/api/chat/${jobId}`);
        const data = await pollRes.json();
        if (data.status === "done") { result = data.text; break; }
        if (data.status === "error") { result = "⚠️ " + data.error; break; }
      } catch {}
    }
    updateBotMsg(placeholderId, result ?? "⚠️ Timeout");
  } catch (e) {
    updateBotMsg(placeholderId, "⚠️ " + e.message);
  }

  setAgentWorking(job.agentId, false);
  isProcessing = false;
  processQueue();
}

async function fetchWithRetry(url, opts = {}, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
}

function addUser(text) {
  const msgs = document.getElementById("messages");
  const d = document.createElement("div");
  d.className = "flex gap-3 justify-end";
  d.innerHTML = `<div class="msg-user rounded-2xl rounded-tr-sm px-4 py-3 max-w-2xl"><div class="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">${esc(text)}</div></div><div class="w-8 h-8 rounded-full bg-indigo-600/25 flex-shrink-0 flex items-center justify-center text-sm mt-0.5">👤</div>`;
  msgs.appendChild(d);
  scroll();
}

function addBotPlaceholder(agentId, statusText) {
  agentId = agentId || activeAgent;
  statusText = statusText || "печатает…";
  const id = "bot-" + Date.now();
  const msgs = document.getElementById("messages");
  const d = document.createElement("div");
  d.className = "flex gap-3";
  d.id = id;
  const lb = agentLabel(agentId);
  d.innerHTML = `<div class="w-8 h-8 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center text-sm mt-0.5">${lb.icon}</div><div class="msg-bot rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl"><div class="text-xs font-medium text-indigo-400 mb-1">${lb.name}</div><div class="bot-text text-sm text-white/50 italic leading-relaxed">${statusText}</div></div>`;
  msgs.appendChild(d);
  scroll();
  return id;
}

function addBotMsg(text, agentId) {
  agentId = agentId || activeAgent;
  const id = "bot-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const msgs = document.getElementById("messages");
  const d = document.createElement("div");
  d.className = "flex gap-3";
  d.id = id;
  const lb = agentLabel(agentId);
  d.innerHTML = `<div class="w-8 h-8 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center text-sm mt-0.5">${lb.icon}</div><div class="msg-bot rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl"><div class="text-xs font-medium text-indigo-400 mb-1">${lb.name}</div><div class="bot-content"></div></div>`;
  d.querySelector(".bot-content").innerHTML = renderMarkdown(text);
  msgs.appendChild(d);
  addCopyButtons(d);
  if (window.hljs) hljs.highlightAll();
  scroll();
  return id;
}

function updateBotMsg(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const contentEl = el.querySelector(".bot-text");
  contentEl.className = "bot-content";
  contentEl.innerHTML = renderMarkdown(text);
  addCopyButtons(el);
  if (window.hljs) hljs.highlightAll();
  scroll();
}
