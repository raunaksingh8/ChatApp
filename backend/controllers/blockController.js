const pool = require("../config/db");
const { getIO } = require("../sockets/socketHandler");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/blocks/:userId
 * Block a user. Removes any accepted contacts and pending requests in both directions.
 */
const blockUser = async (req, res) => {
    const client = await pool.connect();
    try {
        const blockerId = req.user.id;
        const targetUserId = req.params.userId;

        if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
            client.release();
            return res.status(400).json({ success: false, message: "A valid user ID is required." });
        }

        if (targetUserId === blockerId) {
            client.release();
            return res.status(400).json({ success: false, message: "You cannot block yourself." });
        }

        // Check target exists
        const targetCheck = await client.query(
            "SELECT id, username FROM chat_users WHERE id = $1",
            [targetUserId]
        );
        if (targetCheck.rows.length === 0) {
            client.release();
            return res.status(404).json({ success: false, message: "User not found." });
        }

        await client.query("BEGIN");

        // Check if already blocked
        const existingBlock = await client.query(
            "SELECT id FROM chat_user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
            [blockerId, targetUserId]
        );
        if (existingBlock.rows.length > 0) {
            await client.query("ROLLBACK");
            client.release();
            return res.status(409).json({ success: false, message: "You have already blocked this user." });
        }

        // Insert block record
        const blockResult = await client.query(
            `INSERT INTO chat_user_blocks (blocker_id, blocked_id)
             VALUES ($1, $2)
             RETURNING id, blocker_id, blocked_id, created_at`,
            [blockerId, targetUserId]
        );

        // Delete any accepted contact requests between the two users
        await client.query(
            `DELETE FROM chat_contact_requests
             WHERE (requester_id = $1 AND recipient_id = $2)
                OR (requester_id = $2 AND recipient_id = $1)`,
            [blockerId, targetUserId]
        );

        // Delete pending undelivered messages between the two users
        await client.query(
            `DELETE FROM chat_messages
             WHERE status = 'pending'
             AND (
                 (sender_id = $1 AND receiver_id = $2)
                 OR (sender_id = $2 AND receiver_id = $1)
             )`,
            [blockerId, targetUserId]
        );

        await client.query("COMMIT");
        client.release();

        // Notify via Socket.IO
        try {
            const io = getIO();
            io.to(`user_${blockerId}`).emit("user_blocked", { blockedUserId: targetUserId });
            io.to(`user_${targetUserId}`).emit("contact_removed", { removedUserId: blockerId });
        } catch (socketErr) {
            console.warn("Socket broadcast warning (block):", socketErr.message);
        }

        return res.status(201).json({
            success: true,
            message: `User ${targetCheck.rows[0].username} has been blocked.`,
            block: blockResult.rows[0]
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
        console.error("Block user error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to block user." });
    }
};

/**
 * DELETE /api/blocks/:userId
 * Unblock a user.
 */
const unblockUser = async (req, res) => {
    try {
        const blockerId = req.user.id;
        const targetUserId = req.params.userId;

        if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
            return res.status(400).json({ success: false, message: "A valid user ID is required." });
        }

        const deleteResult = await pool.query(
            `DELETE FROM chat_user_blocks
             WHERE blocker_id = $1 AND blocked_id = $2
             RETURNING id, blocker_id, blocked_id`,
            [blockerId, targetUserId]
        );

        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "This user is not blocked." });
        }

        // Notify blocker via Socket.IO
        try {
            const io = getIO();
            io.to(`user_${blockerId}`).emit("user_unblocked", { unblockedUserId: targetUserId });
        } catch (socketErr) {
            console.warn("Socket broadcast warning (unblock):", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "User unblocked successfully."
        });
    } catch (error) {
        console.error("Unblock user error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to unblock user." });
    }
};

/**
 * GET /api/blocks
 * Return list of users blocked by the authenticated user.
 */
const getBlockedUsers = async (req, res) => {
    try {
        const blockerId = req.user.id;

        const result = await pool.query(
            `SELECT b.id as block_id, b.blocked_id as id, u.username, u.display_name, u.avatar_url, b.created_at as blocked_at
             FROM chat_user_blocks b
             JOIN chat_users u ON u.id = b.blocked_id
             WHERE b.blocker_id = $1
             ORDER BY b.created_at DESC`,
            [blockerId]
        );

        return res.status(200).json({
            success: true,
            blocked_users: result.rows
        });
    } catch (error) {
        console.error("Get blocked users error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to retrieve blocked users." });
    }
};

module.exports = {
    blockUser,
    unblockUser,
    getBlockedUsers
};

