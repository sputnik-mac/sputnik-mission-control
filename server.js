const express = require("express");
const http = require("http");
const path = require("path");
const { PORT } = require("./config");
const { startCleanup } = require("./lib/cleanup");

const app = express();
const server = http.createServer(app);

// Middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`));
  next();
});

// Routes
app.use("/api", require("./routes/status"));
app.use("/api", require("./routes/chat"));
app.use("/api", require("./routes/sessions"));
app.use("/api", require("./routes/memory"));
app.use("/api", require("./routes/sqlite"));
app.use("/api", require("./routes/workspace"));
app.use("/api", require("./routes/cron"));
app.use("/api", require("./routes/stats"));
app.use("/api", require("./routes/agents"));
app.use("/api", require("./routes/remind"));
app.use("/api", require("./routes/command"));
app.use("/api", require("./routes/health"));

startCleanup();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛰️  Sputnik Mission Control`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Tailscale: https://sputniks-mac-mini.tailcde006.ts.net:8444\n`);
});
