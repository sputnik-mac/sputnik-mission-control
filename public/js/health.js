/* ─── Health Dashboard JS ─── */

const CHART_DEFAULTS = {
  color: "rgba(255,255,255,.7)",
  grid: "rgba(255,255,255,.06)",
  font: { family: "'Inter', system-ui, sans-serif", size: 11 },
};

Chart.defaults.color = CHART_DEFAULTS.color;
Chart.defaults.font = CHART_DEFAULTS.font;

let charts = {};
let dashData = null;

/* ── Count-up animation ── */
function countUp(el, target, suffix = "", duration = 1200) {
  const start = Date.now();
  const from = 0;
  const step = () => {
    const p = Math.min((Date.now() - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * ease).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ── Athlete level ── */
function resolveLevel(avgSteps) {
  if (avgSteps < 5000) return { name: "Beginner", tag: "🐾 Keep going!", color: "#94a3b8", xp: avgSteps / 5000 };
  if (avgSteps < 8000) return { name: "Active",   tag: "⚡ Almost there!", color: "#6366f1", xp: (avgSteps - 5000) / 3000 };
  if (avgSteps < 12000) return { name: "Athlete",  tag: "🏃 On fire!",     color: "#10b981", xp: (avgSteps - 8000) / 4000 };
  return { name: "Champion", tag: "🏆 Elite!",    color: "#f59e0b", xp: 1 };
}

/* ── Steps Timeline Chart ── */
function buildStepsChart(data) {
  const ctx = document.getElementById("chart-steps");
  if (!ctx || !data?.length) return;
  if (charts.steps) charts.steps.destroy();
  const labels = data.map(r => r.date.slice(5));
  const values = data.map(r => r.steps);
  charts.steps = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: "#6366f1",
        backgroundColor: "rgba(99,102,241,.08)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            goal: {
              type: "line", yMin: 8000, yMax: 8000,
              borderColor: "#10b981", borderWidth: 1,
              borderDash: [4, 4],
              label: { content: "8k goal", enabled: true, position: "end", color: "#10b981", font: { size: 10 } },
            }
          }
        }
      },
      scales: {
        x: { grid: { color: CHART_DEFAULTS.grid }, ticks: { maxTicksLimit: 10 } },
        y: { grid: { color: CHART_DEFAULTS.grid }, min: 0,
          ticks: { callback: v => (v / 1000).toFixed(0) + "k" },
        },
      },
    },
  });
  // Segment colors applied at creation time — no extra update() needed
}

/* ── Sleep Breakdown Chart ── */
function buildSleepChart(data) {
  const ctx = document.getElementById("chart-sleep");
  if (!ctx || !data?.length) return;
  if (charts.sleep) charts.sleep.destroy();
  const labels = data.map(r => r.week.replace("W", "W"));
  charts.sleep = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Deep", data: data.map(r => Math.round((r.deep||0)/60*10)/10), backgroundColor: "#6366f1", stack: "s" },
        { label: "REM",  data: data.map(r => Math.round((r.rem||0)/60*10)/10),  backgroundColor: "#a78bfa", stack: "s" },
        { label: "Light",data: data.map(r => Math.round((r.shallow||0)/60*10)/10), backgroundColor: "rgba(99,102,241,.25)", stack: "s" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "top", labels: { boxWidth: 10 } } },
      scales: {
        x: { grid: { color: CHART_DEFAULTS.grid }, ticks: { maxTicksLimit: 12 } },
        y: { grid: { color: CHART_DEFAULTS.grid }, stacked: true,
          ticks: { callback: v => v + "h" },
        },
      },
    },
  });
}

