'use strict';

/**
 * Example: Agent Plan Using MCP
 *
 * This demonstrates how an agent plan can use MCP tools
 * while maintaining safety and citation requirements.
 *
 * SCENARIO:
 * User asks: "Research recent German case law about contract termination"
 *
 * The agent creates a plan that:
 * 1. Uses native READ tools for client context
 * 2. Uses MCP web search for external legal research
 * 3. Combines results with proper citations
 */

/**
 * Example plan structure showing MCP integration
 */
const EXAMPLE_PLAN = {
  planId: 'plan_example_001',
  query: 'Research recent German case law about contract termination',
  createdAt: '2026-02-05T10:00:00Z',

  // Plan metadata
  metadata: {
    agentVersion: 'v2',
    requiresMCP: true,
    mcpServers: ['websearch'],
  },

  // Plan steps
  steps: [
    // Step 1: Get current client context (native tool)
    {
      stepId: 'step_001',
      type: 'tool_call',
      tool: 'getClient',
      toolType: 'native',
      category: 'read',
      params: {
        clientId: 42,
      },
      purpose: 'Get client information for context',
      dependsOn: [],
    },

    // Step 2: Get active dossiers for legal context (native tool)
    {
      stepId: 'step_002',
      type: 'tool_call',
      tool: 'listDossiersForClient',
      toolType: 'native',
      category: 'read',
      params: {
        clientId: 42,
      },
      purpose: 'Get dossiers to understand legal context',
      dependsOn: ['step_001'],
    },

    // Step 3: Search legal databases via MCP (MCP tool)
    {
      stepId: 'step_003',
      type: 'tool_call',
      tool: 'mcp_websearch_search_legal',
      toolType: 'mcp',
      category: 'read',
      params: {
        query: 'Vertragskundigung Rechtsprechung BGH 2024 2025',
        jurisdiction: 'DE',
        documentType: 'case',
        limit: 10,
      },
      purpose: 'Search German legal databases for recent case law',
      dependsOn: [],
      mcpSource: {
        server: 'websearch',
        tool: 'search_legal',
      },
    },

    // Step 4: Search general web for legal commentary (MCP tool)
    {
      stepId: 'step_004',
      type: 'tool_call',
      tool: 'mcp_websearch_search_web',
      toolType: 'mcp',
      category: 'read',
      params: {
        query: 'Vertragskundigung aktuelle Urteile Kommentar',
        limit: 5,
        language: 'de',
      },
      purpose: 'Search web for legal commentary and analysis',
      dependsOn: [],
      mcpSource: {
        server: 'websearch',
        tool: 'search_web',
      },
    },

    // Step 5: Synthesize results (analysis step, no tool)
    {
      stepId: 'step_005',
      type: 'synthesis',
      purpose: 'Combine native data and MCP research into response',
      dependsOn: ['step_001', 'step_002', 'step_003', 'step_004'],
      outputType: 'explanation',
      citationRequired: true,
    },
  ],

  // Expected output structure
  expectedOutput: {
    type: 'explanation',
    sections: [
      {
        title: 'Client Context',
        source: 'native:getClient',
      },
      {
        title: 'Legal Research Results',
        source: 'mcp:websearch',
        citationRequired: true,
      },
      {
        title: 'Analysis',
        source: 'agent',
      },
    ],
  },
};

/**
 * Example execution result showing citations
 */
