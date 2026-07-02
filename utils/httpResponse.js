function success(res, data, message = "Success", status = 200) {
  console.log("Res data : ",data);
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

function error(res, err) {
  const status = err?.status || 500;

  return res.status(status).json({
    success: false,
    error: {
      message: err?.message || "Server Error",
      code: err?.code || "SERVER_ERROR",
      extra: err?.extra || null,
    },
  });
}

module.exports = {
  success,
  error,
};