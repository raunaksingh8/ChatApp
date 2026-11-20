const pool = require("../config/db");
const { getIO, isUserOnline, isUserViewingConversation, shouldSendPush } = require("../sockets/socketHandler");
const { areContacts } = require("../services/contactService");
const { isBlocked } = require("../services/blockService");
const { getUnreadCount: getUnreadMessageCount } = require("../services/unreadService");
const { sendUnreadBadgePush } = require("../services/pushService");

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const emitUnreadCount = async (userId) => {
    const count = await getUnreadMessageCount(userId);
    try {
        getIO().to(`user_${userId}`).emit("unread_count_updated", { count });
    } catch (socketErr) {
        console.warn("Unread count broadcast warning:", socketErr.message);
    }
    return count;
};

// Send message via REST API
const sendMessage = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiver_id, message_text, reply_to_message_id } = req.body;

        if (!receiver_id || !UUID_REGEX.test(receiver_id)) {
            return res.status(400).json({
                success: false,
                message: "A valid receiver UUID is required."
            });
        }

        if (receiver_id === senderId) {
            return res.status(400).json({
                success: false,
                message: "Cannot send a message to yourself."
            });
        }

        const trimmedText = (message_text || "").trim();
        if (!trimmedText || trimmedText.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "Message text must be between 1 and 5000 characters."
            });
        }

        // Verify recipient exists
        const recipientCheck = await pool.query(
            "SELECT id, username, display_name FROM chat_users WHERE id = $1",
            [receiver_id]
        );

        if (recipientCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Recipient user not found."
            });
        }

        // --- BLOCK RESTRICTION CHECK (Feature 2) ---
        const blocked = await isBlocked(senderId, receiver_id);
        if (blocked) {
            return res.status(403).json({
                success: false,
                message: "Messaging is blocked between you and this user."
            });
        }

        // --- CONTACT AUTHORIZATION CHECK ---
        const contactStatus = await areContacts(senderId, receiver_id);
        if (!contactStatus) {
            return res.status(403).json({
                success: false,
                message: "You can only send messages to accepted contacts."
            });
        }

        // --- REPLY VALIDATION (Feature 6) ---
        let validatedReplyId = null;
        let replyMeta = null;

        if (reply_to_message_id) {
            if (!UUID_REGEX.test(reply_to_message_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid reply_to_message_id format."
                });
            }

            const replyQuery = await pool.query(
                `SELECT m.id, m.sender_id, m.receiver_id, m.message_text, m.expires_at,
                        u.username AS sender_username, u.display_name AS sender_display_name
                 FROM chat_messages m
                 JOIN chat_users u ON u.id = m.sender_id
                 WHERE m.id = $1`,
                [reply_to_message_id]
            );

            if (replyQuery.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "The message you are replying to does not exist."
                });
            }

            const original = replyQuery.rows[0];

            // Verify belongs to same conversation
            const isSameConv =
                (original.sender_id === senderId && original.receiver_id === receiver_id) ||
                (original.sender_id === receiver_id && original.receiver_id === senderId);

            if (!isSameConv) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot reply to a message from an unrelated conversation."
                });
            }

            // Verify not expired
            if (original.expires_at && new Date(original.expires_at).getTime() <= Date.now()) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot reply to an expired message."
                });
            }

            validatedReplyId = original.id;
            replyMeta = {
                id: original.id,
                sender_id: original.sender_id,
                sender_username: original.sender_username,
                sender_display_name: original.sender_display_name,
                message_text: original.message_text,
                reply_expired: false
            };
        }

        const receiverOnline = isUserOnline(receiver_id);

        let savedMessage;
        if (receiverOnline) {
            // Receiver is online -> mark delivered, but DO NOT start 5-minute countdown yet.
            // Expiry countdown starts only when recipient views the message for 500ms in viewport.
            const result = await pool.query(
                `INSERT INTO chat_messages (sender_id, receiver_id, message_text, status, delivered_at, opened_at, expiry_started_at, expires_at, reply_to_message_id)
                 VALUES ($1, $2, $3, 'delivered', NOW(), NULL, NULL, NULL, $4)
                 RETURNING id, sender_id, receiver_id, message_text, status, created_at, delivered_at, opened_at, expiry_started_at, expires_at, reply_to_message_id`,
                [senderId, receiver_id, trimmedText, validatedReplyId]
            );
            savedMessage = {
                ...result.rows[0],
                reactions: [],
                reply_message_text: replyMeta ? replyMeta.message_text : null,
                reply_sender_username: replyMeta ? replyMeta.sender_username : null,
                reply_sender_display_name: replyMeta ? replyMeta.sender_display_name : null,
                reply_expired: false
            };

            try {
                const io = getIO();
                io.to(`user_${receiver_id}`).emit("new_message", savedMessage);
                io.to(`user_${senderId}`).emit("new_message", savedMessage);
                io.to(`user_${senderId}`).emit("message_delivered", {
                    id: savedMessage.id,
                    status: savedMessage.status,
                    delivered_at: savedMessage.delivered_at,
                    expires_at: null,
                    expiry_started_at: null
                });
            } catch (socketErr) {
                console.warn("Socket broadcast warning:", socketErr.message);
            }
        } else {
            // Receiver is offline -> save as pending, expiry countdown does NOT start
            const result = await pool.query(
                `INSERT INTO chat_messages (sender_id, receiver_id, message_text, status, delivered_at, opened_at, expiry_started_at, expires_at, reply_to_message_id)
                 VALUES ($1, $2, $3, 'pending', NULL, NULL, NULL, NULL, $4)
                 RETURNING id, sender_id, receiver_id, message_text, status, created_at, delivered_at, opened_at, expiry_started_at, expires_at, reply_to_message_id`,
                [senderId, receiver_id, trimmedText, validatedReplyId]
            );
            savedMessage = {
                ...result.rows[0],
                reactions: [],
                reply_message_text: replyMeta ? replyMeta.message_text : null,
                reply_sender_username: replyMeta ? replyMeta.sender_username : null,
                reply_sender_display_name: replyMeta ? replyMeta.sender_display_name : null,
                reply_expired: false
            };

            try {
                const io = getIO();
                io.to(`user_${senderId}`).emit("new_message", savedMessage);
            } catch (socketErr) {
                console.warn("Socket broadcast warning:", socketErr.message);
            }
        }

        const unreadCount = await emitUnreadCount(receiver_id);
        if (shouldSendPush(receiver_id)) {
            const senderName = req.user.display_name || req.user.username || "LetUsChat";
            sendUnreadBadgePush(receiver_id, unreadCount, true, {
                senderName,
                senderId
            }).catch((pushError) => {
                console.warn("Unread push warning:", pushError.message);
            });
        }

        return res.status(201).json({
            success: true,
            message: savedMessage
        });
    } catch (error) {
        console.error("Send message error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to send message."
        });
    }
};

