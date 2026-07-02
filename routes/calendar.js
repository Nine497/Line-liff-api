const express = require("express");
const router = express.Router();

const calendarService = require("../services/calendarService");

router.get("/sync", async (req, res) => {
  try {
    const token = req.query.token;

    const result = await calendarService.syncGoogleCalendar(token);

    res.json(result);
  } catch (error) {
    console.error("SYNC ERROR:", error);

    if (error.code === "UNAUTHORIZED") {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;