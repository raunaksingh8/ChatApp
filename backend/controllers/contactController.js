const pool = require("../config/db");
const { getIO } = require("../sockets/socketHandler");
const { isBlocked } = require("../services/blockService");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/contacts/requests
 * Send a contact request. Auto-accepts if a reverse pending request already exists.
 */
const sendRequest = async (req, res) => {
    try {
        const requesterId = req.user.id;
        const { recipient_id } = req.body;

        if (!recipient_id || !UUID_REGEX.test(recipient_id)) {
            return res.status(400).json({ success: false, message: "A valid recipient ID is required." });
        }

        if (recipient_id === requesterId) {
            return res.status(400).json({ success: false, message: "Cannot send a contact request to yourself." });
        }

        // Verify recipient exists
        const recipientCheck = await pool.query(
            "SELECT id, username FROM chat_users WHERE id = $1",
            [recipient_id]
        );
        if (recipientCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Recipient user not found." });
        }

        // Block restriction check (Feature 2)
        const blocked = await isBlocked(requesterId, recipient_id);
        if (blocked) {
            return res.status(403).json({ success: false, message: "Cannot send a contact request to this user." });
        }

        // Check for existing accepted relationship in either direction
        const existingAccepted = await pool.query(
            `SELECT id FROM chat_contact_requests
             WHERE status = 'accepted'
             AND (
                 (requester_id = $1 AND recipient_id = $2)
                 OR (requester_id = $2 AND recipient_id = $1)
             ) LIMIT 1`,
            [requesterId, recipient_id]
        );
        if (existingAccepted.rows.length > 0) {
            return res.status(409).json({ success: false, message: "You are already contacts with this user." });
        }

        // Check for existing pending request from requester → recipient
        const existingOutgoing = await pool.query(
            `SELECT id FROM chat_contact_requests
             WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'`,
            [requesterId, recipient_id]
        );
        if (existingOutgoing.rows.length > 0) {
            return res.status(409).json({ success: false, message: "You have already sent a pending request to this user." });
        }

        // Check for an existing pending request from recipient → requester (reverse direction)
        const reverseRequest = await pool.query(
            `SELECT id FROM chat_contact_requests
             WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'`,
            [recipient_id, requesterId]
        );

        if (reverseRequest.rows.length > 0) {
            // Auto-accept the reverse pending request
            const acceptResult = await pool.query(
                `UPDATE chat_contact_requests
                 SET status = 'accepted', updated_at = NOW()
                 WHERE id = $1 AND status = 'pending'
                 RETURNING id, requester_id, recipient_id, status, created_at, updated_at`,
                [reverseRequest.rows[0].id]
            );

            if (acceptResult.rows.length > 0) {
                const accepted = acceptResult.rows[0];
                try {
                    const io = getIO();
                    const requesterInfo = await pool.query("SELECT id, username FROM chat_users WHERE id = $1", [accepted.requester_id]);
                    const recipientInfo = await pool.query("SELECT id, username FROM chat_users WHERE id = $1", [accepted.recipient_id]);

                    const eventData = {
                        requestId: accepted.id,
                        requester: requesterInfo.rows[0],
                        recipient: recipientInfo.rows[0]
                    };
                    io.to(`user_${accepted.requester_id}`).emit("contact_request_accepted", eventData);
                    io.to(`user_${accepted.recipient_id}`).emit("contact_request_accepted", eventData);
                } catch (socketErr) {
                    console.warn("Socket broadcast warning (auto-accept):", socketErr.message);
                }

                return res.status(200).json({
                    success: true,
                    message: "Contact request auto-accepted. You are now contacts.",
                    request: acceptResult.rows[0],
                    auto_accepted: true
                });
            }
        }

        // Create new pending request
        const insertResult = await pool.query(
            `INSERT INTO chat_contact_requests (requester_id, recipient_id, status)
             VALUES ($1, $2, 'pending')
             RETURNING id, requester_id, recipient_id, status, created_at, updated_at`,
            [requesterId, recipient_id]
        );

        const newRequest = insertResult.rows[0];

        // Notify recipient via Socket.IO
        try {
            const io = getIO();
            const requesterInfo = await pool.query("SELECT id, username FROM chat_users WHERE id = $1", [requesterId]);
            io.to(`user_${recipient_id}`).emit("contact_request_received", {
                requestId: newRequest.id,
                requester: requesterInfo.rows[0],
                created_at: newRequest.created_at
            });
        } catch (socketErr) {
            console.warn("Socket broadcast warning (send request):", socketErr.message);
        }

        return res.status(201).json({
            success: true,
            message: "Contact request sent successfully.",
            request: newRequest
        });
    } catch (error) {
        // Handle unique constraint violation (duplicate pending request race condition)
        if (error.code === "23505") {
            return res.status(409).json({ success: false, message: "A pending request already exists." });
        }
        console.error("Send contact request error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to send contact request." });
    }
};