const EXAMPLE_EXECUTION_RESULT = {
  planId: 'plan_example_001',
  executedAt: '2026-02-05T10:00:15Z',
  success: true,

  stepResults: [
    {
      stepId: 'step_001',
      success: true,
      result: {
        client: {
          id: 42,
          name: 'Example GmbH',
          type: 'corporate',
        },
      },
      citation: null, // Native tools don't need external citation
    },
    {
      stepId: 'step_002',
      success: true,
      result: {
        dossiers: [
          { id: 101, reference: 'DOS-2024-001', type: 'contract_dispute' },
        ],
      },
      citation: null,
    },
    {
      stepId: 'step_003',
      success: true,
      result: {
        data: {
          query: 'Vertragskundigung Rechtsprechung BGH 2024 2025',
          totalResults: 42,
          results: [
            {
              title: 'BGH zur außerordentlichen Kundigung',
              citation: 'BGH, 12.03.2024 - I ZR 123/23',
              type: 'case',
              jurisdiction: 'DE',
              summary: 'Wichtige Entscheidung zur Kundigung...',
            },
          ],
        },
        citation: {
          source: 'mcp:websearch',
          tool: 'search_legal',
          timestamp: '2026-02-05T10:00:05Z',
          callDuration: 234,
        },
      },
    },
    {
      stepId: 'step_004',
      success: true,
      result: {
        data: {
          query: 'Vertragskundigung aktuelle Urteile Kommentar',
          totalResults: 1250000,
          results: [
            {
              title: 'Aktuelle Entwicklungen im Kundigungsrecht',
              url: 'https://example-legal-blog.de/kundigung-2024',
              snippet: 'Ubersicht uber aktuelle Urteile...',
            },
          ],
        },
        citation: {
          source: 'mcp:websearch',
          tool: 'search_web',
          timestamp: '2026-02-05T10:00:07Z',
          callDuration: 189,
        },
      },
    },
    {
      stepId: 'step_005',
      success: true,
      result: {
        type: 'explanation',
        content: 'Based on research, here are the key findings...',
      },
      citation: null,
    },
  ],

  // Final response with all citations
  response: {
    type: 'explanation',
    content: {
      summary: 'Research findings on German contract termination case law',
      sections: [
        {
          title: 'Client Context',
          content: 'For client Example GmbH with active contract dispute dossier...',
        },
        {
          title: 'Recent Case Law',
          content: 'Key recent decisions include BGH, 12.03.2024 - I ZR 123/23...',
        },
        {
          title: 'Legal Commentary',
          content: 'Current analysis suggests...',
        },
      ],
    },
    citations: [
      {
        source: 'mcp:websearch',
        tool: 'search_legal',
        query: 'Vertragskundigung Rechtsprechung BGH 2024 2025',
        timestamp: '2026-02-05T10:00:05Z',
      },
      {
        source: 'mcp:websearch',
        tool: 'search_web',
        query: 'Vertragskundigung aktuelle Urteile Kommentar',
        timestamp: '2026-02-05T10:00:07Z',
      },
    ],
  },
};

/**
 * Function to create a plan with MCP tools
 * This shows how the planner would construct such a plan
 */
function createMCPResearchPlan({ query, clientId, mcpServers = ['websearch'] }) {
  const plan = {
    planId: `plan_${Date.now()}`,
    query,
    createdAt: new Date().toISOString(),
    metadata: {
      agentVersion: 'v2',
      requiresMCP: mcpServers.length > 0,
      mcpServers,
    },
    steps: [],
  };

  // Add context steps (native tools)
  if (clientId) {
    plan.steps.push({
      stepId: `step_${plan.steps.length + 1}`,
      type: 'tool_call',
      tool: 'getClient',
      toolType: 'native',
      category: 'read',
      params: { clientId },
      purpose: 'Get client context',
      dependsOn: [],
    });
  }

  // Add MCP research steps
  if (mcpServers.includes('websearch')) {
    plan.steps.push({
      stepId: `step_${plan.steps.length + 1}`,
      type: 'tool_call',
      tool: 'mcp_websearch_search_legal',
      toolType: 'mcp',
      category: 'read',
      params: {
        query,
        jurisdiction: 'DE',
        documentType: 'all',
        limit: 10,
      },
      purpose: 'Search legal databases',
      dependsOn: [],
      mcpSource: {
        server: 'websearch',
        tool: 'search_legal',
      },
    });
  }

  // Add synthesis step
  plan.steps.push({
    stepId: `step_${plan.steps.length + 1}`,
    type: 'synthesis',
    purpose: 'Combine results into response',
    dependsOn: plan.steps.map(s => s.stepId),
    outputType: 'explanation',
    citationRequired: true,
  });

  return plan;
}

module.exports = {
  EXAMPLE_PLAN,
  EXAMPLE_EXECUTION_RESULT,
  createMCPResearchPlan,
};
