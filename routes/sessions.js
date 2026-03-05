const router = require("express").Router();
const fs = require("fs");
const { OPENCLAW_HOME, MAIN_SESSION_KEY } = require("../config");

const AGENTS = ["main", "github-agent", "claude-code"];

// GET /api/sessions
router.get("/sessions", async (req, res) => {
  const result = [];
  for (const agent of AGENTS) {
    try {
      const p = `${OPENCLAW_HOME}/agents/${agent}/sessions/sessions.json`;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const [key, s] of Object.entries(data)) {
        if (key.includes(":run:")) continue;
        const size = (() => {
          try { return fs.statSync(s.sessionFile || "").size; } catch { return 0; }
        })();
        result.push({
          key,
          agent,
          updatedAt: s.updatedAt,
          chatType: s.chatType || "direct",
          origin: s.origin?.provider || s.origin?.label || "unknown",
          sizeKb: Math.round(size / 1024),
          isTelegram: key.includes("telegram"),
          isMain: key === MAIN_SESSION_KEY,
        });
      }
    } catch {}
  }
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json(result);
});

// DELETE /api/sessions/:key
router.delete("/sessions/:key", (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (key === MAIN_SESSION_KEY) {
    return res.status(403).json({ error: "Cannot delete main session" });
  }
  for (const agent of AGENTS) {
    try {
      const p = `${OPENCLAW_HOME}/agents/${agent}/sessions/sessions.json`;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (key in data) {
        const sf = data[key]?.sessionFile;
        if (sf) try { fs.unlinkSync(sf); } catch {}
        delete data[key];
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return res.json({ ok: true });
      }
    } catch {}
  }
  res.json({ ok: true });
});

module.exports = router;
