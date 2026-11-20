const pool = require("./db");

const initDatabase = async () => {
    try {
        // Ensure opened_at and expiry_started_at columns exist in chat_messages table
        await pool.query(`
            ALTER TABLE chat_messages
            ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NULL;

            ALTER TABLE chat_messages
            ADD COLUMN IF NOT EXISTS expiry_started_at TIMESTAMPTZ DEFAULT NULL;

            UPDATE chat_messages
            SET expiry_started_at = expires_at - INTERVAL '5 minutes'
            WHERE expires_at IS NOT NULL AND expiry_started_at IS NULL;

            CREATE INDEX IF NOT EXISTS idx_chat_messages_expiry_started_at
            ON chat_messages(expiry_started_at)
            WHERE expiry_started_at IS NOT NULL;
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

        // Ensure notification_enabled column exists in chat_push_subscriptions table
        await pool.query(`
            ALTER TABLE chat_push_subscriptions
            ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN NOT NULL DEFAULT FALSE;

            CREATE INDEX IF NOT EXISTS idx_chat_push_enabled
            ON chat_push_subscriptions(user_id, notification_enabled);
        `);

        console.log("[DB] Database schema verified (opened_at column, chat_message_reactions table, and notification_enabled column ready)");
    } catch (error) {
        console.warn("[DB] Database initialization warning:", error.message);
    }
};

module.exports = { initDatabase };
