'use strict';

const agentV3Policy = {
  version: 'v3',
  allowedIntents: [
    'EXPLAIN_ENTITY_STATE',
    'SUMMARIZE_SESSION',
    'ANALYZE_OPERATIONAL_RISKS',
    'DRAFT_INVITATION',
    'DRAFT_CLIENT_EMAIL',
  ],
  allowedToolCategories: ['read', 'analysis', 'draft', 'execute'],
  allowExecution: true,
  allowExternalSearch: true,
  allowEnrichment: true,
  defaultReasoner: 'rule',
};

module.exports = agentV3Policy;