/* ── Weight Trend Chart ── */
function buildWeightChart(data) {
  const ctx = document.getElementById("chart-weight");
  if (!ctx || !data?.length) return;
  if (charts.weight) charts.weight.destroy();
  const filtered = data.filter(r => r.weight > 10);
  charts.weight = new Chart(ctx, {
    type: "line",
    data: {
      labels: filtered.map(r => r.date),
      datasets: [{
        label: "Weight (kg)",
        data: filtered.map(r => r.weight),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,.08)",
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: "#f59e0b",
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: CHART_DEFAULTS.grid }, ticks: { maxTicksLimit: 8 } },
        y: { grid: { color: CHART_DEFAULTS.grid },
          ticks: { callback: v => v + " kg" },
          suggestedMin: Math.min(...filtered.map(r => r.weight)) - 2,
          suggestedMax: Math.max(...filtered.map(r => r.weight)) + 2,
        },
      },
    },
  });
}

/* ── Heart Rate Distribution Chart ── */
function buildHRChart(data) {
  const ctx = document.getElementById("chart-hr");
  if (!ctx || !data) return;
  if (charts.hr) charts.hr.destroy();
  charts.hr = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["< 60", "60–80", "80–100", "> 100"],
      datasets: [{
        data: [data.under60, data.r60_80, data.r80_100, data.over100],
        backgroundColor: ["#10b981", "#6366f1", "#f59e0b", "#ef4444"],
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: CHART_DEFAULTS.grid } },
      },
    },
  });
}

/* ── Heatmap ── */
function buildHeatmap(heatmapData) {
  const el = document.getElementById("heatmap");
  if (!el) return;
  el.innerHTML = "";
  (heatmapData || []).forEach(d => {
    const met = d.met ?? (d.steps >= 8000);
    const cell = document.createElement("div");
    cell.className = "heatmap-cell";
    cell.style.background = met
      ? `rgba(16,185,129,${0.3 + Math.min((d.steps || 0) / 20000, 1) * 0.7})`
      : "rgba(255,255,255,.06)";
    cell.title = `${d.date}: ${(d.steps||0).toLocaleString()} шагов`;
    el.appendChild(cell);
  });
}

/* ── Insights ── */
function buildInsights(ins) {
  const pos = document.getElementById("insights-positive");
  const neg = document.getElementById("insights-critical");
  if (!pos || !neg || !ins) return;

  const positives = [];
  const criticals = [];

  if (ins.bestStreak > 0) positives.push(`🔥 Рекорд streak: <b>${ins.bestStreak} дней</b> подряд >8k шагов`);
  if (ins.bestSleepMonth?.month) positives.push(`😴 Лучший месяц сна: <b>${ins.bestSleepMonth.month}</b> (avg ${ins.bestSleepMonth.avg_h}h)`);
  if (ins.goalMet > 0) positives.push(`✅ Цель 8k шагов достигнута <b>${ins.goalMet} дней</b> (${Math.round(ins.goalMet/386*100)}%)`);
  if (ins.avgSteps >= 8000) positives.push(`🏆 Средний показатель <b>${ins.avgSteps?.toLocaleString()}</b> шагов — выше цели!`);

  if (ins.lowStepsPct > 20) criticals.push(`⚠️ <b>${ins.lowStepsPct}%</b> дней — меньше 5k шагов`);
  if (ins.lowSleepPct > 10) criticals.push(`😴 <b>${ins.lowSleepPct}%</b> ночей — меньше 6 часов сна`);
  if (ins.hrAnomalyPct > 5) criticals.push(`❤️ <b>${ins.hrAnomalyPct}%</b> измерений пульса > 120 bpm`);
  if (ins.avgSteps < 5000) criticals.push(`🚶 Средний показатель <b>${ins.avgSteps?.toLocaleString()}</b> шагов ниже минимума`);

  pos.innerHTML = positives.map(t => `<div class="insight-item positive">${t}</div>`).join("") || "<div class='text-white/30 text-sm'>Анализируется...</div>";
  // HTML uses insights-negative
  const negEl2 = document.getElementById("insights-negative");
  if (negEl2) negEl2.innerHTML = criticals.map(t => `<div class="insight-item critical">${t}</div>`).join("") || "<div class='text-white/30 text-sm'>Критических проблем нет 🎉</div>";
  neg.innerHTML = criticals.map(t => `<div class="insight-item critical">${t}</div>`).join("") || "<div class='text-white/30 text-sm'>Критических проблем нет 🎉</div>";
}

