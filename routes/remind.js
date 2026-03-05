const router = require("express").Router();
const { execSync } = require("child_process");
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("../config");

// POST /api/remind
router.post("/remind", async (req, res) => {
  const { minutes = 5, text = "⏰ Напоминание!" } = req.body;
  setTimeout(async () => {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `⏰ ${text}` }),
      });
    } catch {}
  }, minutes * 60 * 1000);
  res.json({ ok: true, scheduledFor: new Date(Date.now() + minutes * 60 * 1000).toISOString() });
});

// POST /api/things
router.post("/things", (req, res) => {
  const { title = "Задача", notes = "", when = "today" } = req.body;
  try {
    const url = `things:///add?title=${encodeURIComponent(title)}&notes=${encodeURIComponent(notes)}&when=${when}`;
    execSync(`open "${url}"`, { timeout: 3000 });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
