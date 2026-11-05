const pool = require("../config/db");
const { isBlocked } = require("../services/blockService");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/profile/me
 * Retrieve the authenticated user's profile.
 */
const getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT id, username, display_name, about, avatar_url, is_online, last_seen, created_at, updated_at
             FROM chat_users
             WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User profile not found." });
        }

        return res.status(200).json({
            success: true,
            profile: result.rows[0]
        });
    } catch (error) {
        console.error("Get my profile error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to retrieve profile." });
    }
};

/**
 * PUT /api/profile/me
 * Update display name, about, and/or avatar URL.
 */
const updateMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { display_name, about, avatar_url } = req.body;

        // Validation
        const cleanDisplayName = display_name !== undefined ? (display_name ? display_name.trim() : null) : undefined;
        if (cleanDisplayName !== undefined && cleanDisplayName !== null && cleanDisplayName.length > 50) {
            return res.status(400).json({
                success: false,
                message: "Display name cannot exceed 50 characters."
            });
        }

        const cleanAbout = about !== undefined ? (about ? about.trim() : null) : undefined;
        if (cleanAbout !== undefined && cleanAbout !== null && cleanAbout.length > 200) {
            return res.status(400).json({
                success: false,
                message: "About section cannot exceed 200 characters."
            });
        }

        // Validate avatar_url if provided
        let cleanAvatarUrl = avatar_url !== undefined ? (avatar_url ? avatar_url.trim() : null) : undefined;
        if (cleanAvatarUrl !== undefined && cleanAvatarUrl !== null) {
            // Check if standard HTTP/HTTPS URL or Base64 Image URI
            const isHttpUrl = cleanAvatarUrl.startsWith("http://") || cleanAvatarUrl.startsWith("https://");
            const isBase64Image = cleanAvatarUrl.startsWith("data:image/");

            if (!isHttpUrl && !isBase64Image) {
                return res.status(400).json({
                    success: false,
                    message: "Avatar must be a valid HTTP URL or an image data URI."
                });
            }

            // If base64, ensure size <= 2.5MB payload (~2MB image)
            if (isBase64Image && cleanAvatarUrl.length > 3.5 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: "Avatar image exceeds the 2 MB size limit."
                });
            }
        }

        // Build dynamic update query
        const updates = [];
        const values = [userId];

        if (cleanDisplayName !== undefined) {
            values.push(cleanDisplayName);
            updates.push(`display_name = $${values.length}`);
        }

        if (cleanAbout !== undefined) {
            values.push(cleanAbout);
            updates.push(`about = $${values.length}`);
        }

        if (cleanAvatarUrl !== undefined) {
            values.push(cleanAvatarUrl);
            updates.push(`avatar_url = $${values.length}`);
        }

        updates.push("updated_at = NOW()");

        const query = `
            UPDATE chat_users
            SET ${updates.join(", ")}
            WHERE id = $1
            RETURNING id, username, display_name, about, avatar_url, is_online, last_seen, created_at, updated_at
        `;

        const result = await pool.query(query, values);

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            profile: result.rows[0]
        });
    } catch (error) {
        console.error("Update profile error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to update profile." });
    }
};

/**
 * GET /api/profile/:userId
 * Retrieve permitted public profile information of another registered user.
 */
const getUserProfile = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const targetUserId = req.params.userId;

        if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
            return res.status(400).json({ success: false, message: "A valid user ID is required." });
        }

        // Check if either user has blocked the other
        const blocked = await isBlocked(currentUserId, targetUserId);
        if (blocked) {
            return res.status(403).json({
                success: false,
                message: "You cannot view the profile of this user."
            });
        }

        const result = await pool.query(
            `SELECT id, username, display_name, about, avatar_url, is_online, last_seen, created_at
             FROM chat_users
             WHERE id = $1`,
            [targetUserId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        return res.status(200).json({
            success: true,
            profile: result.rows[0]
        });
    } catch (error) {
        console.error("Get user profile error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to retrieve user profile." });
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile,
    getUserProfile
};

