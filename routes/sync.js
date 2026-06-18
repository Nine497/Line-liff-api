require("dotenv").config();

const express = require("express");
const router = express.Router();

const syncCalendar = require("../services/syncCalendar");

router.get("/sync", async (req, res) => {
  console.log(
    "SYNC CALLED",
    new Date().toISOString(),
    req.headers["user-agent"],
    req.ip
  );

  try {
    const token = req.query.token;

    if (token !== process.env.CRON_SECRET) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const result =
      await syncCalendar();

    res.json(result);
  } catch (error) {
    console.error(
      "SYNC ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;