// Agent labels are loaded dynamically from /api/agents — see agents.js
// This map is populated at runtime, not hardcoded
const AGENT_LABELS = {};

const WS_FILES = [
  { name: "SOUL.md",      desc: "Identity & personality",  emoji: "🧠" },
  { name: "MEMORY.md",    desc: "Long-term memory",         emoji: "💾" },
  { name: "HEARTBEAT.md", desc: "Periodic tasks",           emoji: "💓" },
  { name: "AGENTS.md",    desc: "Workspace rules",          emoji: "⚙️" },
  { name: "USER.md",      desc: "User profile",             emoji: "👤" },
  { name: "TOOLS.md",     desc: "Tools & notes",            emoji: "🔧" },
];
