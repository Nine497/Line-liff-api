const ical = require("node-ical");
const crypto = require("crypto");
const supabase = require("../supabase");

const ICAL_URL =
  "https://calendar.google.com/calendar/ical/opcthmecc%40gmail.com/public/basic.ics";

// Plain `!==` leaks how many leading characters matched via response timing.
// Impractical to exploit over a real network, but a token comparison is
// cheap to do properly with crypto.timingSafeEqual instead.
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// =========================
// normalize name
// =========================
function normalizeThaiName(name) {
  if (!name) return "";

  return name
    .replace(/^นาย\s*/g, "")
    .replace(/^นางสาว\s*/g, "")
    .replace(/^น\.ส\.\s*/g, "")
    .replace(/^นาง\s*/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// =========================
// MAIN SYNC
// =========================
async function syncGoogleCalendar(token) {
  if (!safeCompare(token, process.env.CRON_SECRET)) {
    throw {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    };
  }

  const webEvents = await ical.async.fromURL(ICAL_URL);

  const now = new Date();

  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth() + 2,
    0,
    23, 59, 59, 999
  );

  // preload
  const [{ data: types }, { data: participants }] = await Promise.all([
    supabase.from("types").select("*"),
    supabase.from("participants").select("*"),
  ]);

  const results = [];

  for (const key in webEvents) {
    const ev = webEvents[key];

    if (ev.type !== "VEVENT") continue;
    if (!ev.start || !ev.end) continue;

    const eventStart = new Date(ev.start);
    if (eventStart < startDate || eventStart > endDate) continue;

    let endTime = new Date(ev.end);

    if (ev.datetype === "date") {
      endTime.setDate(endTime.getDate() - 1);
    }

    const title = ev.summary || "ไม่มีชื่อกิจกรรม";

    const normalizedTitle = title.replace(/\s+/g, "").toLowerCase();

    const matchedType = types.find(type =>
      normalizedTitle.includes(
        type.name.replace(/\s+/g, "").toLowerCase()
      )
    );

    // =========================
    // UPSERT TASK
    // =========================
    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .upsert(
        {
          google_event_uid: ev.uid,
          title,
          start_time: ev.start,
          end_time: endTime,
          type_id: matchedType?.id ?? 6,
        },
        { onConflict: "google_event_uid" }
      )
      .select()
      .single();

    if (taskError) {
      console.error("Task Upsert Error:", taskError);
      continue;
    }

    const taskId = taskData.id;

    // =========================
    // extract participants
    // =========================
    const matches = title.match(/#([^#]+)/g) || [];
    const participantNames = matches.map(t => t.replace("#", "").trim());

    const participantResults = [];

    for (const name of participantNames) {
      const normalizedName = normalizeThaiName(name);

      // Exact match first — pure substring matching alone can cross-assign
      // a task to the wrong person whenever one participant's name happens
      // to be a substring of another's (common with short Thai first names,
      // e.g. "#สม" matching both "สมชาย" and "สมหญิง"). Only fall back to
      // substring matching if nothing matches exactly.
      let matched = participants.find(p => normalizeThaiName(p.name) === normalizedName);

      if (!matched) {
        matched = participants.find(p => {
          const n = normalizeThaiName(p.name);
          return n.includes(normalizedName) || normalizedName.includes(n);
        });
      }

      let participantData = null;

      if (matched) {
        participantData = matched;
      } else {
        const { data } = await supabase
          .from("participants")
          .insert({ name })
          .select()
          .single();

        participantData = data;

        participants.push(data);
      }

      await supabase.from("task_participants").upsert(
        {
          task_id: taskId,
          participant_id: participantData.id,
        },
        {
          onConflict: "task_id,participant_id",
        }
      );

      participantResults.push(participantData);
    }

    results.push({
      task: taskData,
      participants: participantResults,
      type: matchedType?.name ?? null,
    });
  }

  return {
    success: true,
    total: results.length,
    data: results,
  };
}

module.exports = {
  syncGoogleCalendar,
};