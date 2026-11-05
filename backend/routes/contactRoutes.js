const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const {
    sendRequest,
    getIncomingRequests,
    getOutgoingRequests,
    acceptRequest,
    rejectRequest,
    getContacts,
    removeContact
} = require("../controllers/contactController");

// Contact list
router.get("/", authenticateToken, getContacts);

// Contact requests
router.post("/requests", authenticateToken, sendRequest);
router.get("/requests/incoming", authenticateToken, getIncomingRequests);
router.get("/requests/outgoing", authenticateToken, getOutgoingRequests);
router.post("/requests/:requestId/accept", authenticateToken, acceptRequest);
router.post("/requests/:requestId/reject", authenticateToken, rejectRequest);

// Remove contact
router.delete("/:userId", authenticateToken, removeContact);

module.exports = router;