/* ── Main load ── */
async function loadDashboard() {
  try {
    const [dash, streaks] = await Promise.all([
      fetch("/api/health/dashboard").then(r => r.json()),
      fetch("/api/health/streaks").then(r => r.json()),
    ]);

    dashData = dash;
    const a = dash.activityStats || {};
    const s = dash.sleepStats || {};
    const h = dash.hrStats || {};

    // Athlete level
    const level = resolveLevel(a.avg_steps || 0);
    const lvlEl = document.getElementById("athlete-level");
    const tagEl = document.getElementById("level-tag");
    const xpEl = document.getElementById("xp-fill");
    const xpLabelEl = document.getElementById("xp-label");
    if (lvlEl) { lvlEl.textContent = level.name; lvlEl.style.color = level.color; }
    if (tagEl) tagEl.textContent = level.tag;
    if (xpEl) { xpEl.style.width = (level.xp * 100) + "%"; xpEl.style.background = level.color; }
    if (xpLabelEl) xpLabelEl.textContent = `${Math.round(level.xp * 100)}% to next level`;

    // Stat badges with count-up
    const avgEl = document.getElementById("s-avg-steps");
    const bestEl = document.getElementById("s-best-day");
    const sleepEl = document.getElementById("s-avg-sleep");
    const hrEl = document.getElementById("s-avg-hr");
    if (avgEl) countUp(avgEl, a.avg_steps || 0);
    if (bestEl) countUp(bestEl, a.max_steps || 0);
    if (sleepEl) { sleepEl.textContent = (s.avg_h || "--") + "h"; }
    if (hrEl) { hrEl.textContent = (h.avg_hr || "--") + " bpm"; }

    // Streaks
    const curEl = document.getElementById("streak-current");
    const bestSEl = document.getElementById("streak-best");
    if (curEl) countUp(curEl, streaks.current || 0);
    if (bestSEl) countUp(bestSEl, streaks.best || 0);

    // Charts
    buildStepsChart(dash.stepsTimeline);
    buildSleepChart(dash.sleepWeekly);
    buildWeightChart(dash.weightTrend);
    buildHRChart(dash.hrDistribution);
    buildHeatmap(streaks.heatmap);
    buildInsights({ ...dash.insights, avgSteps: a.avg_steps, bestStreak: streaks.best });

    // Show default canvas overview
    setTimeout(() => CanvasBoard.showDefault(dash), 800);

  } catch (e) {
    console.error("Dashboard load error:", e);
  }
}

