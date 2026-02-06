'use strict';

// Force LLM calls to fail fast for deterministic harness runs
process.env.LLM_BASE_URL = 'http://127.0.0.1:9';
process.env.LLM_TIMEOUT = '200';
process.env.LLM_INTENT_FRAMING_TIMEOUT = '200';

const AgentEngine = require('../agent.engine');
const { ToolRegistry, TOOL_CATEGORIES } = require('../tools/tool.registry');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function assert(condition, message) {
  if (!condition) {
    log(`✗ FAILED: ${message}`, 'red');
    throw new Error(`Assertion failed: ${message}`);
  }
  log(`✓ PASSED: ${message}`, 'green');
}

function registerReadTool(registry, name, handler) {
  registry.register({
    name,
    category: TOOL_CATEGORIES.READ,
    description: `Harness stub for ${name}`,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    reversibility: true,
    sideEffects: false,
    allowedAgentVersions: ['v1', 'v2', 'v3'],
    handler,
  });
}

async function runHarness() {
  log('\n=== AGENT ENGINE REFACTOR HARNESS ===\n', 'cyan');

  const registry = new ToolRegistry();

  const clients = [
    { id: 1, name: 'Alice Smith', status: 'active', email: 'alice@example.com' },
    { id: 2, name: 'Bob Smith', status: 'inactive', email: 'bob@example.com' },
    { id: 3, name: 'Carla Jones', status: 'active', email: 'carla@example.com' },
  ];

  const dossiers = [
    { id: 10, reference: 'D-2024-001', title: 'Contract Review', status: 'open', priority: 'high', client_id: 1 },
    { id: 11, reference: 'D-2024-002', title: 'Lease Dispute', status: 'open', priority: 'medium', client_id: 1 },
    { id: 12, reference: 'D-2023-003', title: 'IP Filing', status: 'closed', priority: 'low', client_id: 3 },
  ];

  registerReadTool(registry, 'listClients', async ({ query = null, status = null, limit = 50 } = {}) => {
    let list = [...clients];
    if (status) {
      const normalized = String(status).toLowerCase();
      list = list.filter((client) => String(client.status || '').toLowerCase() === normalized);
    }
    if (query) {
      const normalizedQuery = String(query).toLowerCase();
      list = list.filter((client) =>
        String(client.name || '').toLowerCase().includes(normalizedQuery) ||
        String(client.email || '').toLowerCase().includes(normalizedQuery)
      );
    }
    const trimmed = list.slice(0, limit);
    return { clients: trimmed, count: trimmed.length };
  });

  registerReadTool(registry, 'getClient', async ({ clientId }) => {
    const client = clients.find((c) => c.id === clientId) || null;
    return { client };
  });

  registerReadTool(registry, 'listDossiers', async ({ clientId = null, limit = 50, status = null, query = null } = {}) => {
    let list = [...dossiers];
    if (clientId) {
      list = list.filter((dossier) => dossier.client_id === clientId);
    }
    if (status) {
      const normalized = String(status).toLowerCase();
      list = list.filter((dossier) => String(dossier.status || '').toLowerCase() === normalized);
    }
    if (query) {
      const normalizedQuery = String(query).toLowerCase();
      list = list.filter((dossier) =>
        String(dossier.reference || '').toLowerCase().includes(normalizedQuery) ||
        String(dossier.title || '').toLowerCase().includes(normalizedQuery)
      );
    }
    const trimmed = list.slice(0, limit);
    return { dossiers: trimmed, count: trimmed.length };
  });

  registerReadTool(registry, 'webSearch', async ({ query, category = 'general' } = {}) => {
    return {
      query,
      category,
      resultCount: 2,
      results: [
        {
          title: `Result A for ${query}`,
          snippet: 'Web result snippet A',
          url: 'https://example.com/a',
          source: 'example',
        },
        {
          title: `Result B for ${query}`,
          snippet: 'Web result snippet B',
          url: 'https://example.com/b',
          source: 'example',
        },
      ],
      citations: [
        { index: 1, source: 'example', url: 'https://example.com/a', accessedAt: new Date().toISOString() },
        { index: 2, source: 'example', url: 'https://example.com/b', accessedAt: new Date().toISOString() },
      ],
      searchMeta: { provider: 'harness', searchTime: 1, timestamp: new Date().toISOString() },
    };
  });

  registerReadTool(registry, 'legalResearch', async ({ query, researchType = 'comprehensive' } = {}) => {
    return {
      query,
      researchType,
      jurisdiction: 'DE',
      resultCount: 2,
      primarySources: [{ id: '1', title: `Primary source for ${query}` }],
      citations: [
        { index: 1, source: 'BGH', title: `Citation A for ${query}`, url: 'https://example.com/legal-a' },
        { index: 2, source: 'BAG', title: `Citation B for ${query}`, url: 'https://example.com/legal-b' },
      ],
      uncertainties: [],
      researchMeta: { sourcesSearched: ['bgh'], searchTime: 1, timestamp: new Date().toISOString() },
    };
  });

  const engine = new AgentEngine({ toolRegistry: registry });

  const baseContext = {
    dataAccess: {
      documents: false,
    },
  };

  log('Scenario 1: Show client Alice Smith', 'blue');
  const showClient = await engine.run({
    message: 'Show client Alice Smith',
    context: baseContext,
    agentVersion: 'v1',
  });
  assert(showClient.intent === 'READ_DATA', 'Show client routes through read intent');
  assert(showClient.output.type === 'explanation', 'Show client returns explanation output');
  assert(
    typeof showClient.output.facts?.summary === 'string' &&
      showClient.output.facts.summary.includes('Alice Smith'),
    'Show client includes client summary',
  );

  log('Scenario 2: List dossiers for client Alice Smith', 'blue');
  const listDossiers = await engine.run({
    message: 'List dossiers',
    context: {
      ...baseContext,
      scope: 'client',
      clientId: 1,
    },
    agentVersion: 'v1',
  });
  assert(listDossiers.intent === 'READ_DATA', 'List dossiers routes through read intent');
  assert(
    Array.isArray(listDossiers.output.facts?.details) &&
      listDossiers.output.facts.details.some((line) => String(line).includes('D-2024-001')),
    'List dossiers includes dossier references',
  );

  log('Scenario 3: Ambiguous entity resolution', 'blue');
  const ambiguous = await engine.run({
    message: 'Show client Smith',
    context: baseContext,
    agentVersion: 'v1',
  });
  assert(ambiguous.intent === 'READ_DATA', 'Ambiguous client routes through read intent');
  assert(
    typeof ambiguous.output.facts?.summary === 'string' &&
      ambiguous.output.facts.summary.toLowerCase().includes('multiple'),
    'Ambiguous resolution yields clarification summary',
  );

  log('Scenario 4: LLM unavailable fallback', 'blue');
  const chat = await engine.run({
    message: 'Hello there',
    context: baseContext,
    agentVersion: 'v1',
  });
  assert(chat.output.type === 'chat', 'Chat intent returns chat output');
  assert(chat.output.source === 'fallback', 'Chat falls back when LLM unavailable');

  log('Scenario 5: Explicit web search', 'blue');
  const webSearch = await engine.run({
    message: 'Search the web for labor law updates',
    context: baseContext,
    agentVersion: 'v1',
  });
  assert(webSearch.intent === 'READ_DATA', 'Web search routes through read intent');
  assert(webSearch.output.entityType === 'web_search', 'Web search is explicitly attributed');
  assert(
    String(webSearch.output.facts?.summary || '').includes('Web Search executed'),
    'Web search summary states explicit web search execution',
  );

  log('Scenario 6: Explicit deep search', 'blue');
  const deepSearch = await engine.run({
    message: 'Do a deep search on wrongful termination jurisprudence',
    context: baseContext,
    agentVersion: 'v1',
  });
  assert(deepSearch.intent === 'READ_DATA', 'Deep search routes through read intent');
  assert(deepSearch.output.entityType === 'deep_search', 'Deep search is explicitly attributed');
  assert(
    String(deepSearch.output.facts?.summary || '').includes('Deep Search executed'),
    'Deep search summary states explicit deep search execution',
  );

  log('\nAll harness scenarios passed.\n', 'green');
}

runHarness().catch((err) => {
  log(`\nHarness failed: ${err.message}`, 'red');
  process.exitCode = 1;
});
