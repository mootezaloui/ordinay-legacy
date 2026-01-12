const express = require('express');
const controller = require('../controllers/missions.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id/delete-impact', controller.getDeleteImpact);
router.get('/:id', controller.get);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
