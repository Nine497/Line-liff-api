require("dotenv").config();

const syncCalendar = require(
  "../services/syncCalendar"
);

(async () => {
  try {
    console.log(
      "=== CALENDAR SYNC START ==="
    );

    const result =
      await syncCalendar();

    console.log(
      `SUCCESS: ${result.total} events`
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "SYNC FAILED"
    );

    console.error(error);

    process.exit(1);
  }
})();