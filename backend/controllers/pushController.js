const pool = require("../config/db");
const { vapidPublicKey, isPushConfigured } = require("../services/pushService");

const getPublicKey = async (req, res) => {
    try {
        const endpoint = req.query?.endpoint;
        let notificationEnabled = false;

        if (endpoint && typeof endpoint === "string" && req.user?.id) {
            const sub = await pool.query(
                "SELECT notification_enabled FROM chat_push_subscriptions WHERE user_id = $1 AND endpoint = $2",
                [req.user.id, endpoint]
            );
            if (sub.rows.length > 0) {
                notificationEnabled = Boolean(sub.rows[0].notification_enabled);
            }
        }

        return res.status(200).json({
            success: true,
            supported: isPushConfigured,
            publicKey: isPushConfigured ? vapidPublicKey : null,
            notification_enabled: notificationEnabled
        });
    } catch (err) {
        return res.status(200).json({
            success: true,
            supported: isPushConfigured,
            publicKey: isPushConfigured ? vapidPublicKey : null,
            notification_enabled: false
        });
    }
};

const subscribe = async (req, res) => {
    const { endpoint, keys, notification_enabled, is_sync } = req.body || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;

    if (!isPushConfigured) {
        return res.status(503).json({ success: false, message: "Push notifications are not configured." });
    }

    if (typeof endpoint !== "string" || endpoint.length > 4096) {
        return res.status(400).json({ success: false, message: "A valid subscription endpoint is required." });
    }

    try {
        let updatedNotificationEnabled = false;

        if (notification_enabled === false) {
            // Explicitly disabling notifications for this device: preserve subscription record, set flag to false
            const updateRes = await pool.query(
                `UPDATE chat_push_subscriptions
                 SET notification_enabled = FALSE, updated_at = NOW()
                 WHERE user_id = $1 AND endpoint = $2
                 RETURNING id, notification_enabled`,
                [req.user.id, endpoint]
            );

            if (updateRes.rows.length === 0 && typeof p256dh === "string" && typeof auth === "string") {
                await pool.query(
                    `INSERT INTO chat_push_subscriptions (user_id, endpoint, p256dh, auth, notification_enabled, created_at, updated_at, last_used_at)
                     VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW(), NOW())
                     ON CONFLICT (endpoint) DO UPDATE
                     SET user_id = EXCLUDED.user_id, notification_enabled = FALSE, updated_at = NOW()`,
                    [req.user.id, endpoint, p256dh, auth]
                );
            }
            updatedNotificationEnabled = false;
        } else if (notification_enabled === true) {
            // Explicitly enabling notifications for this device: set flag to true
            if (typeof p256dh === "string" && typeof auth === "string") {
                await pool.query(
                    `INSERT INTO chat_push_subscriptions (user_id, endpoint, p256dh, auth, notification_enabled, created_at, updated_at, last_used_at)
                     VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW(), NOW())
                     ON CONFLICT (endpoint) DO UPDATE
                     SET user_id = EXCLUDED.user_id,
                         p256dh = EXCLUDED.p256dh,
                         auth = EXCLUDED.auth,
                         notification_enabled = TRUE,
                         updated_at = NOW(),
                         last_used_at = NOW()`,
                    [req.user.id, endpoint, p256dh, auth]
                );
                updatedNotificationEnabled = true;
            } else {
                const result = await pool.query(
                    `UPDATE chat_push_subscriptions
                     SET notification_enabled = TRUE, updated_at = NOW(), last_used_at = NOW()
                     WHERE user_id = $1 AND endpoint = $2
                     RETURNING id, notification_enabled`,
                    [req.user.id, endpoint]
                );
                if (result.rows.length === 0) {
                    return res.status(400).json({ success: false, message: "Valid subscription keys are required to enable push." });
                }
                updatedNotificationEnabled = true;
            }
        } else {
            // Background sync: insert with default FALSE if brand new, or preserve existing notification_enabled if already present
            if (typeof p256dh !== "string" || typeof auth !== "string") {
                return res.status(400).json({ success: false, message: "Valid subscription keys are required." });
            }

            const result = await pool.query(
                `INSERT INTO chat_push_subscriptions (user_id, endpoint, p256dh, auth, notification_enabled, created_at, updated_at, last_used_at)
                 VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW(), NOW())
                 ON CONFLICT (endpoint) DO UPDATE
                 SET user_id = EXCLUDED.user_id,
                     p256dh = EXCLUDED.p256dh,
                     auth = EXCLUDED.auth,
                     updated_at = NOW(),
                     last_used_at = NOW()
                 RETURNING id, notification_enabled`,
                [req.user.id, endpoint, p256dh, auth]
            );
            updatedNotificationEnabled = Boolean(result.rows[0]?.notification_enabled);
        }

        return res.status(200).json({
            success: true,
            notification_enabled: updatedNotificationEnabled
        });
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
            "UPDATE chat_push_subscriptions SET notification_enabled = FALSE, updated_at = NOW() WHERE user_id = $1 AND endpoint = $2",
            [req.user.id, endpoint]
        );
        return res.status(200).json({ success: true, notification_enabled: false });
    } catch (error) {
        console.error("Push unsubscribe error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update push subscription." });
    }
};

module.exports = { getPublicKey, subscribe, unsubscribe };
