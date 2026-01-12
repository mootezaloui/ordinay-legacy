const express = require('express');
const controller = require('../controllers/operators.controller');

const router = express.Router();

router.get('/current', controller.getCurrent);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.put('/:id', controller.update);

module.exports = router;
