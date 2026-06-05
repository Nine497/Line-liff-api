const express = require("express");
const router = express.Router();

const supabase = require("../supabase");
const multer = require("multer");
const XLSX = require("xlsx");
const dayjs = require("dayjs");
const buddhistEra = require("dayjs/plugin/buddhistEra");

dayjs.extend(buddhistEra);


const upload = multer({
    storage: multer.memoryStorage(),
});

router.get("/", async (req, res) => {
    try {
        const {
            data: tasks,
            error,
        } = await supabase
            .from("tasks")
            .select(`
        *,
        task_participants (
          id,
          participant:participants (
            id,
            name
          )
        )
      `);

        if (error) {
            return res
                .status(500)
                .json(error);
        }

        // creators
        const creatorIds =
            Array.from(
                new Set(
                    tasks
                        .map(
                            (task) =>
                                task.creator_id
                        )
                        .filter(Boolean)
                )
            );

        // task types
        const typeIds =
            Array.from(
                new Set(
                    tasks
                        .map(
                            (task) =>
                                task.type_id
                        )
                        .filter(Boolean)
                )
            );

        let creatorMap =
            new Map();

        let typeMap =
            new Map();

        // load creators
        if (
            creatorIds.length > 0
        ) {
            const {
                data: creators,
                error:
                creatorsError,
            } = await supabase
                .from("users")
                .select(`
          id,
          display_name,
          picture_url,
          line_id
        `)
                .in(
                    "id",
                    creatorIds
                );

            if (creatorsError) {
                console.error(
                    "Failed to load creators",
                    creatorsError
                );
            } else {
                creatorMap =
                    new Map(
                        creators.map(
                            (creator) => [
                                creator.id,
                                creator,
                            ]
                        )
                    );
            }
        }

        // load task types
        if (typeIds.length > 0) {
            const {
                data: types,
                error: typesError,
            } = await supabase
                .from("types")
                .select(`
          id,
          name,
          color
        `)
                .in("id", typeIds);

            if (typesError) {
                console.error(
                    "Failed to load task types",
                    typesError
                );
            } else {
                typeMap =
                    new Map(
                        types.map(
                            (type) => [
                                type.id,
                                type,
                            ]
                        )
                    );
            }
        }

        // merge data
        const enrichedTasks =
            tasks.map((task) => ({
                ...task,

                creator:
                    creatorMap.get(
                        task.creator_id
                    ) ?? null,

                type:
                    typeMap.get(
                        task.type_id
                    ) ?? null,
            }));

        if (
            enrichedTasks.length !==
            0
        ) {
            console.log(
                "Enriched tasks:",
                enrichedTasks
            );
        }

        return res.json(
            enrichedTasks
        );
    } catch (err) {
        console.error(err);

        return res.status(500).json({
            error: err.message,
        });
    }
});

router.get("/today", async (req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString());

    if (error) return res.status(500).json(error);

    res.json(data);
});

