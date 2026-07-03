const supabase = require("../supabase");

/**
 * =========================
 * CONFLICT CHECK
 * =========================
 */
async function checkConflict(participant_ids, start, end) {
  try {
    if (!participant_ids?.length) return [];

    const { data, error } = await supabase
      .from("task_participants")
      .select(`
        participant_id,
        participant:participants(id,name),
        task:tasks(id,title,start_time,end_time)
      `)
      .in("participant_id", participant_ids);

    if (error) {
      console.error("[checkConflict] Supabase error:", error);
      throw error;
    }

    return (data || [])
      .filter((row) => {
        const t = row.task;
        if (!t) return false;

        const taskStart = new Date(t.start_time);
        const taskEnd = new Date(t.end_time);

        return start < taskEnd && end > taskStart;
      })
      .map((row) => ({
        participant_id: row.participant?.id,
        participant_name: row.participant?.name,
        task_id: row.task?.id,
        task_title: row.task?.title,
        start_time: row.task?.start_time,
        end_time: row.task?.end_time,
      }));
  } catch (err) {
    console.error("[checkConflict] Unexpected error:", err);
    throw err;
  }
}

/**
 * =========================
 * INSERT TASK
 * =========================
 */
async function insertTask({
  title,
  description,
  creator_id,
  start_time,
  end_time,
  type_id,
  location,
  source = "manual",
  created_at,
  updated_at,
}) {
  try {
    const payload = {
      title: title.trim(),
      description: description?.trim() || null,
      creator_id,
      start_time,
      end_time,
      type_id: type_id ?? null,
      location: location?.trim() || null,
      source,
      created_at,
      updated_at,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("[insertTask] Supabase error:", error);
      console.error("[insertTask] Payload:", payload);
      throw error;
    }

    return data;
  } catch (err) {
    console.error("[insertTask] Unexpected error:", err);
    throw err;
  }
}

/**
 * =========================
 * ATTACH PARTICIPANTS
 * =========================
 */
async function attachParticipants(task_id, participant_ids, now) {
  try {
    if (!participant_ids?.length) return;

    const rows = participant_ids.map((id) => ({
      task_id,
      participant_id: id,
      created_at: now,
    }));

    const { error } = await supabase
      .from("task_participants")
      .upsert(rows, {
        onConflict: "task_id,participant_id",
      });

    if (error) {
      console.error("[attachParticipants] Supabase error:", error);
      console.error("[attachParticipants] rows:", rows);
      throw error;
    }
  } catch (err) {
    console.error("[attachParticipants] Unexpected error:", err);
    throw err;
  }
}

/**
 * =========================
 * CREATE TASK (MAIN)
 * =========================
 */
