const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { areContacts } = require("../services/contactService");
const { isBlocked } = require("../services/blockService");

let io = null;
// Track active sockets per user: userId -> Set<socketId>
const userSessions = new Map();

// Track in-memory typing state: userId -> Set<receiverId>
const activeTyping = new Map();

const isUserOnline = (userId) => {
    const sessions = userSessions.get(userId);
    return !!(sessions && sessions.size > 0);
};

// Deliver all pending messages for a user who just connected
const deliverPendingMessages = async (userId, targetSocket) => {
    try {
        // Query pending messages where user is receiver
        const pendingQuery = await pool.query(
            `SELECT id, sender_id, receiver_id, message_text, status, created_at, reply_to_message_id
             FROM chat_messages
             WHERE receiver_id = $1 AND status = 'pending'
             ORDER BY created_at ASC`,
            [userId]
        );

        if (pendingQuery.rows.length === 0) return;

        for (const msg of pendingQuery.rows) {
            // Verify not blocked
            const blocked = await isBlocked(msg.sender_id, userId);
            if (blocked) continue;

            // Verify sender is still an accepted contact before delivering
            const isContact = await areContacts(msg.sender_id, userId);
            if (!isContact) continue;

            // Update message status to delivered and set expires_at = NOW() + 5 minutes
            const updateResult = await pool.query(
                `UPDATE chat_messages
                 SET status = 'delivered',
                     delivered_at = NOW(),
                     expires_at = NOW() + INTERVAL '5 minutes'
                 WHERE id = $1 AND status = 'pending'
                 RETURNING id, sender_id, receiver_id, message_text, status, created_at, delivered_at, expires_at, reply_to_message_id`,
                [msg.id]
            );

            if (updateResult.rows.length > 0) {
                let deliveredMsg = updateResult.rows[0];

                // If message is a reply, fetch replied message info
                if (deliveredMsg.reply_to_message_id) {
                    const replyMeta = await pool.query(
                        `SELECT m.message_text, m.expires_at, u.username, u.display_name
                         FROM chat_messages m
                         JOIN chat_users u ON u.id = m.sender_id
                         WHERE m.id = $1`,
                        [deliveredMsg.reply_to_message_id]
                    );
                    if (replyMeta.rows.length > 0) {
                        const isExpired = replyMeta.rows[0].expires_at && new Date(replyMeta.rows[0].expires_at).getTime() <= Date.now();
                        deliveredMsg = {
                            ...deliveredMsg,
                            reply_message_text: isExpired ? "Original message expired" : replyMeta.rows[0].message_text,
                            reply_sender_username: replyMeta.rows[0].username,
                            reply_sender_display_name: replyMeta.rows[0].display_name,
                            reply_expired: isExpired
                        };
                    }
                }

                // Deliver to recipient's room
                io.to(`user_${userId}`).emit("new_message", deliveredMsg);

                // Notify sender that message has been delivered
                io.to(`user_${deliveredMsg.sender_id}`).emit("message_delivered", {
                    id: deliveredMsg.id,
                    status: deliveredMsg.status,
                    delivered_at: deliveredMsg.delivered_at,
                    expires_at: deliveredMsg.expires_at
                });
            }
        }
    } catch (err) {
        console.error("Error delivering pending messages for user", userId, err.message);
    }
};