// Retrieve conversation between authenticated user and specified user
const getConversation = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const targetUserId = req.params.userId;

        if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
            return res.status(400).json({
                success: false,
                message: "A valid user ID is required."
            });
        }

        if (targetUserId === currentUserId) {
            return res.status(400).json({
                success: false,
                message: "Cannot fetch conversation with yourself."
            });
        }

        // Verify target user exists
        const targetCheck = await pool.query(
            "SELECT id, username FROM chat_users WHERE id = $1",
            [targetUserId]
        );

        if (targetCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Target user not found."
            });
        }

        // --- BLOCK RESTRICTION CHECK (Feature 2) ---
        const blocked = await isBlocked(currentUserId, targetUserId);
        if (blocked) {
            return res.status(403).json({
                success: false,
                message: "Conversation is unavailable because of a block."
            });
        }

        // --- CONTACT AUTHORIZATION CHECK ---
        const contactStatus = await areContacts(currentUserId, targetUserId);
        if (!contactStatus) {
            return res.status(403).json({
                success: false,
                message: "You can only view conversations with accepted contacts."
            });
        }

        // Mark pending messages sent to recipient as delivered (not read, no expiry started yet)
        const deliverPendingResult = await pool.query(
            `UPDATE chat_messages
             SET status = 'delivered',
                 delivered_at = COALESCE(delivered_at, NOW())
             WHERE receiver_id = $1 AND sender_id = $2 AND status = 'pending'
             RETURNING id, delivered_at`,
            [currentUserId, targetUserId]
        );

        if (deliverPendingResult.rows.length > 0) {
            try {
                const io = getIO();
                for (const row of deliverPendingResult.rows) {
                    io.to(`user_${targetUserId}`).emit("message_delivered", {
                        id: row.id,
                        status: "delivered",
                        delivered_at: row.delivered_at,
                        expires_at: null,
                        expiry_started_at: null
                    });
                }
            } catch (socketErr) {
                console.warn("Socket broadcast warning (delivered on get):", socketErr.message);
            }
        }

        // Query conversation excluding expired messages + fetch quoted reply information + aggregated reactions
        const messagesQuery = await pool.query(
            `SELECT m.id, m.sender_id, m.receiver_id, m.message_text, m.status, m.created_at, m.delivered_at, m.opened_at, m.expiry_started_at, m.expires_at,
                    m.reply_to_message_id,
                    CASE
                        WHEN m.reply_to_message_id IS NULL THEN NULL
                        WHEN rm.id IS NULL OR (rm.expires_at IS NOT NULL AND rm.expires_at <= NOW()) THEN 'Original message expired'
                        ELSE rm.message_text
                    END AS reply_message_text,
                    rmu.username AS reply_sender_username,
                    rmu.display_name AS reply_sender_display_name,
                    CASE
                        WHEN m.reply_to_message_id IS NOT NULL AND (rm.id IS NULL OR (rm.expires_at IS NOT NULL AND rm.expires_at <= NOW())) THEN true
                        ELSE false
                    END AS reply_expired,
                    COALESCE(
                        (
                            SELECT json_agg(json_build_object(
                                'emoji', r.emoji,
                                'count', r.count,
                                'users', r.users
                            ))
                            FROM (
                                SELECT mr.emoji,
                                       COUNT(*)::int AS count,
                                       json_agg(json_build_object(
                                           'id', u.id,
                                           'username', u.username,
                                           'display_name', u.display_name
                                       )) AS users
                                FROM chat_message_reactions mr
                                JOIN chat_users u ON u.id = mr.user_id
                                WHERE mr.message_id = m.id
                                GROUP BY mr.emoji
                            ) r
                        ),
                        '[]'::json
                    ) AS reactions
             FROM chat_messages m
             LEFT JOIN chat_messages rm ON rm.id = m.reply_to_message_id
             LEFT JOIN chat_users rmu ON rmu.id = rm.sender_id
             WHERE (
                 (m.sender_id = $1 AND m.receiver_id = $2)
                 OR
                 (m.sender_id = $2 AND m.receiver_id = $1)
             )
             AND (
                 m.expiry_started_at IS NULL
                 OR m.expires_at IS NULL
                 OR m.expires_at > NOW()
             )
             ORDER BY m.created_at ASC`,
            [currentUserId, targetUserId]
        );

        return res.status(200).json({
            success: true,
            messages: messagesQuery.rows
        });
    } catch (error) {
        console.error("Get conversation error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to retrieve conversation."
        });
    }
};

