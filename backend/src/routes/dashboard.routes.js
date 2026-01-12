const express = require('express');
const controller = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/summary', controller.getSummary);

module.exports = router;
