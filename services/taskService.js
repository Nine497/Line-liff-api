const supabase = require("../supabase");

/**
 * =========================
 * CONFLICT CHECK
 * =========================
 */
async function checkConflict(participant_ids, start, end) {
  if (!participant_ids?.length) return [];

  const { data, error } = await supabase
    .from("task_participants")
    .select(`
      participant_id,
      participant:participants(id,name),
      task:tasks(id,title,start_time,end_time)
    `)
    .in("participant_id", participant_ids);

  if (error) throw error;

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
}

/**
 * =========================
 * INSERT TASK
 * =========================
 */
async function insertTask(payload, finalCreatorId, now) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: payload.title.trim(),
      creator_id: finalCreatorId,
      start_time: payload.start_time,
      end_time: payload.end_time,
      type_id: payload.type_id ?? null,
      location: payload.location?.trim() || null,
      source: "manual",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * =========================
 * ATTACH PARTICIPANTS
 * =========================
 */
async function attachParticipants(task_id, participant_ids, now) {
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

  if (error) throw error;
}

/**
 * =========================
 * CREATE TASK (MAIN)
 * =========================
 */
async function createTask(payload) {
  const {
    title,
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
    const { data } = await supabase
      .from("users")
      .select("id")
      .or(`id.eq.${creator_id},line_id.eq.${creator_id}`)
      .maybeSingle();

    finalCreatorId = data?.id || null;
  }

  // 3. conflict check
  const conflicts = await checkConflict(
    participant_ids,
    start,
    end
  );

  if (conflicts.length > 0) {
    throw {
      code: "CONFLICT",
      message: "ผู้เข้าร่วมบางคนติดภารกิจอยู่แล้ว",
      conflicts,
    };
  }

  const now = new Date().toISOString();

  // 4. create task
  const task = await insertTask(payload, finalCreatorId, now);

  // 5. attach participants
  await attachParticipants(task.id, participant_ids, now);

  // 6. enrich
  const { data: enriched } = await supabase
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

  return enriched || task;
}

/**
 * =========================
 * AVAILABLE PARTICIPANTS (SMART)
 * =========================
 */
async function getAvailableParticipants(start, end) {
  if (!start || !end) {
    throw { code: "VALIDATION", message: "Missing time range" };
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  const { data: participants, error } = await supabase
    .from("participants")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;

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
  return participants.filter((p) => !busyIds.has(p.id));
}

/**
 * =========================
 * GET PARTICIPANTS
 * =========================
 */
async function getParticipants() {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;

  return data;
}

/**
 * =========================
 * TASK TYPES
 * =========================
 */
async function getTaskTypes() {
  const { data, error } = await supabase
    .from("types")
    .select("id,name")
    .not("name", "is", null)
    .neq("name", "")
    .order("name", { ascending: true });

  if (error) throw error;

  return data || [];
}

/**
 * =========================
 * TODAY TASKS
 * =========================
 */
async function getTodayTasks() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .gte("start_time", start.toISOString())
    .lte("start_time", end.toISOString());

  if (error) throw error;

  return data;
}

/**
 * =========================
 * GET TASKS (ENRICHED)
 * =========================
 */
async function getTasks() {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(`
      *,
      task_participants(
        id,
        participant:participants(id,name)
      )
    `);

  if (error) throw error;

  const creatorIds = [...new Set(tasks.map(t => t.creator_id).filter(Boolean))];
  const typeIds = [...new Set(tasks.map(t => t.type_id).filter(Boolean))];

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

  return tasks.map(task => ({
    ...task,
    creator: creatorMap.get(task.creator_id) || null,
    type: typeMap.get(task.type_id) || null,
  }));
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
};