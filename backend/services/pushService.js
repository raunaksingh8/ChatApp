const webpush = require("web-push");
const pool = require("../config/db");

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@letuschat.app";
const isPushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

// Sensible TTL for chat notifications: 43200 seconds (12 hours) allows temporary offline periods / Doze without excessive staleness
const PUSH_TTL_SECONDS = parseInt(process.env.PUSH_TTL || "43200", 10);

if (isPushConfigured) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const maskEndpoint = (endpoint) => {
    if (!endpoint || typeof endpoint !== "string") return "unknown";
    return endpoint.length > 40
        ? `${endpoint.slice(0, 30)}...${endpoint.slice(-8)}`
        : endpoint;
};

const sendUnreadBadgePush = async (userId, unreadCount = null, showNotification = false, notificationOptions = {}) => {
    if (!isPushConfigured) return;

    const dispatchStart = Date.now();
    const correlationId = notificationOptions.correlationId || notificationOptions.messageId || `push_${dispatchStart}_${Math.random().toString(36).slice(2, 8)}`;

    try {
        const subscriptions = await pool.query(
            `SELECT endpoint, p256dh, auth
             FROM chat_push_subscriptions
             WHERE user_id = $1 AND notification_enabled = TRUE`,
            [userId]
        );

        if (subscriptions.rows.length === 0) {
            return;
        }

        const payload = JSON.stringify({
            type: "unread-badge",
            unreadCount: typeof unreadCount === "number" ? unreadCount : null,
            showNotification,
            senderName: notificationOptions.senderName || "LetUsChat",
            senderId: notificationOptions.senderId || null,
            messageId: notificationOptions.messageId || null,
            correlationId,
            messageSavedAt: notificationOptions.messageSavedAt || null,
            dispatchStartAt: dispatchStart,
            body: "You have a new message.",
            url: notificationOptions.senderId ? `/chat?user=${notificationOptions.senderId}` : "/chat"
        });

        console.log(`[Push][Dispatch-Start] Correlation: ${correlationId} | Recipient: ${userId} | Subscriptions: ${subscriptions.rows.length} | MessageSavedAt: ${notificationOptions.messageSavedAt || "N/A"} | DispatchStart: ${new Date(dispatchStart).toISOString()}`);

        await Promise.allSettled(subscriptions.rows.map(async (subscription) => {
            const subStart = Date.now();
            const masked = maskEndpoint(subscription.endpoint);

            try {
                const pushOptions = {
                    TTL: PUSH_TTL_SECONDS,
                    urgency: "high"
                };

                // By default, omit topic to strictly preserve all individual notifications across different senders/conversations.
                // A static topic would cause FCM to overwrite pending messages from different contacts.
                // If conversation-specific collapsing is explicitly desired, use a valid 32-char RFC 8030 topic.
                if (notificationOptions.collapsePerConversation && notificationOptions.senderId) {
                    pushOptions.topic = `msg_${String(notificationOptions.senderId).replace(/-/g, "").slice(0, 28)}`;
                }

                const result = await webpush.sendNotification({
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
                }, payload, pushOptions);

                const statusCode = result?.statusCode || 201;
                const durationMs = Date.now() - subStart;
                console.log(`[Push][Dispatch-Success] Correlation: ${correlationId} | Endpoint: ${masked} | Status: ${statusCode} | Duration: ${durationMs}ms | Timestamp: ${new Date().toISOString()}`);

                await pool.query(
                    "UPDATE chat_push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1",
                    [subscription.endpoint]
                );
            } catch (error) {
                const statusCode = error.statusCode || "ERR";
                const durationMs = Date.now() - subStart;
                console.error(`[Push][Dispatch-Failure] Correlation: ${correlationId} | Endpoint: ${masked} | Status: ${statusCode} | Error: ${error.message} | Duration: ${durationMs}ms | Timestamp: ${new Date().toISOString()}`);

                if (error.statusCode === 404 || error.statusCode === 410) {
                    try {
                        await pool.query("DELETE FROM chat_push_subscriptions WHERE endpoint = $1", [subscription.endpoint]);
                        console.log(`[Push][Stale-Removed] Correlation: ${correlationId} | Deleted inactive endpoint ${masked} (FCM ${error.statusCode})`);
                    } catch (delErr) {
                        console.error(`[Push][Cleanup-Error] Failed to remove stale endpoint ${masked}:`, delErr.message);
                    }
                }
            }
        }));
    } catch (topLevelError) {
        console.error(`[Push][Top-Level-Error] Correlation: ${correlationId} | Recipient: ${userId} | Error:`, topLevelError.message);
    }
};

module.exports = { vapidPublicKey, isPushConfigured, sendUnreadBadgePush };
