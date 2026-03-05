function esc(t) { return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function scroll() { const m = document.getElementById("messages"); m.scrollTop = m.scrollHeight; }

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "fixed bottom-6 left-1/2 -translate-x-1/2 glass px-4 py-2 rounded-xl text-sm text-white z-50";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function renderMarkdown(text) {
  return marked.parse(text || "");
}

function addCopyButtons(container) {
  container.querySelectorAll("pre code").forEach(block => {
    const pre = block.parentElement;
    if (pre.querySelector(".copy-btn")) return;
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "copy";
    btn.onclick = () => {
      navigator.clipboard.writeText(block.textContent);
      btn.textContent = "✓";
      setTimeout(() => btn.textContent = "copy", 2000);
    };
    pre.style.position = "relative";
    pre.appendChild(btn);
  });
}