router.post("/", async (req, res) => {
    try {
        const {
            title,
            creator_id,
            start_time,
            end_time,
            type_id,
            location,

            // manual create
            participant_ids,

            // import excel
            participants,
        } = req.body;

        console.log(
            "Creating task with data:",
            req.body
        );

        function normalizeThaiName(
            name = ""
        ) {
            return name
                .trim()
                .replace(
                    /^(นาย|นาง|นางสาว|น\.ส\.|ดร\.)/g,
                    ""
                )
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();
        }

        let finalCreatorId =
            creator_id || null;

        // check creator
        if (finalCreatorId) {
            const {
                data: userCheck,
            } = await supabase
                .from("users")
                .select("id")
                .or(
                    `id.eq.${finalCreatorId},line_id.eq.${finalCreatorId}`
                )
                .limit(1);

            if (
                Array.isArray(userCheck) &&
                userCheck.length > 0
            ) {
                finalCreatorId =
                    userCheck[0].id;
            } else {
                finalCreatorId = null;
            }
        }

        // create task
        const {
            data: task,
            error: taskError,
        } = await supabase
            .from("tasks")
            .insert([
                {
                    title,

                    creator_id:
                        finalCreatorId,

                    start_time,

                    end_time:
                        end_time || null,

                    type_id:
                        type_id ?? null,

                    location:
                        location || null,

                    created_at:
                        new Date().toISOString(),

                    updated_at:
                        new Date().toISOString(),
                },
            ])
            .select()
            .single();

        if (taskError) {
            console.error(
                "Task Insert Error:",
                taskError
            );

            return res
                .status(500)
                .json(taskError);
        }

        const taskParticipantRows =
            [];

        /*
          ===================================
          CASE 1:
          participant_ids
          ===================================
        */

        if (
            Array.isArray(
                participant_ids
            ) &&
            participant_ids.length > 0
        ) {
            console.log(
                "Using participant_ids"
            );

            for (const participantId of participant_ids) {
                if (!participantId) {
                    continue;
                }

                taskParticipantRows.push(
                    {
                        task_id:
                            task.id,

                        participant_id:
                            participantId,

                        created_at:
                            new Date().toISOString(),
                    }
                );
            }
        }

        /*
          ===================================
          CASE 2:
          participants (excel import)
          ===================================
        */

        else if (
            Array.isArray(
                participants
            ) &&
            participants.length > 0
        ) {
            console.log(
                "Using participant names"
            );

            const {
                data: allParticipants,
            } = await supabase
                .from("participants")
                .select(`
          id,
          name
        `);

            for (const rawName of participants) {
                const participantName =
                    String(
                        rawName
                    ).trim();

                if (
                    !participantName
                ) {
                    continue;
                }

                const normalizedInput =
                    normalizeThaiName(
                        participantName
                    );

                let participantId =
                    null;

                // find similar name
                const matchedParticipant =
                    (
                        allParticipants ??
                        []
                    ).find(
                        (
                            participant
                        ) => {
                            const normalizedDbName =
                                normalizeThaiName(
                                    participant.name
                                );

                            return (
                                normalizedDbName.includes(
                                    normalizedInput
                                ) ||
                                normalizedInput.includes(
                                    normalizedDbName
                                )
                            );
                        }
                    );

                // already exists
                if (
                    matchedParticipant
                ) {
                    participantId =
                        matchedParticipant.id;
                } else {
                    // create new
                    const {
                        data:
                        newParticipant,
                        error:
                        participantInsertError,
                    } = await supabase
                        .from(
                            "participants"
                        )
                        .insert([
                            {
                                name:
                                    participantName,

                                created_at:
                                    new Date().toISOString(),
                            },
                        ])
                        .select(`
              id
            `)
                        .single();

                    if (
                        participantInsertError
                    ) {
                        console.error(
                            participantInsertError
                        );

                        continue;
                    }

                    participantId =
                        newParticipant.id;
                }

                if (
                    participantId
                ) {
                    taskParticipantRows.push(
                        {
                            task_id:
                                task.id,

                            participant_id:
                                participantId,

                            created_at:
                                new Date().toISOString(),
                        }
                    );
                }
            }
        }

        // insert task_participants
        if (
            taskParticipantRows.length >
            0
        ) {
            const {
                error:
                taskParticipantsError,
            } = await supabase
                .from(
                    "task_participants"
                )
                .insert(
                    taskParticipantRows
                );

            if (
                taskParticipantsError
            ) {
                console.error(
                    "Task Participants Insert Error:",
                    taskParticipantsError
                );

                return res.status(500).json({
                    error:
                        taskParticipantsError,
                });
            }
        }

        // enriched task
        const {
            data: enrichedTask,
        } = await supabase
            .from("tasks")
            .select(`
        *,
        creator:users (
          id,
          display_name,
          picture_url
        ),
        task_participants (
          id,
          participant:participants (
            id,
            name
          )
        )
      `)
            .eq("id", task.id)
            .single();

        return res.json(
            enrichedTask
        );
    } catch (err) {
        console.error(err);

        return res.status(500).json({
            message: "server error",
        });
    }
});
router.get("/types", async (req, res) => {
    const { data, error } = await supabase
        .from("types")
        .select("id,name")
        .not("name", "is", null)
        .neq("name", "")
        .order("name", { ascending: true });

    if (error) return res.status(500).json(error);

    res.json(data || []);
});

