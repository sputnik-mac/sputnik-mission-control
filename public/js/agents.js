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
  clearChatAndLoadHistory(id);
}

function setAgentWorking(agentId, working) {
  const icon = document.querySelector(`#ag-${agentId} .agent-icon`);
  if (icon) icon.classList.toggle("working", working);
}
