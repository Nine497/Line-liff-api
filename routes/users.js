const router = require("express").Router();
const authService = require("../services/authService");

// login / upsert
router.post("/", async (req, res) => {
  try {
    const user = await authService.upsertUserFromLine(req.body.id_token);
    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: "Invalid LINE token" });
  }
});

// list users
router.get("/", async (req, res) => {
  try {
    const data = await authService.getUsers();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// get by line id
router.get("/:id", async (req, res) => {
  try {
    const data = await authService.getUserByLineId(req.params.id);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;