// Explicit endpoint to mark conversation messages as read
const markConversationAsRead = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const senderId = req.params.userId;

        if (!senderId || !UUID_REGEX.test(senderId)) {
            return res.status(400).json({ success: false, message: "A valid sender user ID is required." });
        }

        const markResult = await pool.query(
            `UPDATE chat_messages
             SET status = 'read'
             WHERE receiver_id = $1 AND sender_id = $2 AND status = 'delivered'
             RETURNING id`,
            [currentUserId, senderId]
        );

        if (markResult.rows.length > 0) {
            try {
                const io = getIO();
                const readIds = markResult.rows.map(r => r.id);
                io.to(`user_${senderId}`).emit("message_read", {
                    readerId: currentUserId,
                    messageIds: readIds
                });
            } catch (socketErr) {
                console.warn("Socket broadcast warning (explicit read):", socketErr.message);
            }
        }

        await emitUnreadCount(currentUserId);

        return res.status(200).json({
            success: true,
            readCount: markResult.rows.length
        });
    } catch (error) {
        console.error("Mark read error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update read status." });
    }
};

// Toggle emoji reaction on a message (Feature 2)
const toggleReaction = async (req, res) => {
    try {
        const userId = req.user.id;
        const messageId = req.params.messageId;
        const { emoji } = req.body;

        if (!messageId || !UUID_REGEX.test(messageId)) {
            return res.status(400).json({ success: false, message: "Valid message ID is required." });
        }

        const trimmedEmoji = (emoji || "").trim();
        if (!trimmedEmoji || trimmedEmoji.length > 32) {
            return res.status(400).json({ success: false, message: "A valid emoji is required." });
        }

        // Verify message exists and is not expired
        const msgQuery = await pool.query(
            `SELECT id, sender_id, receiver_id, expires_at
             FROM chat_messages
             WHERE id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
            [messageId]
        );

        if (msgQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Message not found or has expired." });
        }

        const msg = msgQuery.rows[0];
        if (msg.sender_id !== userId && msg.receiver_id !== userId) {
            return res.status(403).json({ success: false, message: "Not authorized to react to this message." });
        }

        // Check block
        const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
        const blocked = await isBlocked(userId, partnerId);
        if (blocked) {
            return res.status(403).json({ success: false, message: "Messaging is blocked between you and this user." });
        }

        // Check existing reaction by user
        const existing = await pool.query(
            "SELECT id, emoji FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2",
            [messageId, userId]
        );

        if (existing.rows.length > 0) {
            if (existing.rows[0].emoji === trimmedEmoji) {
                // Remove reaction (toggle off)
                await pool.query(
                    "DELETE FROM chat_message_reactions WHERE id = $1",
                    [existing.rows[0].id]
                );
            } else {
                // Update to new emoji
                await pool.query(
                    "UPDATE chat_message_reactions SET emoji = $1, created_at = NOW() WHERE id = $2",
                    [trimmedEmoji, existing.rows[0].id]
                );
            }
        } else {
            // Insert reaction
            await pool.query(
                "INSERT INTO chat_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)",
                [messageId, userId, trimmedEmoji]
            );
        }

        // Fetch aggregated reactions
        const reactionsResult = await pool.query(
            `SELECT mr.emoji, COUNT(*)::int AS count,
                    json_agg(json_build_object('id', u.id, 'username', u.username, 'display_name', u.display_name)) AS users
             FROM chat_message_reactions mr
             JOIN chat_users u ON u.id = mr.user_id
             WHERE mr.message_id = $1
             GROUP BY mr.emoji`,
            [messageId]
        );

        const payload = {
            messageId,
            reactions: reactionsResult.rows
        };

        try {
            const io = getIO();
            io.to(`user_${msg.sender_id}`).emit("message_reaction_updated", payload);
            io.to(`user_${msg.receiver_id}`).emit("message_reaction_updated", payload);
        } catch (socketErr) {
            console.warn("Reaction broadcast warning:", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            reactions: reactionsResult.rows
        });
    } catch (error) {
        console.error("Toggle reaction error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update reaction." });
    }
};

// Explicit endpoint to mark specific messages as viewed by recipient (starts their individual 5-minute expiry timer)
const markMessagesViewed = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { message_ids, message_id } = req.body;

        const idsToProcess = Array.isArray(message_ids)
            ? message_ids
            : message_id
            ? [message_id]
            : [];

        const validIds = idsToProcess.filter((id) => UUID_REGEX.test(id));

        if (validIds.length === 0) {
            return res.status(400).json({ success: false, message: "Valid message ID(s) required." });
        }

        // Authenticate and verify recipient: ONLY recipient can mark a message as viewed/opened
        // ONLY update rows where receiver_id = currentUserId AND expiry_started_at IS NULL (prevent restarting timer!)
        const updateResult = await pool.query(
            `UPDATE chat_messages
             SET status = 'read',
                 opened_at = COALESCE(opened_at, NOW()),
                 expiry_started_at = COALESCE(expiry_started_at, NOW()),
                 expires_at = COALESCE(expires_at, NOW() + INTERVAL '5 minutes')
             WHERE id = ANY($1::uuid[])
               AND receiver_id = $2
               AND expiry_started_at IS NULL
             RETURNING id, sender_id, receiver_id, status, opened_at, expiry_started_at, expires_at`,
            [validIds, currentUserId]
        );

        if (updateResult.rows.length > 0) {
            try {
                const io = getIO();
                const bySender = {};
                for (const row of updateResult.rows) {
                    if (!bySender[row.sender_id]) bySender[row.sender_id] = [];
                    bySender[row.sender_id].push(row);
                }

                for (const [senderId, rows] of Object.entries(bySender)) {
                    const messageIds = rows.map((r) => r.id);
                    const payload = {
                        readerId: currentUserId,
                        messageIds,
                        messages: rows,
                        expires_at: rows[0].expires_at,
                        expiry_started_at: rows[0].expiry_started_at
                    };
                    io.to(`user_${senderId}`).emit("message_read", payload);
                    io.to(`user_${currentUserId}`).emit("message_read", payload);
                }
            } catch (socketErr) {
                console.warn("Viewed broadcast warning:", socketErr.message);
            }

            await emitUnreadCount(currentUserId);
        }

        return res.status(200).json({
            success: true,
            viewedCount: updateResult.rows.length,
            messages: updateResult.rows
        });
    } catch (error) {
        console.error("Mark messages viewed error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to mark messages as viewed." });
    }
};

// Endpoint called when opening conversation: marks pending incoming messages as delivered (not read)
const openConversation = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const targetUserId = req.params.userId;

        if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
            return res.status(400).json({ success: false, message: "A valid target user ID is required." });
        }

        const deliverPending = await pool.query(
            `UPDATE chat_messages
             SET status = 'delivered',
                 delivered_at = COALESCE(delivered_at, NOW())
             WHERE receiver_id = $1 AND sender_id = $2 AND status = 'pending'
             RETURNING id, delivered_at`,
            [currentUserId, targetUserId]
        );

        if (deliverPending.rows.length > 0) {
            try {
                const io = getIO();
                for (const row of deliverPending.rows) {
                    io.to(`user_${targetUserId}`).emit("message_delivered", {
                        id: row.id,
                        status: "delivered",
                        delivered_at: row.delivered_at,
                        expires_at: null,
                        expiry_started_at: null
                    });
                }
            } catch (socketErr) {}
        }

        return res.status(200).json({
            success: true,
            deliveredCount: deliverPending.rows.length
        });
    } catch (error) {
        console.error("Open conversation error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to open conversation." });
    }
};

module.exports = {
    sendMessage,
    getConversation,
    markConversationAsRead,
    markMessagesViewed,
    toggleReaction,
    openConversation,
    getUnreadCount: async (req, res) => {
        try {
            return res.status(200).json({ success: true, count: await getUnreadMessageCount(req.user.id) });
        } catch (error) {
            console.error("Get unread count error:", error.message);
            return res.status(500).json({ success: false, message: "Unable to retrieve unread count." });
        }
    }
};
