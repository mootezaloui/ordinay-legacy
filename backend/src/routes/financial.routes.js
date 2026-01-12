const express = require("express");
const controller = require("../controllers/financial.controller");

const router = express.Router();

// Core CRUD routes
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.get);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

// Financial stabilization routes (Phase 1)
router.post("/:id/cancel", controller.cancel);
router.get("/client/:clientId/balance", controller.getClientBalance);
router.get("/check/:parentType/:parentId", controller.checkParentDeletion);

module.exports = router;
