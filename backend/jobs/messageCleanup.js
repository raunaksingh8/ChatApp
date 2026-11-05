const pool = require("../config/db");
const { getIO } = require("../sockets/socketHandler");

let cleanupInterval = null;

const runMessageCleanup = async () => {
    try {
        // Only delete delivered/read messages whose expires_at is in the past
        // Pending messages have expires_at = NULL, so they will NEVER be deleted here!
        const deleteResult = await pool.query(
            `DELETE FROM chat_messages
             WHERE expires_at IS NOT NULL AND expires_at <= NOW()
             RETURNING id, sender_id, receiver_id`
        );

        if (deleteResult.rows.length > 0) {
            try {
                const io = getIO();
                for (const msg of deleteResult.rows) {
                    const payload = { messageId: msg.id };
                    io.to(`user_${msg.sender_id}`).emit("message_expired", payload);
                    io.to(`user_${msg.receiver_id}`).emit("message_expired", payload);
                }
            } catch (ioErr) {
                // If Socket.IO is not initialized yet or error emitting
                console.warn("Cleanup broadcast notice:", ioErr.message);
            }
        }
    } catch (error) {
        console.error("Message cleanup job error:", error.message);
    }
};

const startMessageCleanupJob = (intervalSeconds = 10) => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }

    // Run once immediately
    runMessageCleanup();

    // Schedule periodic execution every intervalSeconds (default 10s)
    cleanupInterval = setInterval(runMessageCleanup, intervalSeconds * 1000);
    console.log(`[Job] Ephemeral message cleanup running every ${intervalSeconds} seconds`);

    return cleanupInterval;
};

const stopMessageCleanupJob = () => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
};

module.exports = {
    startMessageCleanupJob,
    stopMessageCleanupJob,
    runMessageCleanup
};

