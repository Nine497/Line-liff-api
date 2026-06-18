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

    const webEvents = await ical.async.fromURL(
      ICAL_URL
    );

    const now = new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const endDate = new Date(
      now.getFullYear(),
      now.getMonth() + 2,
      0,
      23,
      59,
      59,
      999
    );

    // =========================
    // preload types
    // =========================

    const {
      data: types,
      error: typesError,
    } = await supabase
      .from("types")
      .select("*");

    if (typesError) {
      throw typesError;
    }

    // =========================
    // preload participants
    // =========================

    const {
      data: participantCache,
      error: participantError,
    } = await supabase
      .from("participants")
      .select("*");

    if (participantError) {
      throw participantError;
    }

    const participants =
      participantCache ?? [];

    const results = [];

    for (const key in webEvents) {
      const ev = webEvents[key];

      if (ev.type !== "VEVENT") continue;

      if (!ev.start || !ev.end) continue;

      const eventStart = new Date(
        ev.start
      );

      if (
        eventStart < startDate ||
        eventStart > endDate
      ) {
        continue;
      }

      // =========================
      // all day event fix
      // =========================

      let endTime = new Date(ev.end);

      if (ev.datetype === "date") {
        endTime.setDate(
          endTime.getDate() - 1
        );
      }

      // =========================
      // title
      // =========================

      const title =
        ev.summary ||
        "ไม่มีชื่อกิจกรรม";

      const normalizedTitle =
        title
          .replace(/\s+/g, "")
          .toLowerCase();

      // =========================
      // detect type
      // =========================

      const matchedType =
        types.find((type) =>
          normalizedTitle.includes(
            type.name
              .replace(/\s+/g, "")
              .toLowerCase()
          )
        );

      // =========================
      // task payload
      // =========================

      const taskPayload = {
        google_event_uid: ev.uid,
        title,
        start_time: ev.start,
        end_time: endTime,
        type_id:
          matchedType?.id ?? 6,
      };

      const {
        data: taskData,
        error: taskError,
      } = await supabase
        .from("tasks")
        .upsert(taskPayload, {
          onConflict:
            "google_event_uid",
        })
        .select()
        .single();

      if (taskError) {
        console.error(
          "Task Upsert Error:",
          taskError
        );
        continue;
      }

      const taskId = taskData.id;

      // =========================
      // extract participants
      // =========================

      const matches =
        title.match(/#([^#]+)/g) || [];

      const participantNames =
        matches.map((tag) =>
          tag.replace("#", "").trim()
        );

      const participantResults =
        [];

      // =========================
      // loop participants
      // =========================

      for (const name of participantNames) {
        const normalizedName =
          normalizeThaiName(name);

        let matchedParticipant =
          null;

        for (const participant of participants) {
          const existingNormalized =
            normalizeThaiName(
              participant.name
            );

          if (
            existingNormalized.includes(
              normalizedName
            ) ||
            normalizedName.includes(
              existingNormalized
            )
          ) {
            matchedParticipant =
              participant;
            break;
          }
        }

        let participantData =
          null;

        // =========================
        // existing participant
        // =========================

        if (matchedParticipant) {
          participantData =
            matchedParticipant;

          if (
            name.length >
            matchedParticipant.name
              .length
          ) {
            const {
              data:
                updatedParticipant,
              error: updateError,
            } = await supabase
              .from("participants")
              .update({
                name,
              })
              .eq(
                "id",
                matchedParticipant.id
              )
              .select()
              .single();

            if (!updateError) {
              participantData =
                updatedParticipant;

              const index =
                participants.findIndex(
                  (p) =>
                    p.id ===
                    updatedParticipant.id
                );

              if (index !== -1) {
                participants[index] =
                  updatedParticipant;
              }
            }
          }
        } else {
          // =========================
          // insert participant
          // =========================

          const {
            data: newParticipant,
            error:
              insertParticipantError,
          } = await supabase
            .from("participants")
            .insert({
              name,
            })
            .select()
            .single();

          if (
            insertParticipantError
          ) {
            console.error(
              "Participant Insert Error:",
              insertParticipantError
            );
            continue;
          }

          participantData =
            newParticipant;

          participants.push(
            newParticipant
          );
        }

        // =========================
        // relation
        // =========================

        const {
          error: relationError,
        } = await supabase
          .from("task_participants")
          .upsert(
            {
              task_id: taskId,
              participant_id:
                participantData.id,
            },
            {
              onConflict:
                "task_id,participant_id",
            }
          );

        if (relationError) {
          console.error(
            "Relation Error:",
            relationError
          );
        }

        participantResults.push(
          participantData
        );
      }

      results.push({
        task: taskData,
        participants:
          participantResults,
        type:
          matchedType?.name ??
          null,
      });
    }

    res.json({
      success: true,
      total: results.length,
      data: results,
    });
  } catch (error) {
    console.error(
      "SYNC ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
