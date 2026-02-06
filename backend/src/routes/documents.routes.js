const express = require('express');
const controller = require('../controllers/documents.controller');

const router = express.Router();

router.get('/count', controller.count);
router.get('/', controller.list);
router.post('/upload', controller.upload);
router.post('/', controller.create);
router.get('/:id', controller.get);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
