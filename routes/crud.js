const express = require("express");
const router = express.Router();
const supabase = require("../supabase");

// GET today tasks
router.get("/today", async (req, res) => {

    const start = new Date();
    start.setHours(0,0,0,0);

    const end = new Date();
    end.setHours(23,59,59,999);

    const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString());

    if (error) return res.status(500).json(error);

    res.json(data);
});

// CREATE task
router.post("/", async (req, res) => {

    const { title, user_id, start_time } = req.body;

    const { data, error } = await supabase
        .from("tasks")
        .insert({
            title,
            user_id,
            start_time,
            status: "pending"
        })
        .select()
        .single();

    if (error) return res.status(500).json(error);

    res.json(data);
});

module.exports = router;