require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

// A bare cors() reflects Access-Control-Allow-Origin for *any* caller, which
// lets any website read/write this duty-roster API cross-origin from a
// victim's browser. Restrict to the known LIFF/Vercel frontend (plus local
// dev ports), configurable via ALLOWED_ORIGINS so new deploys don't need a
// code change.
const defaultAllowedOrigins = [
  "https://line-liff-flame.vercel.app",
  "http://localhost:5173",
  "http://localhost:5182",
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : defaultAllowedOrigins;

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (no Origin header, e.g. server-to-server
    // health checks) and any explicitly allowed origin.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json());

// routes
const taskRoutes = require("./routes/tasks");
app.use("/tasks", taskRoutes);
const userRoutes = require("./routes/users");
app.use("/users", userRoutes);
const calendarRoutes = require("./routes/calendar");
app.use("/calendar", calendarRoutes);

// app.post("/webhook", line.middleware(config), async (req, res) => {
//   await Promise.all(
//     req.body.events.map(handleEvent)
//   );

//   res.sendStatus(200);
// });

// Catches errors thrown by middleware that runs before a route handler's own
// try/catch (e.g. multer's file-size/type rejection), so they still come
// back as the app's normal JSON error shape instead of Express's default
// HTML error page.
app.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      error: { message: "ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)", code: "VALIDATION" },
    });
  }

  console.error("[unhandled error]", err);
  return res.status(500).json({
    success: false,
    error: { message: "Server Error", code: "SERVER_ERROR" },
  });
});

app.listen(process.env.PORT, () => {
    console.log("Server running on port " + process.env.PORT);
});