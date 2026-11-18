const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const {
  sendMessage,
  getConversation,
  markConversationAsRead,
  getUnreadCount,
  toggleReaction,
  openConversation
} = require("../controllers/messageController");

router.post("/", authenticateToken, sendMessage);
router.get("/unread-count", authenticateToken, getUnreadCount);
router.get("/:userId", authenticateToken, getConversation);
router.post("/:userId/read", authenticateToken, markConversationAsRead);
router.post("/:userId/open", authenticateToken, openConversation);
router.post("/:messageId/reaction", authenticateToken, toggleReaction);

module.exports = router;
