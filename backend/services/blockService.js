const pool = require("../config/db");

/**
 * Check whether either user has blocked the other.
 * Returns true if userA has blocked userB OR userB has blocked userA.
 */
const isBlocked = async (userId1, userId2) => {
    if (!userId1 || !userId2) return false;
    const result = await pool.query(
        `SELECT id, blocker_id, blocked_id FROM chat_user_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
         LIMIT 1`,
        [userId1, userId2]
    );
    return result.rows.length > 0;
};

/**
 * Check specifically if blockerId has blocked targetId.
 */
const hasBlocked = async (blockerId, targetId) => {
    if (!blockerId || !targetId) return false;
    const result = await pool.query(
        `SELECT id FROM chat_user_blocks
         WHERE blocker_id = $1 AND blocked_id = $2
         LIMIT 1`,
        [blockerId, targetId]
    );
    return result.rows.length > 0;
};

module.exports = {
    isBlocked,
    hasBlocked
};

