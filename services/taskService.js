const supabase = require("../supabase");
async function createFullTask(payload) {
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

  const start = new Date(start_time);
  const end = new Date(end_time);

  if (end <= start) {
    throw {
      code: "VALIDATION",
      message: "วันสิ้นสุดต้องมากกว่าวันเริ่มต้น",
    };
  }

  // 2. check conflict
  const conflicts = await checkConflict(participant_ids, start, end);

  if (conflicts.length > 0) {
    throw {
      code: "CONFLICT",
      error: "ผู้เข้าร่วมบางคนติดภารกิจ",
      conflicts,
    };
  }

  // 3. create task
  const task = await insertTask(payload);

  // 4. attach participants
  await attachParticipants(task.id, participant_ids);

  return task;
}

async function importTasksFromExcel(file, userId) {
  const XLSX = require("xlsx");
  const dayjs = require("dayjs");

  if (!file) throw { message: "No file uploaded" };

  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  const thaiMonths = {
    มกราคม:1, กุมภาพันธ์:2, มีนาคม:3, เมษายน:4,
    พฤษภาคม:5, มิถุนายน:6, กรกฎาคม:7, สิงหาคม:8,
    กันยายน:9, ตุลาคม:10, พฤศจิกายน:11, ธันวาคม:12,
  };

  const inserted = [];

  for (const row of rows.slice(1)) {
    if (!row || row.every(c => !String(c).trim())) continue;

    const rawDate = String(row[0]).trim();
    if (!rawDate) continue;

    const parts = rawDate.split(" ");
    const day = Number(parts[0]);
    const month = thaiMonths[parts[1]];
    const year = Number(parts[2]) - 543;

    if (!day || !month || !year) continue;

    const start = dayjs(new Date(year, month - 1, day, 8));
    const end = start.add(8, "hour");

    const { data: task } = await supabase
      .from("tasks")
      .upsert({
        title: "เข้าเวร",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        type_id: 3,
        creator_id: userId,
        source: "excel",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "title,start_time,end_time,source"
      })
      .select()
      .single();

    if (task) inserted.push(task);
  }

  return {
    success: true,
    count: inserted.length,
    data: inserted,
  };
}

async function checkConflict(participant_ids, start, end) {
  const { data } = await supabase
    .from("task_participants")
    .select(`
      participant_id,
      participant:participants(id,name),
      task:tasks(id,title,start_time,end_time)
    `)
    .in("participant_id", participant_ids);

  if (!data) return [];

  return data.filter((row) => {
    const t = row.task;
    if (!t) return false;

    const taskStart = new Date(t.start_time);
    const taskEnd = new Date(t.end_time);

    return start < taskEnd && end > taskStart;
  }).map((row) => ({
    participant_id: row.participant?.id,
    participant_name: row.participant?.name,
    task_id: row.task?.id,
    task_title: row.task?.title,
    start_time: row.task?.start_time,
    end_time: row.task?.end_time,
  }));
}

async function insertTask(payload) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: payload.title.trim(),
      creator_id: payload.creator_id,
      start_time: payload.start_time,
      end_time: payload.end_time,
      type_id: payload.type_id,
      location: payload.location || null,
      source: "manual",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function attachParticipants(task_id, participant_ids) {
  if (!participant_ids.length) return;

  const rows = participant_ids.map((id) => ({
    task_id,
    participant_id: id,
  }));

  await supabase.from("task_participants").upsert(rows, {
    onConflict: "task_id,participant_id",
  });
}

