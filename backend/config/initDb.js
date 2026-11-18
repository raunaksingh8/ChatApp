const pool = require("./db");

const initDatabase = async () => {
    try {
        // Ensure opened_at column exists in chat_messages table
        await pool.query(`
            ALTER TABLE chat_messages
            ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NULL;
        `);

        // Ensure chat_message_reactions table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_message_reactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
                emoji VARCHAR(32) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT unique_message_user_reaction UNIQUE (message_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON chat_message_reactions(message_id);
        `);

        console.log("[DB] Database schema verified (opened_at column and chat_message_reactions table ready)");
    } catch (error) {
        console.warn("[DB] Database initialization warning:", error.message);
    }
};

module.exports = { initDatabase };
