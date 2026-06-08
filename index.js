require("dotenv").config();

const express = require("express");
const cors = require("cors");
const supabase = require("./supabase");

const app = express();

app.use(cors());
app.use(express.json());

// routes
const taskRoutes = require("./routes/tasks");
app.use("/tasks", taskRoutes);
const userRoutes = require("./routes/users");
app.use("/users", userRoutes);
const calendarRoutes = require("./routes/calendar");
app.use("/calendar", calendarRoutes);

app.get("/", (req, res) => {
    res.send("LINE Scheduler API running");
});

app.get("/test-db", async (req, res) => {

    const { data, error } = await supabase
        .from("tasks")
        .select("*");

    res.json({ data, error });
});

app.listen(process.env.PORT, () => {
    console.log("Server running on port " + process.env.PORT);
});