const express = require('express');
const controller = require('../controllers/documents.controller');

const router = express.Router();

router.get('/count', controller.count);
router.get('/', controller.list);
router.post('/upload', controller.upload);
router.post('/generate/plan', controller.planGeneration);
router.post('/generate', controller.generate);
router.get('/generations/:generationId', controller.getGeneration);
router.get('/generations/:generationId/progress', controller.generationProgress);
router.get('/ai/settings', controller.getAiSettings);
router.put('/ai/settings', controller.updateAiSettings);
router.get('/ai/audit', controller.listAiAuditLogs);
router.post('/', controller.create);
router.get('/:id/download', controller.download);
router.get('/:id', controller.get);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
