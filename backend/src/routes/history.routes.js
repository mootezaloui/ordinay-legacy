const express = require("express");
const controller = require("../controllers/history.controller");

const router = express.Router();

router.get("/count", controller.count);
router.get("/", controller.list);
router.post("/", controller.create);
router.delete("/entity", controller.deleteByEntity);
router.delete("/:id", controller.remove);

module.exports = router;
