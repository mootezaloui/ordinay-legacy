'use strict';

const agentV1Policy = {
  version: 'v1',
  allowedIntents: [
    'EXPLAIN_ENTITY_STATE',
    'SUMMARIZE_SESSION',
    'DRAFT_INVITATION',
    'DRAFT_CLIENT_EMAIL',
  ],
  allowedToolCategories: ['read', 'analysis', 'draft'],
  allowExecution: false,
  allowExternalSearch: false,
  allowEnrichment: false,
  defaultReasoner: 'rule',
};

module.exports = agentV1Policy;