/* ── Markdown renderer ── */
function renderMd(text) {
  if (!text) return "";

  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, `<code style="background:rgba(0,200,255,.1);padding:1px 5px;border-radius:3px;font-size:11px;color:rgba(0,200,255,.9);font-family:monospace">$1</code>`)
    .replace(/🏆|✅|⚠️|❌|💡|📊|🔥|💤|⚖️|🏃/g, m => `<span>${m}</span>`);

  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (!tableRows.length) return;
    // Skip separator row (--- | ---)
    const dataRows = tableRows.filter(r => !r.every(c => /^[-:]+$/.test(c.trim())));
    if (dataRows.length < 1) { tableRows = []; inTable = false; return; }
    html += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0">`;
    dataRows.forEach((cells, i) => {
      const tag = i === 0 ? "th" : "td";
      const bg = i === 0 ? "rgba(0,200,255,.08)" : i % 2 ? "rgba(255,255,255,.02)" : "transparent";
      html += `<tr style="background:${bg}">`;
      cells.forEach(c => {
        html += `<${tag} style="padding:5px 10px;border:1px solid rgba(0,200,255,.1);text-align:left;color:rgba(255,255,255,${i===0?.8:.7})">${inline(c.trim())}</${tag}>`;
      });
      html += `</tr>`;
    });
    html += `</table>`;
    tableRows = []; inTable = false;
  };

  const flushList = () => { if (inList) { html += '</ul>'; inList = false; } };

  lines.forEach(line => {
    // Table row
    if (/^\s*\|/.test(line)) {
      flushList();
      inTable = true;
      const cells = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      tableRows.push(cells);
      return;
    }
    if (inTable) flushTable();

    const listMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
    const numMatch  = line.match(/^[\s]*\d+[.)]\s+(.+)/);
    const h3Match   = line.match(/^###\s+(.+)/);
    const h2Match   = line.match(/^##\s+(.+)/);

    if (h2Match || h3Match) {
      flushList();
      const t = h2Match ? h2Match[1] : h3Match[1];
      html += `<div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:rgba(0,200,255,.7);margin:10px 0 4px;text-transform:uppercase">${inline(t)}</div>`;
    } else if (listMatch || numMatch) {
      const content = (listMatch || numMatch)[1];
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(content)}</li>`;
    } else {
      flushList();
      const trimmed = line.trim();
      if (trimmed === "") html += `<div style="height:6px"></div>`;
      else html += `<p>${inline(trimmed)}</p>`;
    }
  });

  flushList();
  if (inTable) flushTable();
  return html;
}

/* ── JARVIS turbine engine ── */
const JARVIS = (() => {
  // Target rates: idle=1.0, active=5.0
  let current = 1.0;
  let target  = 1.0;
  let hueAngle = 0;
  let hueDir   = 1;
  let rafId    = null;
  let anims    = null;

  const RINGS = [".jr1",".jr2",".jr3",".jr-accent",".jdot1",".jdot2"];
  // Base durations (ms) matching CSS idle values
  const BASE  = [7000, 11000, 5000, 15000, 7000, 11000];

  function getAnims() {
    const hq = document.getElementById("jarvis-hq");
    if (!hq) return null;
    return RINGS.map((sel, i) => {
      const el = hq.querySelector(sel);
      return el ? el.getAnimations()[0] : null;
    });
  }

  function applyRate(r) {
    if (!anims) anims = getAnims();
    anims?.forEach((a, i) => {
      if (a) {
        // Stagger: each ring gets slight variation for chaos
        const jitter = 0.92 + (i * 0.04);
        a.playbackRate = r * jitter;
      }
    });
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    const dt = 0.025; // lerp factor — smaller = slower transition
    current = lerp(current, target, target > current ? 0.08 : dt);

    // Snap when close enough
    if (Math.abs(current - target) < 0.005) current = target;

    applyRate(current);

    // Hue-rotate cycle during active state
    const hq = document.getElementById("jarvis-hq");
    if (hq?.classList.contains("active")) {
      hueAngle += hueDir * 1.2;
      if (hueAngle > 160) hueDir = -1;
      if (hueAngle < 0)   hueDir = 1;
      hq.style.setProperty("--j-hue", hueAngle + "deg");
      // Cycle glow color: cyan→purple→orange→green
      const colors = [
        `rgba(0,200,255,.6)`,
        `rgba(168,85,247,.7)`,
        `rgba(249,115,22,.65)`,
        `rgba(16,185,129,.6)`,
      ];
      const ci = Math.floor((hueAngle / 40) % colors.length);
      hq.style.setProperty("--j-glow-c", colors[ci]);
    } else {
      // Return hue to 0
      hueAngle = lerp(hueAngle, 0, 0.06);
      const hq2 = document.getElementById("jarvis-hq");
      if (hq2) {
        hq2.style.setProperty("--j-hue", hueAngle.toFixed(1) + "deg");
        hq2.style.setProperty("--j-glow-c", "rgba(0,200,255,.55)");
      }
    }

    if (Math.abs(current - target) > 0.005 || hq?.classList.contains("active")) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function start() { if (!rafId) rafId = requestAnimationFrame(tick); }

  return {
    setActive(on) {
      target = on ? 5.0 : 1.0;
      const hq = document.getElementById("jarvis-hq");
      const status = document.getElementById("doc-status");
      if (hq) hq.classList.toggle("active", on);
      if (status) {
        status.textContent = on ? "● ANALYZING..." : "● ONLINE";
        status.style.color = on ? "rgba(168,85,247,.8)" : "";
      }
      start();
    }
  };
})();

function setJarvisThinking(on) { JARVIS.setActive(on); }

/* ── Doc Chat ── */
function addChatMsg(role, text) {
  const el = document.getElementById("chat-messages");
  if (!el) return;
  const div = document.createElement("div");
  if (role === "user") {
    div.style.cssText = "align-self:flex-end;max-width:85%;background:rgba(99,102,241,.3);border:1px solid rgba(99,102,241,.25);border-radius:14px 14px 3px 14px;padding:10px 14px;font-size:13px;color:rgba(255,255,255,.9)";
    div.textContent = text;
  } else {
    div.style.cssText = "align-self:flex-start;max-width:92%;background:rgba(0,200,255,.04);border:1px solid rgba(0,200,255,.12);border-radius:3px 14px 14px 14px;padding:10px 14px";
    div.className = "doc-msg";
    div.innerHTML = `<div style="font-size:10px;font-weight:700;letter-spacing:.1em;color:rgba(0,200,255,.6);margin-bottom:6px;font-family:'JetBrains Mono',monospace">DOC.AI</div>${renderMd(text)}`;
  }
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

async function pollJob(jobId, typingEl) {
  const MAX_TOTAL   = 120_000; // 2 min total budget
  const MAX_RETRIES = 6;       // network error retries per attempt
  let pollCount     = 0;
  let netErrors     = 0;
  const start       = Date.now();

  const updateTyping = msg => {
    if (typingEl) typingEl.querySelector?.("span")
      ? (typingEl.querySelector("span").textContent = msg)
      : (typingEl.textContent = msg);
  };

  const done = (text) => {
    typingEl?.remove();
    window._docProcessing = false;
    setJarvisThinking(false);
    if (text) addChatMsg("doc", text);
  };

  const poll = async () => {
    if (Date.now() - start > MAX_TOTAL) return done("⏱️ Timeout — Doc не ответил за 2 минуты.");

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000); // 8s per request
      const d = await fetch(`/api/health/chat/${jobId}`, { signal: ctrl.signal }).then(r => r.json());
      clearTimeout(tid);
      netErrors = 0; // reset on success

      console.log(`[DOC.AI] poll #${++pollCount} → status: ${d.status}`);

      if (d.status === "done") {
        const raw = d.text || "Готово.";
        const clean = raw.replace(/<CANVAS[\s\S]*?<\/CANVAS>/gi, "").trim();
        CanvasBoard.update(raw, "");
        return done(clean);
      }
      if (d.status === "error") return done(`⚠️ ${d.error || "Неизвестная ошибка"}`);

      // Still pending — continue
      updateTyping("🩺 DOC.AI анализирует" + ".".repeat((pollCount % 3) + 1));
      setTimeout(poll, 2000);

    } catch (e) {
      netErrors++;
      const isAborted = e.name === "AbortError";
      const delay = Math.min(1000 * Math.pow(2, netErrors), 12000); // 2s→4s→8s→12s
      console.warn(`[DOC.AI] Network ${isAborted ? "timeout" : "error"} #${netErrors} — retry in ${delay}ms`, e.message);

      if (netErrors <= MAX_RETRIES) {
        updateTyping(`⚡ Reconnecting (${netErrors}/${MAX_RETRIES})...`);
        setTimeout(poll, delay);
      } else {
        done("❌ Соединение потеряно. Попробуй ещё раз.");
      }
    }
  };

  setTimeout(poll, 1200);
}

