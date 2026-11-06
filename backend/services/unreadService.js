const pool = require("../config/db");

const getUnreadCount = async (userId) => {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM chat_messages
         WHERE receiver_id = $1
           AND status IN ('pending', 'delivered')
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId]
    );

    return result.rows[0].count;
};

module.exports = { getUnreadCount };
