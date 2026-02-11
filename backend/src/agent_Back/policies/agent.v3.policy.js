'use strict';

const { INTENTS } = require('../intents');

const agentV3Policy = {
  version: 'v3',
  allowedIntents: [
    INTENTS.GENERAL_CHAT,
    INTENTS.EXPLAIN_ENTITY_STATE,
    INTENTS.SUMMARIZE_SESSION,
    INTENTS.ANALYZE_OPERATIONAL_RISKS,
    INTENTS.DRAFT_INVITATION,
    INTENTS.DRAFT_CLIENT_EMAIL,
    INTENTS.PROPOSE_ACTIONS,
  ],
  allowedToolCategories: ['read', 'analysis', 'draft', 'execute', 'research'],
  allowExecution: true,
  requirePosture: 'WORK',
  executionRequiresConfirmation: true,
  allowExternalSearch: true,
  allowEnrichment: true,
  defaultReasoner: 'rule',
};

module.exports = agentV3Policy;
