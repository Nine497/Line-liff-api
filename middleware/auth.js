const { verifyLineToken } = require("../services/lineAuth");
const { getUserByLineId } = require("../services/authService");

// Verifies the LIFF ID token sent as "Authorization: Bearer <token>" and
// resolves it to the corresponding row in `users`, attached as req.user.
// Every mutating task route must use req.user.id as the true actor instead
// of trusting a client-supplied creator_id/user_id body field, which any
// caller could otherwise set to impersonate someone else.
async function requireLineAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        error: { code: "UNAUTHORIZED" },
      });
    }

    const decoded = await verifyLineToken(token);
    const user = await getUserByLineId(decoded.sub);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        error: { code: "UNAUTHORIZED" },
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("[requireLineAuth] token verification failed:", err.message);
    return res.status(401).json({
      success: false,
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
      error: { code: "UNAUTHORIZED" },
    });
  }
}

module.exports = { requireLineAuth };
