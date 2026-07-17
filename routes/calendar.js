const express = require("express");
const router = express.Router();

const calendarService = require("../services/calendarService");
const { error } = require("../utils/httpResponse");

router.get("/sync", async (req, res) => {
  try {
    const token = req.query.token;

    const result = await calendarService.syncGoogleCalendar(token);

    // Preserve this route's existing response shape ({ success, total,
    // data } from the service itself) for whatever cron job hits it.
    return res.json(result);
  } catch (err) {
    // Route through the shared helper so an unexpected failure (ICS parse
    // error, Supabase error, etc.) doesn't leak its raw message to the
    // client the way this route's own ad-hoc response used to.
    return error(res, err);
  }
});

module.exports = router;