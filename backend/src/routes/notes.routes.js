const express = require("express");
const controller = require("../controllers/notes.controller");

const router = express.Router();

router.get("/", controller.list);
router.get("/:id", controller.get);
router.post("/", controller.create);
router.patch("/:id", controller.update);
router.delete("/:id", controller.remove);
router.post("/bulk-save", controller.bulkSave);

module.exports = router;
