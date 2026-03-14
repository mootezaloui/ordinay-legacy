const path = require("node:path");
const { getAgentConfig, getDeploymentState } = require("../agent/deployment");

function resolveDeploymentConfig() {
  const state = getDeploymentState();
  if (state && state.config) {
    return state.config;
  }
  return getAgentConfig(process.env, { cwd: path.resolve(__dirname, "..", "..") });
}

const dbFile = resolveDeploymentConfig().db.file;

module.exports = {
  dbFile,
};
