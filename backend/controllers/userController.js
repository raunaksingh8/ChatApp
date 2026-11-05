const pool = require("../config/db");

// Retrieve all registered users except the currently authenticated user
const getUsers = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const search = req.query.search ? req.query.search.trim() : "";

        let query = `
            SELECT id, username, display_name, avatar_url, about, is_online, last_seen, created_at
            FROM chat_users
            WHERE id != $1
            AND NOT EXISTS (
                SELECT 1 FROM chat_user_blocks b
                WHERE (b.blocker_id = $1 AND b.blocked_id = chat_users.id)
                   OR (b.blocker_id = chat_users.id AND b.blocked_id = $1)
            )
        `;
        const params = [currentUserId];

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (username ILIKE $${params.length} OR display_name ILIKE $${params.length})`;
        }

        query += ` ORDER BY is_online DESC, COALESCE(display_name, username) ASC`;

        const result = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error("Get users error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve users."
        });
    }
};

/**
 * GET /api/users/search?username=raunak
 * Search for a user by username with relationship status.
 * Does NOT return all users — requires a non-empty username query.
 */
const searchUsers = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const username = (req.query.username || "").trim();

        if (!username || username.length < 1) {
            return res.status(400).json({
                success: false,
                message: "A username search query is required."
            });
        }

        // Find users matching the search query, excluding self and blocked users
        const usersResult = await pool.query(
            `SELECT id, username, display_name, avatar_url, about, is_online, last_seen
             FROM chat_users
             WHERE id != $1
               AND (username ILIKE $2 OR display_name ILIKE $2)
               AND NOT EXISTS (
                   SELECT 1 FROM chat_user_blocks b
                   WHERE (b.blocker_id = $1 AND b.blocked_id = chat_users.id)
                      OR (b.blocker_id = chat_users.id AND b.blocked_id = $1)
               )
             ORDER BY COALESCE(display_name, username) ASC
             LIMIT 20`,
            [currentUserId, `%${username}%`]
        );

        if (usersResult.rows.length === 0) {
            return res.status(200).json({ success: true, users: [] });
        }

        // For each found user, determine relationship status
        const userIds = usersResult.rows.map(u => u.id);

        // Query all contact requests involving the current user and any of these users
        const requestsResult = await pool.query(
            `SELECT id, requester_id, recipient_id, status
             FROM chat_contact_requests
             WHERE status IN ('pending', 'accepted')
             AND (
                 (requester_id = $1 AND recipient_id = ANY($2))
                 OR (recipient_id = $1 AND requester_id = ANY($2))
             )`,
            [currentUserId, userIds]
        );

        // Build a map of userId -> relationship and request_id
        const relationshipMap = {};
        for (const cr of requestsResult.rows) {
            const otherUserId = cr.requester_id === currentUserId ? cr.recipient_id : cr.requester_id;

            if (cr.status === "accepted") {
                relationshipMap[otherUserId] = { relationship: "accepted", requestId: cr.id };
            } else if (cr.status === "pending") {
                if (cr.requester_id === currentUserId) {
                    // Current user sent the request
                    if (!relationshipMap[otherUserId] || relationshipMap[otherUserId].relationship !== "accepted") {
                        relationshipMap[otherUserId] = { relationship: "request_sent", requestId: cr.id };
                    }
                } else {
                    // Other user sent the request to current user
                    if (!relationshipMap[otherUserId] || relationshipMap[otherUserId].relationship !== "accepted") {
                        relationshipMap[otherUserId] = { relationship: "request_received", requestId: cr.id };
                    }
                }
            }
        }

        const usersWithStatus = usersResult.rows.map(u => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            about: u.about,
            is_online: u.is_online,
            last_seen: u.last_seen,
            relationship: relationshipMap[u.id]?.relationship || "none",
            request_id: relationshipMap[u.id]?.requestId || null
        }));

        return res.status(200).json({ success: true, users: usersWithStatus });
    } catch (error) {
        console.error("Search users error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to search users." });
    }
};

module.exports = { getUsers, searchUsers };
