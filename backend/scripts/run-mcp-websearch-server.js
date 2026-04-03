'use strict';

const express = require('express');
const { createWebSearchMCPServer } = require('../src/agent/mcp/servers/websearch.server');

const app = express();
const server = createWebSearchMCPServer();
const port = parseInt(process.env.MCP_WEBSEARCH_PORT || '3100', 10);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'mock-mcp-websearch' });
});

app.post('/mcp/tools/list', (_req, res) => {
  try {
    const result = server.handleToolsList();
    res.json({ jsonrpc: '2.0', id: 1, result });
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: error.message || 'tools/list failed' },
    });
  }
});

app.post('/mcp/tools/call', async (req, res) => {
  try {
    const body = req.body || {};
    const params = body.params || {};
    const toolName = params.name;
    const args = params.arguments || {};
    const result = await server.handleToolsCall({ name: toolName, arguments: args });
    res.json({ jsonrpc: '2.0', id: body.id || 1, result });
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: (req.body && req.body.id) || 1,
      error: { code: -32000, message: error.message || 'tools/call failed' },
    });
  }
});

app.listen(port, () => {
  console.log(`[MCP] Mock websearch server listening on http://localhost:${port}`);
  console.log('[MCP] Endpoints: POST /mcp/tools/list, POST /mcp/tools/call, GET /health');
});
