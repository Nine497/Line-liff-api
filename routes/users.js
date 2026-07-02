const router = require("express").Router();
const authService = require("../services/authService");
const { success, error } = require("../utils/httpResponse");

// login / upsert
router.post("/", async (req, res) => {
  try {
    const user = await authService.upsertUserFromLine(req.body.id_token);

    return success(res, user, "Login success");
  } catch (err) {
    err.status = 401;
    err.message = "Invalid LINE token";
    err.code = "UNAUTHORIZED";

    return error(res, err);
  }
});

// list users
router.get("/", async (req, res) => {
  try {
    const data = await authService.getUsers();
    return success(res, data); // ✔️ ใช้ helper
  } catch (err) {
    return error(res, err);
  }
});

// get by line id
router.get("/:id", async (req, res) => {
  try {
    const data = await authService.getUserByLineId(req.params.id);
    return success(res, data);
  } catch (err) {
    return error(res, err);
  }
});

module.exports = router;