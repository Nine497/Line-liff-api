const express = require("express");
const router = express.Router();

const multer = require("multer");
const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — a duty roster sheet is tiny; this just caps abuse
  fileFilter: (req, file, cb) => {
    const isExcelExt = /\.(xlsx|xls)$/i.test(file.originalname || "");
    cb(null, EXCEL_MIME_TYPES.has(file.mimetype) || isExcelExt);
  },
});

const { z } = require("zod");

const taskService = require("../services/taskService");
const { success, error } = require("../utils/httpResponse");
const { requireLineAuth } = require("../middleware/auth");

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
  // participants.id is a plain numeric primary key (not a UUID like
  // tasks.id) — verified against live data before writing this validator.
  participant_ids: z.array(z.number().int().positive()).optional(),
});

const checkAvailableSchema = z
  .object({
    start: z.string().min(1, "Missing start time"),
    end: z.string().min(1, "Missing end time"),
  })
  .refine((val) => new Date(val.end) > new Date(val.start), {
    message: "วันสิ้นสุดต้องมากกว่าวันเริ่มต้น",
    path: ["end"],
  });

const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Zod v4 renamed ZodError.errors -> ZodError.issues. The old
      // `err.errors[0]` was always undefined here, so *every* validation
      // failure on *every* route using this middleware (missing title,
      // bad dates, etc.) threw "Cannot read properties of undefined" and
      // surfaced as a raw 500 instead of the intended 400 + Thai message.
      return res.status(400).json({
        success: false,
        message: err.issues[0]?.message || "ข้อมูลไม่ถูกต้อง",
        errors: err.issues,
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
router.post("/", requireLineAuth, validate(createTaskSchema), async (req, res) => {
  try {
    // creator_id always comes from the verified token, never the client body
    // — otherwise anyone could set it to impersonate another user.
    const task = await taskService.createTask({ ...req.body, creator_id: req.user.id });
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
router.post("/import", requireLineAuth, upload.single("file"), async (req, res) => {
  try {
    const isDuty = req.body.is_duty === "true" || req.body.is_duty === true;

    const result = await taskService.importTasksFromExcel(
      req.file,
      req.user.id,
      isDuty
    );

    return success(res, result);
  } catch (err) {
    return error(res, err);
  }
});

module.exports = router;