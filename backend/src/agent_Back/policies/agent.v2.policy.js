'use strict';

const { INTENTS } = require('../intents');

const agentV2Policy = {
  version: 'v2',
  allowedIntents: [
    INTENTS.GENERAL_CHAT,
    INTENTS.EXPLAIN_ENTITY_STATE,
    INTENTS.SUMMARIZE_SESSION,
    INTENTS.DRAFT_INVITATION,
    INTENTS.DRAFT_CLIENT_EMAIL,
  ],
  allowedToolCategories: ['read', 'analysis', 'draft', 'research'],
  allowExecution: false,
  allowExternalSearch: true,
  allowEnrichment: true, // read-only enrichment flag
  defaultReasoner: 'rule',
};

module.exports = agentV2Policy;
