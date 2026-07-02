const express = require("express");
const router = express.Router();

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const taskService = require("../services/taskService");

/**
 * =========================
 * GET ALL TASKS
 * =========================
 */
router.get("/", async (req, res) => {
  try {
    const data = await taskService.getTasks();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * =========================
 * TODAY TASKS
 * =========================
 */
router.get("/today", async (req, res) => {
  try {
    const data = await taskService.getTodayTasks();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * =========================
 * CREATE TASK
 * =========================
 */
router.post("/", async (req, res) => {
  try {
    const task = await taskService.createTask(req.body);
    return res.json(task);
  } catch (err) {
    if (err.code === "CONFLICT") return res.status(409).json(err);
    if (err.code === "VALIDATION") return res.status(400).json(err);

    return res.status(500).json({ error: err.message });
  }
});

/**
 * =========================
 * TASK TYPES
 * =========================
 */
router.get("/types", async (req, res) => {
  try {
    const data = await taskService.getTaskTypes();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * =========================
 * PARTICIPANTS
 * =========================
 */
router.get("/participants", async (req, res) => {
  try {
    const data = await taskService.getParticipants();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * =========================
 * AVAILABLE PARTICIPANTS (SMART)
 * =========================
 */
router.post("/participants/available", async (req, res) => {
  try {
    const data = await taskService.getAvailableParticipants(
      req.body.start_time,
      req.body.end_time
    );

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * =========================
 * IMPORT EXCEL
 * =========================
 */
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    const result = await taskService.importTasksFromExcel(
      req.file,
      req.body.user_id
    );

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;