async function createTask(payload) {
  try {
    console.log("[createTask] payload:", payload);

    const {
      title,
      description,
      creator_id,
      start_time,
      end_time,
      type_id,
      location,
      participant_ids = [],
    } = payload;

    // 1. validate
    if (!title?.trim()) {
      throw { code: "VALIDATION", message: "กรุณาระบุชื่องาน" };
    }

    if (!start_time || !end_time) {
      throw { code: "VALIDATION", message: "กรุณาระบุวันและเวลา" };
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (end <= start) {
      throw {
        code: "VALIDATION",
        message: "วันสิ้นสุดต้องมากกว่าวันเริ่มต้น",
      };
    }

    // 2. resolve creator
    let finalCreatorId = null;

    if (creator_id) {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .or(`id.eq.${creator_id},line_id.eq.${creator_id}`)
        .maybeSingle();

      if (error) {
        console.error("[createTask] creator resolve error:", error);
      }

      finalCreatorId = data?.id || null;
    }

    // 3. conflict
    const conflicts = await checkConflict(
      participant_ids,
      start,
      end
    );

    if (conflicts.length > 0) {
      console.warn("[createTask] conflict detected:", conflicts);

      throw {
        code: "CONFLICT",
        message: "ผู้เข้าร่วมบางคนติดภารกิจอยู่แล้ว",
        conflicts,
      };
    }

    const now = new Date().toISOString();

    // 4. insert
    const task = await insertTask({
      title,
      description,
      creator_id: finalCreatorId,
      start_time,
      end_time,
      type_id,
      location,
      source: "manual",
      created_at: now,
      updated_at: now,
    });

    // 5. relation
    await attachParticipants(task.id, participant_ids, now);

    // 6. enrich
    const { data: enriched, error } = await supabase
      .from("tasks")
      .select(`
        *,
        creator:users(id,display_name,picture_url),
        type:types(id,name),
        task_participants(
          id,
          participant:participants(id,name)
        )
      `)
      .eq("id", task.id)
      .single();

    if (error) {
      console.error("[createTask] enrich error:", error);
    }

    return enriched || task;

  } catch (err) {
    console.error("[createTask] FAILED:", err);
    throw err;
  }
}

/**
 * =========================
 * AVAILABLE PARTICIPANTS
 * =========================
 */
async function getAvailableParticipants(start, end) {
  try {
    console.log("[getAvailableParticipants]", { start, end });

    if (!start || !end) {
      throw { code: "VALIDATION", message: "Missing time range" };
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    const { data: participants, error } = await supabase
      .from("participants")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("[getAvailableParticipants] participants error:", error);
      throw error;
    }

    const { data: busy } = await supabase
      .from("task_participants")
      .select(`
        participant_id,
        task:tasks(start_time,end_time)
      `);

    const busyIds = new Set(
      (busy || [])
        .filter((b) => {
          const t = b.task;
          if (!t) return false;

          const ts = new Date(t.start_time);
          const te = new Date(t.end_time);

          return startDate < te && endDate > ts;
        })
        .map((b) => b.participant_id)
    );

    return (participants || []).filter((p) => !busyIds.has(p.id));

  } catch (err) {
    console.error("[getAvailableParticipants] FAILED:", err);
    throw err;
  }
}

/**
 * =========================
 * OTHER FUNCTIONS (safe logs)
 * =========================
 */
async function getParticipants() {
  try {
    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("[getParticipants] error:", error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error("[getParticipants] FAILED:", err);
    throw err;
  }
}

async function getTaskTypes() {
  try {
    const { data, error } = await supabase
      .from("types")
      .select("id,name")
      .not("name", "is", null)
      .neq("name", "")
      .order("name", { ascending: true });

    if (error) {
      console.error("[getTaskTypes] error:", error);
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error("[getTaskTypes] FAILED:", err);
    throw err;
  }
}

async function getTodayTasks() {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .gte("start_time", start.toISOString())
      .lte("start_time", end.toISOString());

    if (error) {
      console.error("[getTodayTasks] error:", error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error("[getTodayTasks] FAILED:", err);
    throw err;
  }
}

/**
 * =========================
 * ENRICH TASKS (creator + type)
 * shared by getTasks / getMyTasks so both return the same shape
 * =========================
 */
async function enrichTasks(tasks) {
  const creatorIds = [...new Set((tasks || []).map(t => t.creator_id).filter(Boolean))];
  const typeIds = [...new Set((tasks || []).map(t => t.type_id).filter(Boolean))];

  let creatorMap = new Map();
  let typeMap = new Map();

  if (creatorIds.length) {
    const { data } = await supabase
      .from("users")
      .select("id,display_name,picture_url,line_id")
      .in("id", creatorIds);

    creatorMap = new Map((data || []).map(u => [u.id, u]));
  }

  if (typeIds.length) {
    const { data } = await supabase
      .from("types")
      .select("id,name,color")
      .in("id", typeIds);

    typeMap = new Map((data || []).map(t => [t.id, t]));
  }

  return (tasks || []).map(task => ({
    ...task,
    creator: creatorMap.get(task.creator_id) || null,
    type: typeMap.get(task.type_id) || null,
  }));
}

async function getTasks() {
  try {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(`
        *,
        task_participants(
          id,
          participant:participants(id,name)
        )
      `);

    if (error) {
      console.error("[getTasks] error:", error);
      throw error;
    }

    return await enrichTasks(tasks);

  } catch (err) {
    console.error("[getTasks] FAILED:", err);
    throw err;
  }
}

/**
 * =========================
 * MY TASKS (by LIFF line_id)
 * Resolves the participant linked to this LINE account, then returns
 * only the tasks that participant is assigned to.
 * =========================
 */
async function getParticipantByLineId(lineId) {
  const { data, error } = await supabase
    .from("participants")
    .select("id,name,line_id")
    .eq("line_id", lineId)
    .maybeSingle();

  if (error) {
    console.error("[getParticipantByLineId] error:", error);
    throw error;
  }

  return data || null;
}

async function getMyTasks(lineId) {
  try {
    if (!lineId) {
      throw { code: "VALIDATION", message: "Missing line_id" };
    }

    const participant = await getParticipantByLineId(lineId);

    if (!participant) {
      return { participant: null, tasks: [] };
    }

    const { data: links, error: linkError } = await supabase
      .from("task_participants")
      .select("task_id")
      .eq("participant_id", participant.id);

    if (linkError) {
      console.error("[getMyTasks] task_participants error:", linkError);
      throw linkError;
    }

    const taskIds = [...new Set((links || []).map(l => l.task_id))];

    if (!taskIds.length) {
      return { participant, tasks: [] };
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select(`
        *,
        task_participants(
          id,
          participant:participants(id,name)
        )
      `)
      .in("id", taskIds);

    if (tasksError) {
      console.error("[getMyTasks] tasks error:", tasksError);
      throw tasksError;
    }

    return { participant, tasks: await enrichTasks(tasks) };

  } catch (err) {
    console.error("[getMyTasks] FAILED:", err);
    throw err;
  }
}

module.exports = {
  createTask,
  checkConflict,
  insertTask,
  attachParticipants,
  getAvailableParticipants,
  getParticipants,
  getTaskTypes,
  getTodayTasks,
  getTasks,
  getParticipantByLineId,
  getMyTasks,
};