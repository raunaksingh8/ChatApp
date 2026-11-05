
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

// Allowed frontend origins
const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173"
].filter(Boolean);

// Express CORS configuration
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
}));

// Request body limits
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Health-check endpoint
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "PulseChat Backend is running!"
    });
});

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/blocks", blockRoutes);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);

// Start expired-message cleanup every 5 minutes
startMessageCleanupJob(300);

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`PulseChat Server running on port ${PORT}`);
});
