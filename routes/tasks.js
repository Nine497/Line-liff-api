const express = require("express");
const router = express.Router();

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const taskService = require("../services/taskService");
const { success, error } = require("../utils/httpResponse");

// =========================
// GET ALL TASKS
// =========================
router.get("/", async (req, res) => {
  try {
    const data = await taskService.getTasks();
    return success(res, data);
  } catch (err) {
    return error(res, err);
  }
});

// =========================
// TODAY TASKS
// =========================
router.get("/today", async (req, res) => {
  try {
    const data = await taskService.getTodayTasks();
    return success(res, data);
  } catch (err) {
    return error(res, err);
  }
});

// =========================
// CREATE TASK
// =========================
router.post("/", async (req, res) => {
  try {
    const task = await taskService.createTask(req.body);
    return success(res, task);
  } catch (err) {
    return error(res, err);
  }
});

// =========================
// TASK TYPES
// =========================
router.get("/types", async (req, res) => {
  try {
    const data = await taskService.getTaskTypes();
    return success(res, data);
  } catch (err) {
    return error(res, err);
  }
});

// =========================
// PARTICIPANTS
// =========================
router.get("/participants", async (req, res) => {
  try {
    const data = await taskService.getParticipants();
    return success(res, data);
  } catch (err) {
    return error(res, err);
  }
});

// =========================
// AVAILABLE PARTICIPANTS (SMART)
// =========================
router.post("/participants/available", async (req, res) => {
  try {
    const data = await taskService.getAvailableParticipants(
      req.body.start_time,
      req.body.end_time
    );

    return success(res, data);
  } catch (err) {
    return error(res, err);
  }
});

// =========================
// IMPORT EXCEL
// =========================
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    const result = await taskService.importTasksFromExcel(
      req.file,
      req.body.user_id
    );

    return success(res, result);
  } catch (err) {
    return error(res, err);
  }
});

module.exports = router;