function switchTab(t) {
  const tabs = ["chat", "memory", "jobs", "stats", "sessions", "settings"];
  tabs.forEach(n => {
    const view = document.getElementById("view-" + n);
    const btn = document.getElementById("tab-" + n);
    if (!view || !btn) return;
    if (n === "chat") {
      view.className = (t === "chat" ? "flex" : "hidden") + " flex-1 overflow-hidden mt-3";
    } else {
      view.style.display = t === n ? "block" : "none";
    }
    btn.className = "tab-btn " + (t === n ? "on" : "off");
  });
  if (t === "settings") loadCron();
  if (t === "sessions") loadSessions();
  if (t === "memory") loadTimeline();
  if (t === "jobs") loadJobs();
  if (t === "stats") loadStats();
}

async function loadStatus() {
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    setDot("d-gw", s.gateway);
    setDot("d-ol", s.ollama);
    document.getElementById("s-model").textContent = s.model;
    document.getElementById("model-label").textContent = s.model.split("/").pop();
  } catch {}
  try {
    const r = await fetch("/api/memories");
    const m = await r.json();
    if (m.count > 0) {
      document.getElementById("mem-count").textContent = m.count + " memories";
      document.getElementById("s-mem").textContent = m.count + " points · sputnik-memory";
    }
  } catch {}
}

function setDot(id, ok) {
  document.getElementById(id).className = "dot " + (ok ? "dot-on" : "dot-off");
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey) {
    if (e.key === "Enter") { e.preventDefault(); sendMsg(); }
    if (e.key === "1") { e.preventDefault(); switchTab("chat"); }
    if (e.key === "2") { e.preventDefault(); switchTab("memory"); }
    if (e.key === "3") { e.preventDefault(); switchTab("jobs"); }
    if (e.key === "4") { e.preventDefault(); switchTab("stats"); }
    if (e.key === "5") { e.preventDefault(); switchTab("sessions"); }
    if (e.key === "6") { e.preventDefault(); switchTab("settings"); }
    if (e.key === "k") { e.preventDefault(); switchTab("memory"); document.getElementById("mem-search")?.focus(); }
  }
});

// Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Init
marked.setOptions({ breaks: true, gfm: true });
loadStatus();
loadAgents();
loadChatHistory("main");
buildWorkspaceFiles();
setInterval(loadStatus, 30000);