async function sendDocMessage(msg) {
  if (!msg?.trim()) return;
  const input = document.getElementById("chat-input");
  if (input) input.value = "";

  addChatMsg("user", msg);
  window._docProcessing = true;
  setJarvisThinking(true);
  CanvasBoard.startScan(msg.slice(0, 18));

  // Typing indicator
  const typingEl = document.createElement("div");
  typingEl.className = "self-start flex items-center gap-2 px-4 py-2 text-sm text-white/30";
  typingEl.innerHTML = `<span class="animate-pulse">🩺 Doc анализирует</span><span class="flex gap-1">${[0,200,400].map(d=>`<span class="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:${d}ms"></span>`).join("")}</span>`;
  document.getElementById("chat-messages")?.appendChild(typingEl);
  document.getElementById("chat-messages").scrollTop = 9999;

  try {
    const r = await fetch("/api/health/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const d = await r.json();
    if (d.jobId) {
      pollJob(d.jobId, typingEl);
    } else {
      typingEl?.remove();
      setJarvisThinking(false);
      addChatMsg("doc", d.text || d.reply || "Получил.");
    }
  } catch {
    typingEl?.remove();
    setJarvisThinking(false);
    addChatMsg("doc", "❌ Нет связи с Doc агентом.");
  }
}

// Global aliases
window.quickQ = (q) => sendDocMessage(q);
window.sendChat = () => sendDocMessage(document.getElementById("chat-input")?.value);

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  // Greeting
  setTimeout(() => addChatMsg("doc", "Привет! Я DOC.AI — твой голографический врач.\n\nСпроси меня про:\n- Качество сна и рекомендации\n- Анализ активности и шагов\n- Динамику веса и BMI\n- Пульс и сердечно-сосудистое здоровье"), 700);

  // Typing trigger → Jarvis active
  let typingTimer;
  const input = document.getElementById("chat-input");
  if (input) {
    input.addEventListener("input", () => {
      if (input.value.trim()) setJarvisThinking(true);
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (!window._docProcessing) setJarvisThinking(false);
      }, 1500);
    });
    input.addEventListener("blur", () => {
      if (!window._docProcessing) setTimeout(() => setJarvisThinking(false), 500);
    });
  }
});

