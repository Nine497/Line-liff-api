function success(res, data, message = "Success", status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

// Errors we deliberately throw ourselves (VALIDATION, CONFLICT, UNAUTHORIZED,
// NOT_FOUND) carry a message written for the end user, so it's safe to pass
// through as-is. Anything else — raw Supabase/Postgres errors, thrown
// library exceptions, bugs — is not: those can contain constraint names,
// column names, or other internal details that shouldn't reach the client.
const SAFE_ERROR_CODES = new Set(["VALIDATION", "CONFLICT", "UNAUTHORIZED", "NOT_FOUND"]);

// Only used when the caller didn't explicitly set err.status — several
// throw sites across the codebase set a `code` but never a `status`, which
// silently defaulted every one of them to 500 instead of the correct
// 400/401/409.
const DEFAULT_STATUS_BY_CODE = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  NOT_FOUND: 404,
};

function error(res, err) {
  const code = err?.code || "SERVER_ERROR";
  const status = err?.status || DEFAULT_STATUS_BY_CODE[code] || 500;
  const isSafe = SAFE_ERROR_CODES.has(code);

  if (!isSafe) {
    console.error("[error]", err);
  }

  return res.status(status).json({
    success: false,
    error: {
      message: isSafe ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง",
      code,
      extra: isSafe ? (err?.extra ?? null) : null,
    },
  });
}

module.exports = {
  success,
  error,
};
