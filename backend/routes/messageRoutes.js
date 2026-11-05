const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const { sendMessage, getConversation, markConversationAsRead } = require("../controllers/messageController");

router.post("/", authenticateToken, sendMessage);
router.get("/:userId", authenticateToken, getConversation);
router.post("/:userId/read", authenticateToken, markConversationAsRead);

module.exports = router;

