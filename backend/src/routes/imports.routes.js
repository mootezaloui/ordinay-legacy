const express = require("express");
const controller = require("../controllers/imports.controller");

const router = express.Router();

router.get("/", controller.list);
router.get("/aliases", controller.aliases);
router.post("/auto", controller.autoImport);
router.post("/raw", controller.createRaw);
router.get("/:id", controller.get);
router.post("/:id/normalize", controller.normalize);
router.post("/:id/validate", controller.validate);

module.exports = router;
