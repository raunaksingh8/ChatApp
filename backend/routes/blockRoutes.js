const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { blockUser, unblockUser, getBlockedUsers } = require("../controllers/blockController");

router.get("/", verifyToken, getBlockedUsers);
router.post("/:userId", verifyToken, blockUser);
router.delete("/:userId", verifyToken, unblockUser);

module.exports = router;

