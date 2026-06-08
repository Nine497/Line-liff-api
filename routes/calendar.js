require("dotenv").config();
const express = require("express");
const router = express.Router();

const ical = require("node-ical");
const supabase = require("../supabase");
const ICAL_URL =
  "https://calendar.google.com/calendar/ical/opcthmecc%40gmail.com/public/basic.ics";

// =========================
// normalize thai name
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

router.get("/sync", async (req, res) => {
  try {
     const token = req.query.token;

  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }
  
    const webEvents = await ical.async.fromURL(ICAL_URL);

    const now = new Date();

    // เดือนนี้
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    // สิ้นเดือนหน้า
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth() + 2,
      0,
      23,
      59,
      59,
      999
    );

    const results = [];

    for (const key in webEvents) {
      const ev = webEvents[key];

      // เอาเฉพาะ event
      if (ev.type !== "VEVENT") continue;

      if (!ev.start || !ev.end) continue;

      const eventStart = new Date(ev.start);

      // filter date range
      if (eventStart < startDate || eventStart > endDate) {
        continue;
      }

      // =========================
      // all day event fix
      // =========================

      let endTime = new Date(ev.end);

      if (ev.datetype === "date") {
        endTime.setDate(endTime.getDate() - 1);
      }

      // =========================
      // insert/update task
      // =========================

      const taskPayload = {
        google_event_uid: ev.uid,

        title: ev.summary || "ไม่มีชื่อกิจกรรม",

        start_time: ev.start,
        end_time: endTime,
      };

      const {
        data: taskData,
        error: taskError,
      } = await supabase
        .from("tasks")
        .upsert(taskPayload, {
          onConflict: "google_event_uid",
        })
        .select()
        .single();

      if (taskError) {
        console.error(taskError);
        continue;
      }

      const taskId = taskData.id;

      // =========================
      // extract participants
      // =========================

const matches =
  (ev.summary || "").match(/#([^#]+)/g) || [];

const participantNames = matches.map((tag) =>
  tag.replace("#", "").trim()
);

      const participantResults = [];

      // =========================
      // loop participants
      // =========================

      for (const name of participantNames) {

        const normalizedName =
          normalizeThaiName(name);

        // =========================
        // get all participants
        // =========================

        const {
          data: existingParticipants,
          error: searchError,
        } = await supabase
          .from("participants")
          .select("*");

        if (searchError) {
          console.error(searchError);
          continue;
        }

        let matchedParticipant = null;

        // =========================
        // find similar participant
        // =========================

        for (const participant of existingParticipants) {

          const existingNormalized =
            normalizeThaiName(participant.name);

          // เช่น:
          // นพดล
          // match
          // นพดล พาลิตา

          if (
            existingNormalized.includes(normalizedName) ||
            normalizedName.includes(existingNormalized)
          ) {
            matchedParticipant = participant;
            break;
          }
        }

        let participantData = null;

        // =========================
        // existing participant
        // =========================

        if (matchedParticipant) {

          participantData = matchedParticipant;

          // ถ้าชื่อใหม่ยาวกว่า
          // update เป็นชื่อเต็ม

          if (
            name.length >
            matchedParticipant.name.length
          ) {
            const {
              data: updatedParticipant,
              error: updateError,
            } = await supabase
              .from("participants")
              .update({
                name,
              })
              .eq("id", matchedParticipant.id)
              .select()
              .single();

            if (!updateError) {
              participantData = updatedParticipant;
            }
          }

        } else {

          // =========================
          // insert new participant
          // =========================

          const {
            data: newParticipant,
            error: participantError,
          } = await supabase
            .from("participants")
            .insert({
              name,
            })
            .select()
            .single();

          if (participantError) {
            console.error(participantError);
            continue;
          }

          participantData = newParticipant;
        }

        // =========================
        // create relation
        // =========================

        const { error: relationError } =
          await supabase
            .from("task_participants")
            .upsert(
              {
                task_id: taskId,
                participant_id: participantData.id,
              },
              {
                onConflict:
                  "task_id,participant_id",
              }
            );

        if (relationError) {
          console.error(relationError);
        }

        participantResults.push(participantData);
      }

      results.push({
        task: taskData,
        participants: participantResults,
      });
    }

    res.json({
      success: true,
      total: results.length,
      data: results,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
