const { getDeploymentState, getFeatureFlags } = require("../agent/deployment");

function resolveFlags() {
  const deploymentState = getDeploymentState();
  if (deploymentState && deploymentState.flags && deploymentState.flags.values) {
    return deploymentState.flags.values;
  }
  return getFeatureFlags(process.env).values;
}

const flags = resolveFlags();

module.exports = {
  FEATURE_AI_AGENT: flags.FEATURE_AI_AGENT,
  FEATURE_AGENT_V2_STREAM: flags.FEATURE_AGENT_V2_STREAM,
  FEATURE_MCP_INTEGRATION: flags.FEATURE_MCP_INTEGRATION,
};
