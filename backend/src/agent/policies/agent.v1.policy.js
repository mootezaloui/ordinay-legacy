'use strict';

const { INTENTS } = require('../intents');

const agentV1Policy = {
  version: 'v1',
  allowedIntents: [
    INTENTS.EXPLAIN_ENTITY_STATE,
    INTENTS.SUMMARIZE_SESSION,
    INTENTS.DRAFT_INVITATION,
    INTENTS.DRAFT_CLIENT_EMAIL,
  ],
  allowedToolCategories: ['read', 'analysis', 'draft'],
  allowExecution: false,
  allowExternalSearch: false,
  allowEnrichment: false,
  defaultReasoner: 'rule',
};

module.exports = agentV1Policy;
