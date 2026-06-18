require("dotenv").config();

const ical = require("node-ical");
const supabase = require("../supabase");

const ICAL_URL = "https://calendar.google.com/calendar/ical/opcthmecc%40gmail.com/public/basic.ics";

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

async function syncCalendar() {
    const webEvents = await ical.async.fromURL(ICAL_URL);
    const now = new Date();

    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

    // ดึงข้อมูล Master Data มาเตรียมไว้ก่อน
    const { data: types, error: typesError } = await supabase.from("types").select("*");
    if (typesError) throw typesError;

    const { data: participantCache, error: participantError } = await supabase.from("participants").select("*");
    if (participantError) throw participantError;

    const participants = participantCache ?? [];
    const results = [];

    // ลูปประมวลผลแต่ละ Event
    for (const key in webEvents) {
        const ev = webEvents[key];

        if (ev.type !== "VEVENT") continue;
        if (!ev.start || !ev.end) continue;

        const eventStart = new Date(ev.start);
        if (eventStart < startDate || eventStart > endDate) continue;

        // All-day event fix
        let endTime = new Date(ev.end);
        if (ev.datetype === "date") {
            endTime.setDate(endTime.getDate() - 1);
        }

        // Title & Type Detection
        const title = ev.summary || "ไม่มีชื่อกิจกรรม";
        const normalizedTitle = title.replace(/\s+/g, "").toLowerCase();
        const matchedType = types.find((type) =>
            normalizedTitle.includes(type.name.replace(/\s+/g, "").toLowerCase())
        );

        // 1. Upsert Task
        const taskPayload = {
            google_event_uid: ev.uid,
            title,
            start_time: ev.start,
            end_time: endTime,
            type_id: matchedType?.id ?? 6,
        };

        const { data: taskData, error: taskError } = await supabase
            .from("tasks")
            .upsert(taskPayload, { onConflict: "google_event_uid" })
            .select()
            .single();

        if (taskError) {
            console.error("Task Upsert Error:", taskError);
            continue;
        }

        const taskId = taskData.id;

        // 2. Extract Participants จาก Tag #
        const matches =
            title.match(/#([^#]+)/g) || [];
        const participantNames = matches.map((tag) => tag.replace("#", "").trim());
        const participantResults = [];

        for (const name of participantNames) {
            const normalizedName = normalizeThaiName(name);

            let matchedParticipant = null;

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
            let participantData = null;

            if (matchedParticipant) {
                participantData = matchedParticipant;

                // อัปเดตชื่อใน DB ถ้าชื่อใหม่ยาวกว่า/สมบูรณ์กว่า
                if (name.length > matchedParticipant.name.length) {
                    const { data: updatedParticipant, error: updateError } = await supabase
                        .from("participants")
                        .update({ name })
                        .eq("id", matchedParticipant.id)
                        .select()
                        .single();

                    if (!updateError && updatedParticipant) {
                        participantData = updatedParticipant;
                        const index = participants.findIndex((p) => p.id === updatedParticipant.id);
                        if (index !== -1) participants[index] = updatedParticipant; // Sync กลับเข้า Local Cache
                    }
                }
            } else {
                // รายชื่อใหม่ -> Insert ลง DB
                const { data: newParticipant, error: insertParticipantError } = await supabase
                    .from("participants")
                    .insert({ name })
                    .select()
                    .single();

                if (insertParticipantError) {
                    console.error("Participant Insert Error:", insertParticipantError);
                    continue;
                }

                participantData = newParticipant;
                participants.push(newParticipant); // ยัดใส่ Cache เพื่อป้องกันการ Insert ซ้ำในลูปถัดไป
            }

            // 3. Upsert ความสัมพันธ์ (Relation Map)
            const { error: relationError } = await supabase
                .from("task_participants")
                .upsert(
                    { task_id: taskId, participant_id: participantData.id },
                    { onConflict: "task_id,participant_id" }
                );

            if (relationError) {
                console.error("Relation Error:", relationError);
            } else {
                participantResults.push(participantData);
            }
        }

        // เก็บข้อมูลผลลัพธ์ของ Task นี้ลงใน Array หลัก
        results.push({
            task: taskData,
            participants:
                participantResults,
            type:
                matchedType?.name ??
                null,
        });
    }

    return {
        success: true,
        total: results.length,
        data: results,
    };
}

module.exports = syncCalendar;