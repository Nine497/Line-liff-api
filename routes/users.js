const express = require("express");
const router = require("express").Router();
const supabase = require("../supabase");
const { verifyLineToken } = require("../services/lineAuth");

// Upsert user by LINE ID
router.post("/", async (req, res) => {
    try {
        const { id_token } = req.body;

        if (!id_token) {
            return res.status(400).json({
                error: "Missing id_token",
            });
        }

        const decoded = await verifyLineToken(id_token);

        console.log(decoded);

        const payload = {
            line_id: decoded.sub,
            display_name: decoded.name ?? null,
            picture_url: decoded.picture ?? null,
            email: decoded.email ?? null,
        };

        const { data, error } = await supabase
            .from("users")
            .upsert(payload, {
                onConflict: "line_id",
            })
            .select();

        if (error) {
            return res.status(500).json({
                error,
            });
        }

        return res.json({
            user: data?.[0] || null,
        });
    } catch (err) {
        console.error(err);

        return res.status(401).json({
            error: "Invalid LINE token",
        });
    }
});

// List all users
router.get("/", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .order("display_name", { ascending: true });

        if (error) return res.status(500).json({ error });
        return res.json(data || []);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

// Get user by LINE ID
router.get("/:id", async (req, res) => {
    try {
        const lineId = req.params.id;
        const { data, error } = await supabase
            .from("users")
            .select("*")
            .eq("line_id", lineId)
            .limit(1);

        if (error) return res.status(500).json({ error });
        return res.json((data && data[0]) || null);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
