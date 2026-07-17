const express = require("express");
const router = express.Router();

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const { z } = require("zod");

const taskService = require("../services/taskService");
const { success, error } = require("../utils/httpResponse");

// =========================
// VALIDATION SCHEMAS
// =========================
const createTaskSchema = z.object({
  title: z.string().min(1, "กรุณาระบุชื่องาน"),
  start_time: z.string().min(1, "กรุณาระบุเวลาเริ่มต้น"),
  end_time: z.string().min(1, "กรุณาระบุเวลาสิ้นสุด"),
  description: z.string().optional().nullable(),
  creator_id: z.string().optional().nullable(),
  type_id: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  participant_ids: z.array(z.string()).optional(),
});

const checkAvailableSchema = z.object({
  start: z.string().min(1, "Missing start time"),
  end: z.string().min(1, "Missing end time"),
});

const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: err.errors[0].message,
        errors: err.errors
      });
    }
    next(err);
  }
};

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
// MY TASKS (filtered by LIFF line_id)
// =========================
router.get("/mine", async (req, res) => {
  try {
    const { line_id } = req.query;
    const data = await taskService.getMyTasks(line_id);
    return success(res, data);
  } catch (err) {
    return error(res, err);
  }
});

// =========================
// CREATE TASK
// =========================
router.post("/", validate(createTaskSchema), async (req, res) => {
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
router.post("/participants/available", validate(checkAvailableSchema), async (req, res) => {
  try {
    const { start, end } = req.body;

    const data = await taskService.getAvailableParticipants(
      start,
      end
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
    const isDuty = req.body.is_duty === "true" || req.body.is_duty === true;

    const result = await taskService.importTasksFromExcel(
      req.file,
      req.body.user_id,
      isDuty
    );

    return success(res, result);
  } catch (err) {
    return error(res, err);
  }
});

module.exports = router;