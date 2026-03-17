"use strict";

const { INTENTS } = require("../intents");

const agentV1Policy = {
  version: "v1",
  documentHandling: {
    mode: "text", // readable text only; scanned-doc parsing pipeline removed
  },
  allowedIntents: [
    INTENTS.GENERAL_CHAT,
    INTENTS.EXPLAIN_ENTITY_STATE,
    INTENTS.SUMMARIZE_SESSION,
    INTENTS.DRAFT_INVITATION,
    INTENTS.DRAFT_CLIENT_EMAIL,
    INTENTS.DRAFT_GENERIC,
  ],
  allowedToolCategories: ["read", "analysis", "draft"],
  allowExecution: false,
  allowExternalSearch: true,
  allowEnrichment: false,
  defaultReasoner: "rule",
};

module.exports = agentV1Policy;
