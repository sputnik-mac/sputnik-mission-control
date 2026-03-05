const router = require("express").Router();
const fs = require("fs");
const { OPENCLAW_HOME } = require("../config");

function readAgentList() {
  try {
    const cfg = JSON.parse(fs.readFileSync(`${OPENCLAW_HOME}/openclaw.json`, "utf8"));
    const defaults = cfg.agents?.defaults || {};
    return (cfg.agents?.list || []).map(a => ({
      id: a.id,
      name: a.identity?.name || (a.id === "main" ? "Sputnik" : a.id),
      emoji: a.identity?.emoji || (a.id === "main" ? "🛰️" : "🤖"),
      model: a.model || defaults.model?.primary || "—",
      workspace: a.workspace || defaults.workspace || "—",
      default: a.default || false,
    }));
  } catch {
    return [{ id: "main", name: "Sputnik", emoji: "🛰️", model: "—", workspace: "—", default: true }];
  }
}

// GET /api/agents — only real configured agents (from openclaw.json agents.list)
router.get("/agents", (req, res) => {
  res.json(readAgentList());
});

// GET /api/agents/:id/info — per-agent details
router.get("/agents/:id/info", (req, res) => {
  const list = readAgentList();
  const agent = list.find(a => a.id === req.params.id) || { id: req.params.id, name: req.params.id, model: "—", workspace: "—" };
  res.json(agent);
});

module.exports = router;
