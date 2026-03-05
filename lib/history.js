const fs = require("fs");

// Parse a .jsonl session file and return [{role, content}] messages
function parseSessionHistory(sessionFile, limit = 30) {
  const raw = fs.readFileSync(sessionFile, "utf8");
  const messages = [];
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "compaction") continue;
      const msg = entry.message || entry;
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      let content = "";
      if (typeof msg.content === "string") content = msg.content;
      else if (Array.isArray(msg.content))
        content = msg.content.filter(b => b?.type === "text").map(b => b.text).join("\n");
      if (content.trim()) messages.push({ role: msg.role, content });
    } catch {}
  }
  return messages.slice(-limit);
}

module.exports = { parseSessionHistory };
