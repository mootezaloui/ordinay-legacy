'use strict';

const agentV2Policy = {
  version: 'v2',
  allowedIntents: [
    'EXPLAIN_ENTITY_STATE',
    'SUMMARIZE_SESSION',
    'DRAFT_INVITATION',
    'DRAFT_CLIENT_EMAIL',
  ],
  allowedToolCategories: ['read', 'analysis', 'draft'],
  allowExecution: false,
  allowExternalSearch: false,
  allowEnrichment: true, // read-only enrichment flag
  defaultReasoner: 'rule',
};

module.exports = agentV2Policy;
