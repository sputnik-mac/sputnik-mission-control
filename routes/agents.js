const router = require("express").Router();
const fs = require("fs");
const { OPENCLAW_HOME } = require("../config");

// GET /api/agents
router.get("/agents", async (req, res) => {
  try {
    const agentsDir = `${OPENCLAW_HOME}/agents`;
    const dirs = fs.readdirSync(agentsDir).filter(d => {
      try { return fs.statSync(`${agentsDir}/${d}`).isDirectory(); } catch { return false; }
    });
    res.json(dirs.map(id => ({ id })));
  } catch { res.json([]); }
});

module.exports = router;
