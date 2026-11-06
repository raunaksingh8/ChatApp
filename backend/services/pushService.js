const webpush = require("web-push");
const pool = require("../config/db");

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;
const isPushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (isPushConfigured) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const sendUnreadBadgePush = async (userId, unreadCount, showNotification = false) => {
    if (!isPushConfigured) return;

    const subscriptions = await pool.query(
        `SELECT endpoint, p256dh, auth
         FROM chat_push_subscriptions
         WHERE user_id = $1`,
        [userId]
    );

    const payload = JSON.stringify({ type: "unread-badge", unreadCount, showNotification });

    await Promise.all(subscriptions.rows.map(async (subscription) => {
        try {
            await webpush.sendNotification({
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            }, payload, { TTL: 60 });

            await pool.query(
                "UPDATE chat_push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1",
                [subscription.endpoint]
            );
        } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
                await pool.query("DELETE FROM chat_push_subscriptions WHERE endpoint = $1", [subscription.endpoint]);
                return;
            }

            console.warn("Web Push badge delivery failed:", error.message);
        }
    }));
};

module.exports = { vapidPublicKey, isPushConfigured, sendUnreadBadgePush };
