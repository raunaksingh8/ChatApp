const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// Short in-memory cache for user verification to eliminate duplicate DB roundtrips during burst requests
const userCache = new Map();
const USER_CACHE_TTL_MS = 60 * 1000; // 60 seconds

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication token missing or invalid format."
            });
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Access token is required."
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({
                    success: false,
                    message: "Authentication token has expired. Please log in again."
                });
            }
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token."
            });
        }

        const userId = decoded.userId || decoded.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid token payload."
            });
        }

        // Check in-memory user cache first to avoid redundant queries during parallel requests
        const now = Date.now();
        const cached = userCache.get(userId);
        if (cached && cached.expiresAt > now) {
            req.user = cached.user;
            return next();
        }

        // Verify that the user still exists in the database
        const userQuery = await pool.query(
            "SELECT id, username FROM chat_users WHERE id = $1",
            [userId]
        );

        if (userQuery.rows.length === 0) {
            userCache.delete(userId);
            return res.status(401).json({
                success: false,
                message: "User no longer exists."
            });
        }

        const authenticatedUser = {
            id: userQuery.rows[0].id,
            username: userQuery.rows[0].username
        };

        userCache.set(userId, {
            user: authenticatedUser,
            expiresAt: now + USER_CACHE_TTL_MS
        });

        req.user = authenticatedUser;
        next();
    } catch (error) {
        console.error("Auth middleware error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error during authentication."
        });
    }
};

module.exports = authenticateToken;

