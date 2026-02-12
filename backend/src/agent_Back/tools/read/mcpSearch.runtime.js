'use strict';

const { MCPClient, MCP_CALL_MODE } = require('../../mcp/mcp.client');

const SERVER_NAME = process.env.MCP_WEBSEARCH_SERVER_NAME || 'websearch';
const SERVER_ENDPOINT = process.env.MCP_WEBSEARCH_ENDPOINT || 'http://localhost:3100';
const SERVER_TRANSPORT = process.env.MCP_WEBSEARCH_TRANSPORT || 'http';

let sharedClient = null;
let connectPromise = null;

function getClient() {
  if (!sharedClient) {
    sharedClient = new MCPClient({
      timeout: parseInt(process.env.MCP_TIMEOUT || '15000', 10),
    });
    sharedClient.registerServer({
      name: SERVER_NAME,
      transport: SERVER_TRANSPORT,
      endpoint: SERVER_ENDPOINT,
      capabilities: ['tools'],
    });
  }
  return sharedClient;
}

async function ensureConnected() {
  const client = getClient();
  const status = client.getServerStatus(SERVER_NAME);
  if (status && status.state === 'connected') {
    return client;
  }
  if (!connectPromise) {
    connectPromise = client
      .connect(SERVER_NAME)
      .finally(() => {
        connectPromise = null;
      });
  }
  await connectPromise;
  return client;
}

async function callMcpSearchTool({ toolName, params }) {
  const client = await ensureConnected();
  const mcpToolId = `${SERVER_NAME}:${toolName}`;

  if (!client.getTool(mcpToolId)) {
    throw new Error(`MCP search tool '${mcpToolId}' is not available on server '${SERVER_NAME}'`);
  }

  const result = await client.callTool({
    mcpToolId,
    params,
    mode: MCP_CALL_MODE.READ_ONLY,
    context: {},
  });

  if (!result.success) {
    throw new Error(result.error || `MCP call failed for ${mcpToolId}`);
  }

  return result;
}

module.exports = {
  callMcpSearchTool,
};
