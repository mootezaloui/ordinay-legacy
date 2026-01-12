const express = require('express');
const controller = require('../controllers/profile.controller');

const router = express.Router();

router.get('/stats', controller.getStats);

module.exports = router;
