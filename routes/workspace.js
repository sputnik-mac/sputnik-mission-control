const router = require("express").Router();
const fs = require("fs");
const { WORKSPACE, ALLOWED_FILES } = require("../config");

// GET /api/workspace/:file
router.get("/workspace/:file", (req, res) => {
  const name = req.params.file;
  if (!ALLOWED_FILES.includes(name)) return res.status(403).json({ error: "Not allowed" });
  try {
    const content = fs.readFileSync(`${WORKSPACE}/${name}`, "utf8");
    res.json({ name, content });
  } catch { res.json({ name, content: "" }); }
});

// POST /api/workspace/:file
router.post("/workspace/:file", (req, res) => {
  const name = req.params.file;
  if (!ALLOWED_FILES.includes(name)) return res.status(403).json({ error: "Not allowed" });
  const { content } = req.body;
  if (typeof content !== "string") return res.status(400).json({ error: "content required" });
  try {
    fs.writeFileSync(`${WORKSPACE}/${name}`, content, "utf8");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
