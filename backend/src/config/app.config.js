const path = require("node:path");
const { getAgentConfig, getDeploymentState } = require("../agent/deployment");

function resolveDeploymentConfig() {
  const state = getDeploymentState();
  if (state && state.config) {
    return state.config;
  }
  return getAgentConfig(process.env, { cwd: path.resolve(__dirname, "..", "..") });
}

const deploymentConfig = resolveDeploymentConfig();
const apiPrefix = deploymentConfig.app.apiPrefix;
const port = Number(deploymentConfig.app.port);
const env = deploymentConfig.app.nodeEnv;

module.exports = {
  apiPrefix,
  port,
  env,
};
