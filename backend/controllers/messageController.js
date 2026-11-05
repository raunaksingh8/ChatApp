const pool = require("../config/db");
const { getIO, isUserOnline } = require("../sockets/socketHandler");
const { areContacts } = require("../services/contactService");
const { isBlocked } = require("../services/blockService");

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
            // Receiver is online -> mark delivered and set 5-minute expiry
            const result = await pool.query(
                `INSERT INTO chat_messages (sender_id, receiver_id, message_text, status, delivered_at, expires_at, reply_to_message_id)
                 VALUES ($1, $2, $3, 'delivered', NOW(), NOW() + INTERVAL '5 minutes', $4)
                 RETURNING id, sender_id, receiver_id, message_text, status, created_at, delivered_at, expires_at, reply_to_message_id`,
                [senderId, receiver_id, trimmedText, validatedReplyId]
            );
            savedMessage = {
                ...result.rows[0],
                reply_message_text: replyMeta ? replyMeta.message_text : null,
                reply_sender_username: replyMeta ? replyMeta.sender_username : null,
                reply_sender_display_name: replyMeta ? replyMeta.sender_display_name : null,
                reply_expired: false
            };

            try {
                const io = getIO();
                // Deliver in real-time to recipient's room
                io.to(`user_${receiver_id}`).emit("new_message", savedMessage);
                // Notify sender's other sessions/tabs
                io.to(`user_${senderId}`).emit("new_message", savedMessage);
                io.to(`user_${senderId}`).emit("message_delivered", {
                    id: savedMessage.id,
                    status: savedMessage.status,
                    delivered_at: savedMessage.delivered_at,
                    expires_at: savedMessage.expires_at
                });
            } catch (socketErr) {
                console.warn("Socket broadcast warning:", socketErr.message);
            }
        } else {
            // Receiver is offline -> save as pending, expiry countdown does NOT start
            const result = await pool.query(
                `INSERT INTO chat_messages (sender_id, receiver_id, message_text, status, delivered_at, expires_at, reply_to_message_id)
                 VALUES ($1, $2, $3, 'pending', NULL, NULL, $4)
                 RETURNING id, sender_id, receiver_id, message_text, status, created_at, delivered_at, expires_at, reply_to_message_id`,
                [senderId, receiver_id, trimmedText, validatedReplyId]
            );
            savedMessage = {
                ...result.rows[0],
                reply_message_text: replyMeta ? replyMeta.message_text : null,
                reply_sender_username: replyMeta ? replyMeta.sender_username : null,
                reply_sender_display_name: replyMeta ? replyMeta.sender_display_name : null,
                reply_expired: false
            };

            try {
                const io = getIO();
                // Notify sender's other sessions/tabs
                io.to(`user_${senderId}`).emit("new_message", savedMessage);
            } catch (socketErr) {
                console.warn("Socket broadcast warning:", socketErr.message);
            }
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

        // Mark any delivered messages from target user as read (Feature 4)
        // CRITICAL: delivered_at and expires_at remain UNCHANGED (Rule: 5-min expiry after delivery)
        const markReadResult = await pool.query(
            `UPDATE chat_messages
             SET status = 'read'
             WHERE receiver_id = $1 AND sender_id = $2 AND status = 'delivered'
             RETURNING id`,
            [currentUserId, targetUserId]
        );

        if (markReadResult.rows.length > 0) {
            try {
                const io = getIO();
                const readIds = markReadResult.rows.map(r => r.id);
                io.to(`user_${targetUserId}`).emit("message_read", {
                    readerId: currentUserId,
                    messageIds: readIds
                });
            } catch (socketErr) {
                console.warn("Socket broadcast warning (read):", socketErr.message);
            }
        }

        // Query conversation excluding expired messages + fetch quoted reply information
        const messagesQuery = await pool.query(
            `SELECT m.id, m.sender_id, m.receiver_id, m.message_text, m.status, m.created_at, m.delivered_at, m.expires_at,
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
                    END AS reply_expired
             FROM chat_messages m
             LEFT JOIN chat_messages rm ON rm.id = m.reply_to_message_id
             LEFT JOIN chat_users rmu ON rmu.id = rm.sender_id
             WHERE (
                 (m.sender_id = $1 AND m.receiver_id = $2)
                 OR
                 (m.sender_id = $2 AND m.receiver_id = $1)
             )
             AND (m.expires_at IS NULL OR m.expires_at > NOW())
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

        return res.status(200).json({
            success: true,
            readCount: markResult.rows.length
        });
    } catch (error) {
        console.error("Mark read error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update read status." });
    }
};

module.exports = {
    sendMessage,
    getConversation,
    markConversationAsRead
};
