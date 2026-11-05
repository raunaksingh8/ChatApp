const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const { getUsers, searchUsers } = require("../controllers/userController");

router.get("/", authenticateToken, getUsers);
router.get("/search", authenticateToken, searchUsers);

module.exports = router;