router.post(
    "/import",
    upload.single("file"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "No file uploaded",
                });
            }

            const userId =
                req.body.user_id || null;

            // อ่าน excel
            const workbook = XLSX.read(
                req.file.buffer,
                {
                    type: "buffer",
                }
            );

            const sheetName =
                workbook.SheetNames[0];

            const sheet =
                workbook.Sheets[sheetName];

            // array
            const rows =
                XLSX.utils.sheet_to_json(
                    sheet,
                    {
                        header: 1,
                        defval: "",
                    }
                );

            console.log(
                "Excel Rows",
                rows
            );

            // ข้าม header
            const dataRows =
                rows.slice(1);

            const thaiMonths = {
                มกราคม: 1,
                กุมภาพันธ์: 2,
                มีนาคม: 3,
                เมษายน: 4,
                พฤษภาคม: 5,
                มิถุนายน: 6,
                กรกฎาคม: 7,
                สิงหาคม: 8,
                กันยายน: 9,
                ตุลาคม: 10,
                พฤศจิกายน: 11,
                ธันวาคม: 12,
            };

            const insertedTasks =
                [];

            for (const row of dataRows) {
                // กันแถวว่าง
                const isEmpty =
                    !row ||
                    row.every(
                        (cell) =>
                            String(cell).trim() ===
                            ""
                    );

                if (isEmpty) {
                    continue;
                }

                const rawDate = String(
                    row[0]
                ).trim();

                // ข้าม row สำรอง
                if (
                    !rawDate ||
                    rawDate === "สำรอง"
                ) {
                    continue;
                }

                /*
                  1 มิถุนายน 2569
                */

                const parts =
                    rawDate.split(" ");

                if (parts.length < 3) {
                    continue;
                }

                const day = Number(
                    parts[0]
                );

                const month =
                    thaiMonths[
                    parts[1]
                    ];

                const year =
                    Number(parts[2]) - 543;

                if (
                    !day ||
                    !month ||
                    !year
                ) {
                    continue;
                }

                // participant name
                const participantName =
                    String(row[2]).trim();

                let participantId =
                    null;

                // ถ้ามีชื่อ
                if (participantName) {
                    // หา participant ก่อน
                    const {
                        data:
                        existingParticipant,
                    } = await supabase
                        .from(
                            "participants"
                        )
                        .select("id")
                        .eq(
                            "name",
                            participantName
                        )
                        .single();

                    // ถ้ามีอยู่แล้ว
                    if (
                        existingParticipant
                    ) {
                        participantId =
                            existingParticipant.id;
                    } else {
                        // สร้างใหม่
                        const {
                            data:
                            newParticipant,
                            error:
                            participantError,
                        } = await supabase
                            .from(
                                "participants"
                            )
                            .insert({
                                name:
                                    participantName,
                            })
                            .select("id")
                            .single();

                        if (
                            participantError
                        ) {
                            console.error(
                                "Participant Insert Error:",
                                participantError
                            );

                            continue;
                        }

                        participantId =
                            newParticipant.id;
                    }
                }

                // เวลาเริ่ม 08:00
                const startDate =
                    dayjs(
                        new Date(
                            year,
                            month - 1,
                            day,
                            8,
                            0,
                            0
                        )
                    );

                // +1 วัน
                const endDate =
                    startDate.add(
                        1,
                        "day"
                    );

                // create task
                const {
                    data: task,
                    error: taskError,
                } = await supabase
                    .from("tasks")
                    .insert([
                        {
                            title: "เข้าเวร",

                            start_time:
                                startDate.toISOString(),

                            end_time:
                                endDate.toISOString(),

                            location: null,

                            type_id: 3,

                            creator_id:
                                userId,

                            created_at:
                                new Date().toISOString(),

                            updated_at:
                                new Date().toISOString(),
                        },
                    ])
                    .select()
                    .single();

                if (taskError) {
                    console.error(
                        "Task Insert Error:",
                        taskError
                    );

                    continue;
                }

                // create task participant
                if (participantId) {
                    const {
                        error:
                        taskParticipantError,
                    } = await supabase
                        .from(
                            "task_participants"
                        )
                        .insert({
                            task_id: task.id,

                            participant_id:
                                participantId,

                            created_at:
                                new Date().toISOString(),
                        });

                    if (
                        taskParticipantError
                    ) {
                        console.error(
                            "Task Participant Insert Error:",
                            taskParticipantError
                        );
                    }
                }

                insertedTasks.push(
                    task
                );
            }

            console.log(
                "Inserted Tasks:",
                insertedTasks
            );

            if (
                !insertedTasks.length
            ) {
                return res.status(400).json({
                    error:
                        "No valid rows found",
                });
            }

            return res.json({
                success: true,

                count:
                    insertedTasks.length,

                data: insertedTasks,
            });
        } catch (err) {
            console.error(err);

            return res.status(500).json({
                error: err.message,
            });
        }
    }
);

router.get(
    "/participants",
    async (req, res) => {
        try {
            const {
                data,
                error,
            } = await supabase
                .from("participants")
                .select(`*`)
                .order("name", {
                    ascending: true,
                });

            if (error) {
                console.error(
                    "Load Participants Error:",
                    error
                );

                return res.status(500).json({
                    error:
                        error.message,
                });
            }

            return res.json(data);
        } catch (err) {
            console.error(err);

            return res.status(500).json({
                error:
                    err.message,
            });
        }
    }
);
module.exports = router;
