const pool = require("../config/db");
const { vapidPublicKey, isPushConfigured } = require("../services/pushService");

const getPublicKey = (req, res) => res.status(200).json({
    success: true,
    supported: isPushConfigured,
    publicKey: isPushConfigured ? vapidPublicKey : null
});

const subscribe = async (req, res) => {
    const { endpoint, keys } = req.body || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;

    if (!isPushConfigured) {
        return res.status(503).json({ success: false, message: "Push notifications are not configured." });
    }

    if (typeof endpoint !== "string" || endpoint.length > 4096 || typeof p256dh !== "string" || typeof auth !== "string") {
        return res.status(400).json({ success: false, message: "A valid push subscription is required." });
    }

    try {
        await pool.query(
            `INSERT INTO chat_push_subscriptions (user_id, endpoint, p256dh, auth, created_at, updated_at, last_used_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
             ON CONFLICT (endpoint) DO UPDATE
             SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                 updated_at = NOW(), last_used_at = NOW()`,
            [req.user.id, endpoint, p256dh, auth]
        );
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Push subscription error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to save push subscription." });
    }
};

const unsubscribe = async (req, res) => {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== "string") {
        return res.status(400).json({ success: false, message: "A subscription endpoint is required." });
    }

    try {
        await pool.query(
            "DELETE FROM chat_push_subscriptions WHERE user_id = $1 AND endpoint = $2",
            [req.user.id, endpoint]
        );
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Push unsubscribe error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to remove push subscription." });
    }
};

module.exports = { getPublicKey, subscribe, unsubscribe };
