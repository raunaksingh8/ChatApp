const express = require("express");
const authenticateToken = require("../middleware/authMiddleware");
const { getPublicKey, subscribe, unsubscribe } = require("../controllers/pushController");

const router = express.Router();

router.get("/public-key", authenticateToken, getPublicKey);
router.post("/subscriptions", authenticateToken, subscribe);
router.delete("/subscriptions", authenticateToken, unsubscribe);

module.exports = router;
