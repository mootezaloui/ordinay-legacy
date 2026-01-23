const express = require('express');
const controller = require('../controllers/email.controller');

const router = express.Router();

router.post('/send', controller.sendClientEmail);
router.get('/status', controller.checkStatus);

module.exports = router;
