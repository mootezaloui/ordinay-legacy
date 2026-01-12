'use strict';

const express = require('express');
const AgentEngine = require('./agent.engine');

const router = express.Router();
const agentEngine = new AgentEngine();

router.post('/agent/run', async (req, res, next) => {
  const { message, context, agentVersion, reasoner } = req.body || {};
  try {
    const result = await agentEngine.run({ message, context, agentVersion, reasoner });
    res.json({
      status: 'ok',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