async function getAvailableParticipants(start, end) {
  // 1. หาคนทั้งหมด
  const participants = await db("participants");

  // 2. หางานที่ชนช่วงเวลา
  const busy = await db("tasks")
    .join("task_participants", "tasks.id", "task_participants.task_id")
    .where(function () {
      this.whereBetween("tasks.start_time", [start, end])
        .orWhereBetween("tasks.end_time", [start, end])
        .orWhere(function () {
          this.where("tasks.start_time", "<=", start)
            .andWhere("tasks.end_time", ">=", end);
        });
    })
    .select("task_participants.participant_id");

  const busyIds = new Set(
    busy.map((b) => b.participant_id)
  );

  // 3. filter คนว่าง
  const available = participants.filter(
    (p) => !busyIds.has(p.id)
  );

  return available;
}

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

  // =========================
  // 1. VALIDATION
  // =========================
  if (!title?.trim()) {
    throw {
      code: "VALIDATION",
      message: "กรุณาระบุชื่องาน",
    };
  }

  const start = new Date(start_time);
  const end = new Date(end_time);

  if (!start_time || !end_time) {
    throw {
      code: "VALIDATION",
      message: "กรุณาระบุวันและเวลา",
    };
  }

  if (end <= start) {
    throw {
      code: "VALIDATION",
      message: "วันสิ้นสุดต้องมากกว่าวันเริ่มต้น",
    };
  }

  // =========================
  // 2. CREATOR RESOLVE
  // =========================
  let finalCreatorId = null;

  if (creator_id) {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .or(`id.eq.${creator_id},line_id.eq.${creator_id}`)
      .limit(1)
      .maybeSingle();

    finalCreatorId = user?.id || null;
  }

  // =========================
  // 3. CONFLICT CHECK
  // =========================
  if (participant_ids.length > 0) {
    const conflicts = await checkConflict(
      participant_ids,
      start,
      end
    );

    if (conflicts.length > 0) {
      throw {
        code: "CONFLICT",
        error: "ผู้เข้าร่วมบางคนติดภารกิจอยู่แล้ว",
        conflicts,
      };
    }
  }

  // =========================
  // 4. CREATE TASK
  // =========================
  const now = new Date().toISOString();

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: title.trim(),
      creator_id: finalCreatorId,
      start_time,
      end_time,
      type_id: type_id ?? null,
      location: location?.trim() || null,
      source: "manual",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  // =========================
  // 5. ATTACH PARTICIPANTS
  // =========================
  if (participant_ids.length > 0) {
    const rows = participant_ids.map((id) => ({
      task_id: task.id,
      participant_id: id,
      created_at: now,
    }));

    const { error: relError } = await supabase
      .from("task_participants")
      .upsert(rows, {
        onConflict: "task_id,participant_id",
      });

    if (relError) {
      // rollback
      await supabase.from("tasks").delete().eq("id", task.id);

      throw relError;
    }
  }

  // =========================
  // 6. RETURN ENRICHED TASK
  // =========================
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

async function getParticipants() {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .order("name",{ ascending:true });

  if (error) throw error;

  return data;
}

async function getTaskTypes() {
  const { data, error } = await supabase
    .from("types")
    .select("id,name")
    .not("name","is",null)
    .neq("name","")
    .order("name",{ ascending:true });

  if (error) throw error;

  return data || [];
}

async function getTodayTasks() {
  const start = new Date();
  start.setHours(0,0,0,0);

  const end = new Date();
  end.setHours(23,59,59,999);

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .gte("start_time", start.toISOString())
    .lte("start_time", end.toISOString());

  if (error) throw error;

  return data;
}

async function getTasks() {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(`
      *,
      task_participants (
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

    creatorMap = new Map(data.map(u => [u.id, u]));
  }

  if (typeIds.length) {
    const { data } = await supabase
      .from("types")
      .select("id,name,color")
      .in("id", typeIds);

    typeMap = new Map(data.map(t => [t.id, t]));
  }

  return tasks.map(task => ({
    ...task,
    creator: creatorMap.get(task.creator_id) || null,
    type: typeMap.get(task.type_id) || null,
  }));
}

module.exports = {
  getAvailableParticipants,createFullTask,checkConflict,insertTask,attachParticipants,createTask,getParticipants,getTaskTypes,getTodayTasks,getTasks
};