const express = require("express");
const controller = require("../controllers/notifications.controller");

const router = express.Router();

// Bulk clear endpoint (optionally filter by entity_type/entity_id)
router.delete("/", controller.clearAll);

// Dismiss a notification for a user (persist dedupe_key)
router.post("/dismiss", controller.dismiss);
// Check if a notification is dismissed for a user
router.get("/dismissed", controller.isDismissed);
router.get("/count", controller.count);
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.get);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
