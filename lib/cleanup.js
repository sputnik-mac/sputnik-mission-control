const fs = require("fs");
const { OPENCLAW_HOME } = require("../config");

function cleanupOrphanSessions() {
  const agents = ["main", "github-agent", "claude-code"];
  let total = 0;
  for (const agent of agents) {
    try {
      const p = `${OPENCLAW_HOME}/agents/${agent}/sessions/sessions.json`;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      const cleaned = {};
      for (const [key, session] of Object.entries(data)) {
        if (/openai:[0-9a-f-]{36}/.test(key)) {
          const sf = session.sessionFile;
          if (sf) try { fs.unlinkSync(sf); } catch {}
          total++;
        } else {
          cleaned[key] = session;
        }
      }
      fs.writeFileSync(p, JSON.stringify(cleaned, null, 2));
    } catch {}
  }
  if (total > 0) console.log(`[cleanup] Removed ${total} orphan sessions`);
}

function startCleanup() {
  cleanupOrphanSessions();
  setInterval(cleanupOrphanSessions, 24 * 60 * 60 * 1000);
}

module.exports = { startCleanup, cleanupOrphanSessions };
