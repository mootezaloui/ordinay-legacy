'use strict';

/**
 * Example: MCP Integration with Agent Engine
 *
 * This demonstrates how to integrate MCP into the existing agent system.
 * The integration is minimal and non-invasive.
 *
 * USAGE:
 * 1. Initialize MCP integration
 * 2. Connect to MCP servers
 * 3. Register MCP tools as native tools
 * 4. Use through normal agent.callTool() interface
 */

const { initializeMCPIntegration } = require('../index');
const { WEBSEARCH_SERVER_CONFIG, createWebSearchMCPServer } = require('../servers/websearch.server');

/**
 * Example: Initialize MCP with the agent engine
 *
 * This shows how to add MCP support to an existing AgentEngine instance.
 */
async function setupMCPWithAgent(agentEngine) {
  // Initialize MCP integration using agent's existing components
  const mcp = initializeMCPIntegration({
    toolRegistry: agentEngine.toolRegistry,
    ledger: agentEngine.ledger,
    clientOptions: {
      timeout: 30000,
    },
  });

  // Connect to the web search MCP server
  try {
    await mcp.connectServer(WEBSEARCH_SERVER_CONFIG);
    console.log('[MCP] Connected to websearch server');

    // Register all MCP tools as native tools
    const registeredTools = mcp.registerServerTools('websearch');
    console.log(`[MCP] Registered ${registeredTools.length} tools from websearch`);

    return mcp;
  } catch (error) {
    console.error('[MCP] Failed to connect:', error.message);
    throw error;
  }
}

/**
 * Example: Using MCP tools through the agent
 *
 * After MCP tools are registered, they're called like any other tool.
 */
async function exampleMCPToolUsage(agentEngine, policy) {
  // MCP tools are prefixed with mcp_{server}_{tool}
  const toolName = 'mcp_websearch_search_legal';

  // Check if the MCP tool is available
  const tool = agentEngine.toolRegistry.get(toolName);
  if (!tool) {
    console.log(`[Example] MCP tool ${toolName} not registered`);
    return null;
  }

  console.log(`[Example] Found MCP tool: ${tool.name}`);
  console.log(`[Example] Category: ${tool.category}`);
  console.log(`[Example] Description: ${tool.description}`);

  // Call the tool through the normal interface
  try {
    const result = await agentEngine.callTool(
      toolName,
      {
        query: 'Mietrecht Kundigung BGH 2024',
        jurisdiction: 'DE',
        documentType: 'case',
        limit: 5,
      },
      policy,
      {} // context
    );

    console.log('[Example] MCP tool result:');
    console.log('  - Executed:', result.executed);
    console.log('  - Has citation:', !!result.result?.citation);

    if (result.result?.citation) {
      console.log('  - Citation source:', result.result.citation.source);
      console.log('  - Citation tool:', result.result.citation.tool);
    }

    return result;
  } catch (error) {
    console.error('[Example] MCP tool call failed:', error.message);
    throw error;
  }
}

/**
 * Example: Complete integration workflow
 */
async function runCompleteExample() {
  // This would be called with actual AgentEngine and policy instances
  console.log('='.repeat(60));
  console.log('MCP Integration Example');
  console.log('='.repeat(60));

  console.log(`
STEPS TO INTEGRATE MCP:

1. Import MCP module in agent engine setup:
   const { initializeMCPIntegration } = require('./mcp');

2. Initialize MCP after agent engine creation:
   const mcp = initializeMCPIntegration({
     toolRegistry: agentEngine.toolRegistry,
     ledger: agentEngine.ledger,
   });

3. Connect to MCP servers on startup:
   await mcp.connectServer(WEBSEARCH_SERVER_CONFIG);

4. Register MCP tools as native tools:
   mcp.registerServerTools('websearch');

5. Use MCP tools through normal agent interface:
   const result = await agentEngine.callTool(
     'mcp_websearch_search_legal',
     { query: 'legal query', jurisdiction: 'DE' },
     policy,
     context
   );

6. Results include citations:
   result.result.citation = {
     source: 'mcp:websearch',
     tool: 'search_legal',
     timestamp: '2026-02-05T...'
   }

KEY SAFETY FEATURES:
- MCP tools registered as READ category (safe)
- Execution blocked in v1/v2 (requires v3 for side effects)
- All calls logged via ledger
- Results always include source citations
`);
}

// Run example if called directly
if (require.main === module) {
  runCompleteExample().catch(console.error);
}

module.exports = {
  setupMCPWithAgent,
  exampleMCPToolUsage,
  runCompleteExample,
};