// Global aliases for HTML onclick handlers
window.quickQ = (q) => sendDocMessage(q);
window.sendChat = () => sendDocMessage(document.getElementById("chat-input")?.value);

/* ── Resize handle ── */
(function initResize() {
  const handle = document.getElementById("resize-handle");
  const sidebar = document.getElementById("chat-sidebar");
  if (!handle || !sidebar) return;

  let startX, startW;

  handle.addEventListener("mousedown", e => {
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add("dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    const onMove = e => {
      const delta = startX - e.clientX; // drag left = wider
      const newW = Math.min(600, Math.max(260, startW + delta));
      sidebar.style.width = newW + "px";
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();

/* ══ CANVAS BOARD ENGINE ══ */
mermaid.initialize({ startOnLoad: false, theme: "dark", themeVariables: {
  primaryColor: "rgba(0,200,255,.15)", primaryTextColor: "rgba(0,200,255,.9)",
  primaryBorderColor: "rgba(0,200,255,.4)", lineColor: "rgba(0,200,255,.5)",
  secondaryColor: "rgba(99,102,241,.1)", background: "transparent",
  nodeBorder: "rgba(0,200,255,.4)", clusterBkg: "rgba(0,200,255,.04)",
  edgeLabelBackground: "rgba(3,4,10,.8)", fontSize: "12px",
}});

const CanvasBoard = (() => {
  let scanning = false;

  function setScan(on) {
    const overlay = document.getElementById("scan-overlay");
    if (overlay) overlay.style.opacity = on ? "1" : "0.3";
    scanning = on;
  }

  function setTopic(text) {
    const el = document.getElementById("canvas-topic");
    if (el) el.textContent = text.toUpperCase().slice(0, 20);
  }

  async function renderPayload(payload) {
    const body = document.getElementById("vis-content");
    if (!body) return;

    // Fade out
    body.classList.remove("visible");
    await new Promise(r => setTimeout(r, 300));

    try {
      if (payload.type === "mermaid") {
        const id = "mermaid-" + Date.now();
        body.innerHTML = `<div class="vis-card"><h4>📊 ${payload.title || "Diagram"}</h4><div class="mermaid" id="${id}">${payload.code}</div></div>`;
        await mermaid.run({ nodes: [document.getElementById(id)] });
      } else if (payload.type === "infographic") {
        body.innerHTML = payload.html;
      } else if (payload.type === "stats") {
        const max = Math.max(...payload.items.map(i => i.value));
        const rows = payload.items.map(item => {
          const pct = max > 0 ? (item.value / max * 100).toFixed(0) : 0;
          const color = item.color || "rgba(0,200,255,.7)";
          return `<div class="vis-stat">
            <span style="color:rgba(255,255,255,.6);font-size:12px">${item.label}</span>
            <div class="vis-bar-wrap"><div class="vis-bar" style="width:${pct}%;background:${color}"></div></div>
            <span class="vis-stat-val">${item.display}</span>
          </div>`;
        }).join("");
        body.innerHTML = `<div class="vis-card"><h4>📈 ${payload.title}</h4>${rows}</div>`;
      } else if (payload.type === "actions") {
        const cards = payload.items.map(a =>
          `<div class="action-card"><strong>${a.title}</strong>${a.body}</div>`
        ).join("");
        body.innerHTML = `<div class="vis-card"><h4>⚡ ${payload.title}</h4>${cards}</div>`;
      } else {
        body.innerHTML = `<div class="vis-card"><h4>💡 INSIGHT</h4><div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.6">${payload.html || payload.text || ""}</div></div>`;
      }
    } catch (e) {
      console.warn("[Canvas] render error:", e);
    }

    body.classList.add("visible");
    setScan(false);
  }

  function parseFromDocText(text) {
    // Extract <CANVAS ...>...</CANVAS> block
    const match = text.match(/<CANVAS([^>]*)>([\s\S]*?)<\/CANVAS>/i);
    if (!match) return null;
    const attrs = match[1];
    const content = match[2].trim();
    const typeMatch = attrs.match(/type="([^"]+)"/i);
    const titleMatch = attrs.match(/title="([^"]+)"/i);
    const type = typeMatch?.[1] || "html";
    const title = titleMatch?.[1] || "Visualization";

    if (type === "mermaid") return { type: "mermaid", title, code: content };
    if (type === "stats") {
      try { return { type: "stats", title, ...JSON.parse(content) }; } catch { return null; }
    }
    if (type === "actions") {
      try { return { type: "actions", title, ...JSON.parse(content) }; } catch { return null; }
    }
    return { type: "infographic", html: content };
  }

  return {
    startScan(topic) { setScan(true); setTopic(topic); },
    async update(text, topic) {
      const payload = parseFromDocText(text);
      setTopic(topic || "Analysis");
      if (payload) await renderPayload(payload);
      else setScan(false);
    },
    async showDefault(dashData) {
      // Auto-generate stats canvas from dashboard data
      const a = dashData?.activityStats || {};
      const s = dashData?.sleepStats || {};
      const h = dashData?.hrStats || {};
      const payload = {
        type: "stats",
        title: "Health Overview",
        items: [
          { label: "Avg Steps", value: a.avg_steps||0, display: (a.avg_steps||0).toLocaleString(), color: "rgba(99,102,241,.8)" },
          { label: "Best Day",  value: a.max_steps||0, display: (a.max_steps||0).toLocaleString(), color: "rgba(16,185,129,.8)" },
          { label: "Avg Sleep", value: (s.avg_h||0)*1000, display: (s.avg_h||0)+"h", color: "rgba(167,139,250,.8)" },
          { label: "Deep Sleep",value: s.avg_deep||0, display: (s.avg_deep||0)+"min", color: "rgba(139,92,246,.8)" },
          { label: "REM Sleep", value: s.avg_rem||0,  display: (s.avg_rem||0)+"min", color: "rgba(109,40,217,.7)" },
          { label: "Avg HR",    value: h.avg_hr||0, display: (h.avg_hr||0)+" bpm", color: "rgba(248,113,113,.8)" },
          { label: "Max HR",    value: h.max_hr||0, display: (h.max_hr||0)+" bpm", color: "rgba(239,68,68,.7)" },
        ]
      };
      await renderPayload(payload);
      setTopic("HEALTH OVERVIEW");
    }
  };
})();

// Export for use in pollJob / sendDocMessage
window.CanvasBoard = CanvasBoard;