const initializeSocket = (httpServer) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    io = new Server(httpServer, {
        cors: {
            origin: [frontendUrl, "http://localhost:5173", "http://127.0.0.1:5173"],
            methods: ["GET", "POST"],
            credentials: true
        },
        pingTimeout: 30000,
        pingInterval: 15000
    });

    // Authentication middleware for Socket.IO
    io.use(async (socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.replace("Bearer ", "");

            if (!token) {
                return next(new Error("Authentication token required"));
            }

            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (err) {
                return next(new Error("Invalid or expired authentication token"));
            }

            const userId = decoded.userId || decoded.id;
            if (!userId) {
                return next(new Error("Invalid token payload"));
            }

            // Verify user in database with profile fields
            const userCheck = await pool.query(
                "SELECT id, username, display_name, avatar_url FROM chat_users WHERE id = $1",
                [userId]
            );

            if (userCheck.rows.length === 0) {
                return next(new Error("User not found"));
            }

            socket.user = {
                id: userCheck.rows[0].id,
                username: userCheck.rows[0].username,
                display_name: userCheck.rows[0].display_name,
                avatar_url: userCheck.rows[0].avatar_url
            };

            next();
        } catch (error) {
            console.error("Socket authentication error:", error.message);
            return next(new Error("Internal server error during socket authentication"));
        }
    });

    io.on("connection", async (socket) => {
        const userId = socket.user.id;
        const username = socket.user.username;

        // Join personal room for targeted messaging
        socket.join(`user_${userId}`);

        // Register session
        if (!userSessions.has(userId)) {
            userSessions.set(userId, new Set());
        }
        const userSocketSet = userSessions.get(userId);
        const isFirstConnection = userSocketSet.size === 0;
        userSocketSet.add(socket.id);

        if (isFirstConnection) {
            pool.query(
                "UPDATE chat_users SET is_online = true WHERE id = $1",
                [userId]
            ).then(() => {
                // Broadcast online status to all connected users
                io.emit("user_status_changed", {
                    userId,
                    is_online: true
                });
            }).catch((err) => {
                console.error("Error setting online status in DB:", err.message);
            });
        }

        // Deliver any pending messages queued while offline (non-blocking)
        deliverPendingMessages(userId, socket).catch((err) => {
            console.error("Error delivering pending messages:", err.message);
        });

        // Client to server: send_message
        socket.on("send_message", async (data, callback) => {
            try {
                const { receiver_id, message_text, reply_to_message_id } = data || {};

                if (!receiver_id || typeof receiver_id !== "string") {
                    if (callback) callback({ success: false, message: "Valid receiver ID is required." });
                    return;
                }

                if (receiver_id === userId) {
                    if (callback) callback({ success: false, message: "Cannot send a message to yourself." });
                    return;
                }

                const trimmedText = (message_text || "").trim();
                if (!trimmedText || trimmedText.length > 5000) {
                    if (callback) callback({ success: false, message: "Message must be between 1 and 5000 characters." });
                    return;
                }

                // Check recipient exists
                const recipientCheck = await pool.query(
                    "SELECT id, username FROM chat_users WHERE id = $1",
                    [receiver_id]
                );

                if (recipientCheck.rows.length === 0) {
                    if (callback) callback({ success: false, message: "Recipient user not found." });
                    return;
                }

                // --- BLOCK RESTRICTION CHECK (Feature 2) ---
                const blocked = await isBlocked(userId, receiver_id);
                if (blocked) {
                    if (callback) callback({ success: false, message: "Messaging is blocked between you and this user." });
                    return;
                }

                // --- CONTACT AUTHORIZATION CHECK ---
                const isContact = await areContacts(userId, receiver_id);
                if (!isContact) {
                    if (callback) callback({ success: false, message: "You can only send messages to accepted contacts." });
                    return;
                }

                // --- REPLY VALIDATION (Feature 6) ---
                let validatedReplyId = null;
                let replyMeta = null;

                if (reply_to_message_id) {
                    const replyQuery = await pool.query(
                        `SELECT m.id, m.sender_id, m.receiver_id, m.message_text, m.expires_at,
                                u.username AS sender_username, u.display_name AS sender_display_name
                         FROM chat_messages m
                         JOIN chat_users u ON u.id = m.sender_id
                         WHERE m.id = $1`,
                        [reply_to_message_id]
                    );

                    if (replyQuery.rows.length > 0) {
                        const original = replyQuery.rows[0];
                        const isSameConv =
                            (original.sender_id === userId && original.receiver_id === receiver_id) ||
                            (original.sender_id === receiver_id && original.receiver_id === userId);

                        const isNotExpired = !original.expires_at || new Date(original.expires_at).getTime() > Date.now();

                        if (isSameConv && isNotExpired) {
                            validatedReplyId = original.id;
                            replyMeta = {
                                message_text: original.message_text,
                                sender_username: original.sender_username,
                                sender_display_name: original.sender_display_name,
                                reply_expired: false
                            };
                        }
                    }
                }

                const receiverOnline = isUserOnline(receiver_id);

                let savedMessage;
                if (receiverOnline) {
                    // Receiver is online -> deliver immediately & start 5-minute countdown
                    const insertResult = await pool.query(
                        `INSERT INTO chat_messages (sender_id, receiver_id, message_text, status, delivered_at, expires_at, reply_to_message_id)
                         VALUES ($1, $2, $3, 'delivered', NOW(), NOW() + INTERVAL '5 minutes', $4)
                         RETURNING id, sender_id, receiver_id, message_text, status, created_at, delivered_at, expires_at, reply_to_message_id`,
                        [userId, receiver_id, trimmedText, validatedReplyId]
                    );
                    savedMessage = {
                        ...insertResult.rows[0],
                        reply_message_text: replyMeta ? replyMeta.message_text : null,
                        reply_sender_username: replyMeta ? replyMeta.sender_username : null,
                        reply_sender_display_name: replyMeta ? replyMeta.sender_display_name : null,
                        reply_expired: false
                    };

                    // Emit to receiver's room
                    io.to(`user_${receiver_id}`).emit("new_message", savedMessage);

                    // Notify sender with delivery confirmation
                    socket.emit("message_delivered", {
                        id: savedMessage.id,
                        status: savedMessage.status,
                        delivered_at: savedMessage.delivered_at,
                        expires_at: savedMessage.expires_at
                    });
                } else {
                    // Receiver is offline -> save as pending, expiry countdown does NOT start
                    const insertResult = await pool.query(
                        `INSERT INTO chat_messages (sender_id, receiver_id, message_text, status, delivered_at, expires_at, reply_to_message_id)
                         VALUES ($1, $2, $3, 'pending', NULL, NULL, $4)
                         RETURNING id, sender_id, receiver_id, message_text, status, created_at, delivered_at, expires_at, reply_to_message_id`,
                        [userId, receiver_id, trimmedText, validatedReplyId]
                    );
                    savedMessage = {
                        ...insertResult.rows[0],
                        reply_message_text: replyMeta ? replyMeta.message_text : null,
                        reply_sender_username: replyMeta ? replyMeta.sender_username : null,
                        reply_sender_display_name: replyMeta ? replyMeta.sender_display_name : null,
                        reply_expired: false
                    };
                }

                // Also notify other active sessions of the sender so all tabs stay in sync
                socket.to(`user_${userId}`).emit("new_message", savedMessage);

                // Clear typing indicator for this conversation
                io.to(`user_${receiver_id}`).emit("user_typing", {
                    userId,
                    username,
                    is_typing: false
                });

                if (callback) {
                    callback({
                        success: true,
                        message: savedMessage
                    });
                }
            } catch (err) {
                console.error("Socket send_message error:", err.message);
                if (callback) callback({ success: false, message: "Failed to send message." });
            }
        });

        // Client to server: typing_start (Feature 3)
        socket.on("typing_start", async (data) => {
            try {
                const { receiver_id } = data || {};
                if (!receiver_id || receiver_id === userId) return;

                // Check block & contact
                const blocked = await isBlocked(userId, receiver_id);
                if (blocked) return;

                const isContact = await areContacts(userId, receiver_id);
                if (!isContact) return;

                if (!activeTyping.has(userId)) {
                    activeTyping.set(userId, new Set());
                }
                activeTyping.get(userId).add(receiver_id);

                io.to(`user_${receiver_id}`).emit("user_typing", {
                    userId,
                    username: socket.user.username,
                    display_name: socket.user.display_name,
                    is_typing: true
                });
            } catch (err) {
                console.error("typing_start error:", err.message);
            }
        });

        // Client to server: typing_stop (Feature 3)
        socket.on("typing_stop", async (data) => {
            try {
                const { receiver_id } = data || {};
                if (!receiver_id) return;

                if (activeTyping.has(userId)) {
                    activeTyping.get(userId).delete(receiver_id);
                }

                io.to(`user_${receiver_id}`).emit("user_typing", {
                    userId,
                    username: socket.user.username,
                    is_typing: false
                });
            } catch (err) {
                console.error("typing_stop error:", err.message);
            }
        });

        // Client to server: mark_message_read (Feature 4)
        socket.on("mark_message_read", async (data) => {
            try {
                const { sender_id, message_id } = data || {};

                if (sender_id) {
                    // Mark all delivered messages from this sender as read
                    const updateResult = await pool.query(
                        `UPDATE chat_messages
                         SET status = 'read'
                         WHERE receiver_id = $1 AND sender_id = $2 AND status = 'delivered'
                         RETURNING id`,
                        [userId, sender_id]
                    );

                    if (updateResult.rows.length > 0) {
                        const readIds = updateResult.rows.map(r => r.id);
                        io.to(`user_${sender_id}`).emit("message_read", {
                            readerId: userId,
                            messageIds: readIds
                        });
                    }
                } else if (message_id) {
                    const result = await pool.query(
                        `UPDATE chat_messages
                         SET status = 'read'
                         WHERE id = $1 AND receiver_id = $2 AND status = 'delivered'
                         RETURNING id, sender_id`,
                        [message_id, userId]
                    );

                    if (result.rows.length > 0) {
                        const msg = result.rows[0];
                        io.to(`user_${msg.sender_id}`).emit("message_read", {
                            readerId: userId,
                            messageIds: [msg.id]
                        });
                    }
                }
            } catch (err) {
                console.error("mark_message_read error:", err.message);
            }
        });

        // Handle disconnect
        socket.on("disconnect", async () => {
            // Clear any active typing indicators sent by this user
            if (activeTyping.has(userId)) {
                for (const targetId of activeTyping.get(userId)) {
                    io.to(`user_${targetId}`).emit("user_typing", {
                        userId,
                        username: socket.user.username,
                        is_typing: false
                    });
                }
                activeTyping.delete(userId);
            }

            const currentSockets = userSessions.get(userId);
            if (currentSockets) {
                currentSockets.delete(socket.id);

                // Only update offline status if all sessions/tabs of this user have closed
                if (currentSockets.size === 0) {
                    userSessions.delete(userId);
                    try {
                        await pool.query(
                            "UPDATE chat_users SET is_online = false, last_seen = NOW() WHERE id = $1",
                            [userId]
                        );
                        io.emit("user_status_changed", {
                            userId,
                            is_online: false,
                            last_seen: new Date().toISOString()
                        });
                    } catch (err) {
                        console.error("Error setting offline status in DB:", err.message);
                    }
                }
            }
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.IO not initialized!");
    }
    return io;
};

module.exports = {
    initializeSocket,
    getIO,
    isUserOnline
};
