const FEATURE_AI_AGENT = true;

// Flip to true to re-enable the Ordinay Intelligence (Agent) feature
// and include backend/src/agent in production builds.

const FEATURE_MCP_INTEGRATION = true;

// Flip to true to enable MCP (Model Context Protocol) integration.
// MCP provides standardized bridge to external tools (web search, legal databases, etc.)

module.exports = {
  FEATURE_AI_AGENT,
  FEATURE_MCP_INTEGRATION,
};
