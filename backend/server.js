const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const http = require("http");
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const contactRoutes = require("./routes/contactRoutes");
const profileRoutes = require("./routes/profileRoutes");
const blockRoutes = require("./routes/blockRoutes");
const { initializeSocket } = require("./sockets/socketHandler");
const { startMessageCleanupJob } = require("./jobs/messageCleanup");

const app = express();

const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173"
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true
}));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "PulseChat Backend is running!"
    });
});

app.get("/test-db", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT current_database() AS database, NOW() AS server_time"
        );

        res.json({
            success: true,
            message: "Supabase connected successfully!",
            data: result.rows[0]
        });
    } catch (error) {
        console.error("Database error:", error.message);

        res.status(500).json({
            success: false,
            message: "Database connection failed."
        });
    }
});

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/blocks", blockRoutes);

// Create HTTP server & bind Socket.IO
const server = http.createServer(app);
initializeSocket(server);

// Start background cleanup for expired messages (runs every 5 minutes)

startMessageCleanupJob(300);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`PulseChat Server running on port ${PORT}`);
});
