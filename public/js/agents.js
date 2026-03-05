let activeAgent = "main";

function agentLabel(id) {
  if (AGENT_LABELS[id]) return AGENT_LABELS[id];
  const name = id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { name, icon: "🤖", desc: "agent" };
}

async function loadAgents() {
  try {
    const r = await fetch("/api/agents");
    const agents = await r.json();

    // Populate AGENT_LABELS dynamically from gateway data
    for (const a of agents) {
      AGENT_LABELS[a.id] = {
        name: a.name || a.id,
        icon: a.emoji || "🤖",
        desc: a.model ? `model: ${a.model.split("/").pop()}` : "agent",
      };
    }

    const el = document.getElementById("agent-sidebar");
    const all = agents.length ? agents : [{ id: "main" }];
    if (!all.find(a => a.id === "main")) all.unshift({ id: "main" });
    el.innerHTML = all.map(a => {
      const lb = agentLabel(a.id);
      return `
      <div class="agent-item ${a.id === activeAgent ? "active" : ""}" id="ag-${a.id}" onclick="selectAgent('${a.id}')">
        <div class="flex items-center gap-3">
          <div class="agent-icon bg-indigo-500/15">${lb.icon}</div>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-white truncate">${lb.name}</div>
            <div class="text-xs text-white/35 truncate mt-0.5">${lb.desc}</div>
          </div>
        </div>
      </div>`;
    }).join("");
    buildAgentChips(all);
  } catch {
    document.getElementById("agent-sidebar").innerHTML = `
      <div class="agent-item active" id="ag-main" onclick="selectAgent('main')">
        <div class="flex items-center gap-3">
          <div class="agent-icon bg-indigo-500/15">🛰️</div>
          <div><div class="text-sm font-semibold text-white">Sputnik</div><div class="text-xs text-white/35 mt-0.5">Main assistant</div></div>
        </div>
      </div>`;
  }
}

function selectAgent(id) {
  activeAgent = id;
  document.querySelectorAll(".agent-item").forEach(el => el.classList.remove("active"));
  const el = document.getElementById("ag-" + id);
  if (el) el.classList.add("active");
  const lb = agentLabel(id);
  document.getElementById("active-agent-label").textContent = lb.name;
  document.querySelectorAll(".agent-chip").forEach(el => el.classList.remove("active-chip"));
  const chip = document.getElementById("chip-" + id);
  if (chip) chip.classList.add("active-chip");
  clearChatAndLoadHistory(id);
  // Notify settings tab to update agent info
  window.dispatchEvent(new CustomEvent("agentChanged", { detail: { id } }));
}

function setAgentWorking(agentId, working) {
  const icon = document.querySelector(`#ag-${agentId} .agent-icon`);
  if (icon) icon.classList.toggle("working", working);
  setAgentChipStatus(agentId, working ? "processing" : "idle");
}

function buildAgentChips(agents) {
  const el = document.getElementById("agent-chips");
  if (!el) return;
  el.innerHTML = agents.map(a => {
    const lb = agentLabel(a.id);
    return `
    <div class="agent-chip ${a.id === (window.activeAgent||'main') ? 'active-chip' : ''}"
         id="chip-${a.id}" onclick="selectAgent('${a.id}')">
      <span class="chip-icon">${lb.icon}</span>
      <span class="chip-name">${lb.name}</span>
      <span class="chip-dot chip-dot-idle" id="chip-dot-${a.id}"></span>
      <span class="chip-status chip-status-text" id="chip-txt-${a.id}"></span>
    </div>`;
  }).join('<span style="color:rgba(255,255,255,.15);font-size:11px">·</span>');
}

function setAgentChipStatus(agentId, status) {
  const dot = document.getElementById(`chip-dot-${agentId}`);
  const txt = document.getElementById(`chip-txt-${agentId}`);
  if (!dot || !txt) return;
  dot.className = "chip-dot " + (
    status === "idle" ? "chip-dot-idle" :
    status === "processing" ? "chip-dot-busy" : "chip-dot-offline"
  );
  txt.textContent = status === "processing" ? "thinking..." : status === "offline" ? "offline" : "";
  txt.classList.toggle("visible", status !== "idle");
}