/**
 * GET /api/contacts/requests/incoming
 * Pending requests received by the authenticated user.
 */
const getIncomingRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT cr.id, cr.requester_id, cu.username AS requester_username,
                    cu.display_name AS requester_display_name, cu.avatar_url AS requester_avatar_url,
                    cr.status, cr.created_at
             FROM chat_contact_requests cr
             JOIN chat_users cu ON cu.id = cr.requester_id
             WHERE cr.recipient_id = $1 AND cr.status = 'pending'
             ORDER BY cr.created_at DESC`,
            [userId]
        );

        return res.status(200).json({ success: true, requests: result.rows });
    } catch (error) {
        console.error("Get incoming requests error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to retrieve incoming requests." });
    }
};

/**
 * GET /api/contacts/requests/outgoing
 * Pending requests sent by the authenticated user.
 */
const getOutgoingRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT cr.id, cr.recipient_id, cu.username AS recipient_username,
                    cu.display_name AS recipient_display_name, cu.avatar_url AS recipient_avatar_url,
                    cr.status, cr.created_at
             FROM chat_contact_requests cr
             JOIN chat_users cu ON cu.id = cr.recipient_id
             WHERE cr.requester_id = $1 AND cr.status = 'pending'
             ORDER BY cr.created_at DESC`,
            [userId]
        );

        return res.status(200).json({ success: true, requests: result.rows });
    } catch (error) {
        console.error("Get outgoing requests error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to retrieve outgoing requests." });
    }
};

/**
 * POST /api/contacts/requests/:requestId/accept
 * Only the recipient can accept.
 */
const acceptRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const requestId = req.params.requestId;

        if (!requestId || !UUID_REGEX.test(requestId)) {
            return res.status(400).json({ success: false, message: "A valid request ID is required." });
        }

        // Fetch the request — only the recipient can accept
        const requestQuery = await pool.query(
            `SELECT id, requester_id, recipient_id, status
             FROM chat_contact_requests WHERE id = $1`,
            [requestId]
        );

        if (requestQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contact request not found." });
        }

        const request = requestQuery.rows[0];

        if (request.recipient_id !== userId) {
            return res.status(403).json({ success: false, message: "Only the recipient can accept this request." });
        }

        if (request.status !== "pending") {
            return res.status(409).json({ success: false, message: `Request has already been ${request.status}.` });
        }

        const updateResult = await pool.query(
            `UPDATE chat_contact_requests
             SET status = 'accepted', updated_at = NOW()
             WHERE id = $1 AND status = 'pending'
             RETURNING id, requester_id, recipient_id, status, created_at, updated_at`,
            [requestId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(409).json({ success: false, message: "Request could not be accepted (may have been processed already)." });
        }

        const accepted = updateResult.rows[0];

        // Notify both users via Socket.IO
        try {
            const io = getIO();
            const requesterInfo = await pool.query("SELECT id, username FROM chat_users WHERE id = $1", [accepted.requester_id]);
            const recipientInfo = await pool.query("SELECT id, username FROM chat_users WHERE id = $1", [accepted.recipient_id]);

            const eventData = {
                requestId: accepted.id,
                requester: requesterInfo.rows[0],
                recipient: recipientInfo.rows[0]
            };
            io.to(`user_${accepted.requester_id}`).emit("contact_request_accepted", eventData);
            io.to(`user_${accepted.recipient_id}`).emit("contact_request_accepted", eventData);
        } catch (socketErr) {
            console.warn("Socket broadcast warning (accept):", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Contact request accepted. You are now contacts.",
            request: accepted
        });
    } catch (error) {
        console.error("Accept contact request error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to accept contact request." });
    }
};

/**
 * POST /api/contacts/requests/:requestId/reject
 * Only the recipient can reject.
 */
const rejectRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const requestId = req.params.requestId;

        if (!requestId || !UUID_REGEX.test(requestId)) {
            return res.status(400).json({ success: false, message: "A valid request ID is required." });
        }

        const requestQuery = await pool.query(
            `SELECT id, requester_id, recipient_id, status
             FROM chat_contact_requests WHERE id = $1`,
            [requestId]
        );

        if (requestQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Contact request not found." });
        }

        const request = requestQuery.rows[0];

        if (request.recipient_id !== userId) {
            return res.status(403).json({ success: false, message: "Only the recipient can reject this request." });
        }

        if (request.status !== "pending") {
            return res.status(409).json({ success: false, message: `Request has already been ${request.status}.` });
        }

        const updateResult = await pool.query(
            `UPDATE chat_contact_requests
             SET status = 'rejected', updated_at = NOW()
             WHERE id = $1 AND status = 'pending'
             RETURNING id, requester_id, recipient_id, status, updated_at`,
            [requestId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(409).json({ success: false, message: "Request could not be rejected." });
        }

        const rejected = updateResult.rows[0];

        // Notify the requester via Socket.IO
        try {
            const io = getIO();
            io.to(`user_${rejected.requester_id}`).emit("contact_request_rejected", {
                requestId: rejected.id,
                rejected_by: userId
            });
        } catch (socketErr) {
            console.warn("Socket broadcast warning (reject):", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Contact request rejected.",
            request: rejected
        });
    } catch (error) {
        console.error("Reject contact request error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to reject contact request." });
    }
};

/**
 * GET /api/contacts
 * Retrieve accepted contacts for the authenticated user (both directions).
 */
const getContacts = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT cu.id, cu.username, cu.display_name, cu.avatar_url, cu.about, cu.is_online, cu.last_seen, cu.created_at
             FROM chat_contact_requests cr
             JOIN chat_users cu ON cu.id = CASE
                 WHEN cr.requester_id = $1 THEN cr.recipient_id
                 ELSE cr.requester_id
             END
             WHERE cr.status = 'accepted'
             AND (cr.requester_id = $1 OR cr.recipient_id = $1)
             AND NOT EXISTS (
                 SELECT 1 FROM chat_user_blocks b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = cu.id)
                    OR (b.blocker_id = cu.id AND b.blocked_id = $1)
             )
             ORDER BY cu.is_online DESC, COALESCE(cu.display_name, cu.username) ASC`,
            [userId]
        );

        return res.status(200).json({ success: true, contacts: result.rows });
    } catch (error) {
        console.error("Get contacts error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to retrieve contacts." });
    }
};

/**
 * DELETE /api/contacts/:userId
 * Remove an accepted contact. Deletes the accepted record and pending messages between them.
 */
const removeContact = async (req, res) => {
    const client = await pool.connect();
    try {
        const currentUserId = req.user.id;
        const targetUserId = req.params.userId;

        if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
            client.release();
            return res.status(400).json({ success: false, message: "A valid user ID is required." });
        }

        if (targetUserId === currentUserId) {
            client.release();
            return res.status(400).json({ success: false, message: "Cannot remove yourself as a contact." });
        }

        await client.query("BEGIN");

        // Find and delete the accepted contact request
        const deleteResult = await client.query(
            `DELETE FROM chat_contact_requests
             WHERE status = 'accepted'
             AND (
                 (requester_id = $1 AND recipient_id = $2)
                 OR (requester_id = $2 AND recipient_id = $1)
             )
             RETURNING id, requester_id, recipient_id`,
            [currentUserId, targetUserId]
        );

        if (deleteResult.rows.length === 0) {
            await client.query("ROLLBACK");
            client.release();
            return res.status(404).json({ success: false, message: "No accepted contact relationship found with this user." });
        }

        // Delete any pending (undelivered) messages between the two users
        await client.query(
            `DELETE FROM chat_messages
             WHERE status = 'pending'
             AND (
                 (sender_id = $1 AND receiver_id = $2)
                 OR (sender_id = $2 AND receiver_id = $1)
             )`,
            [currentUserId, targetUserId]
        );

        await client.query("COMMIT");
        client.release();

        // Notify both users via Socket.IO
        try {
            const io = getIO();
            io.to(`user_${currentUserId}`).emit("contact_removed", { removedUserId: targetUserId });
            io.to(`user_${targetUserId}`).emit("contact_removed", { removedUserId: currentUserId });
        } catch (socketErr) {
            console.warn("Socket broadcast warning (remove contact):", socketErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Contact removed successfully."
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
        console.error("Remove contact error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to remove contact." });
    }
};

module.exports = {
    sendRequest,
    getIncomingRequests,
    getOutgoingRequests,
    acceptRequest,
    rejectRequest,
    getContacts,
    removeContact
};

