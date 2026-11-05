const pool = require("../config/db");

/**
 * Check whether two users are accepted contacts.
 * Returns true only if an accepted contact request exists in either direction.
 */
const areContacts = async (userId1, userId2) => {
    const result = await pool.query(
        `SELECT id FROM chat_contact_requests
         WHERE status = 'accepted'
         AND (
             (requester_id = $1 AND recipient_id = $2)
             OR
             (requester_id = $2 AND recipient_id = $1)
         )
         LIMIT 1`,
        [userId1, userId2]
    );
    return result.rows.length > 0;
};

module.exports = { areContacts };



