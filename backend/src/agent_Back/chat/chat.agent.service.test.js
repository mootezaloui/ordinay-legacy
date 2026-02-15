"use strict";

const assert = require("assert");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const { ChatAgentService } = require("./chat.agent.service");
const AgentLedgerService = require("../ledger/agent.ledger.service");
const { ToolRegistry, TOOL_CATEGORIES } = require("../tools/tool.registry");
const { ToolFirewall } = require("../tools/tool.firewall");

function createEngine() {
  const registry = new ToolRegistry();
  const ledger = new AgentLedgerService();
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);

  const storedProposals = [];
  const transcriptTurns = [];

  const baseObjectOutputSchema = {
    type: "object",
    additionalProperties: true,
  };

  registry.register({
    name: "listTasks",
    category: TOOL_CATEGORIES.READ,
    description: "List tasks by status",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async (params) => ({
      items: [{ id: 1, status: params.status || "open" }, { id: 2, status: "open" }],
      count: 2,
    }),
  });

  registry.register({
    name: "detectOverdueTasks",
    category: TOOL_CATEGORIES.ANALYSIS,
    description: "Analyze overdue tasks",
    inputSchema: {
      type: "object",
      properties: {
        includeBlocked: { type: "boolean" },
      },
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async () => ({
      overdueCount: 3,
      criticalCount: 1,
    }),
  });

  registry.register({
    name: "getDossier",
    category: TOOL_CATEGORIES.READ,
    description: "Get a dossier",
    inputSchema: {
      type: "object",
      properties: {
        dossierId: { type: "integer", minimum: 1 },
      },
      required: ["dossierId"],
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async (params) => ({
      id: params.dossierId,
      reference: "DOS-2026-001",
    }),
  });

  registry.register({
    name: "universalMutation",
    category: TOOL_CATEGORIES.EXECUTE,
    description: "Create mutation proposal",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["UPDATE_ENTITY"] },
        params: {
          type: "object",
          properties: {
            entityType: { type: "string", enum: ["task", "dossier"] },
            entityId: { type: "integer", minimum: 1 },
            changes: { type: "object", additionalProperties: true },
          },
          required: ["entityType", "entityId", "changes"],
          additionalProperties: false,
        },
      },
      required: ["operation", "params"],
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: true,
    sideEffects: true,
    allowedAgentVersions: ["v3"],
    confirmationRequired: true,
    handler: async (params) => ({
      proposalId: `prop_${params.params.entityId}`,
      status: "PROPOSED",
      actionType: params.operation,
      requiresConfirmation: true,
      humanReadableSummary: "Update entity",
      params: params.params,
      posture: "WORK",
      version: "v3",
      snapshot: {
        scope: params.params.entityType,
        scopeId: params.params.entityId,
        hash: "sha256:test",
      },
    }),
  });

  const engine = {
    ajv,
    ledger,
    toolRegistry: registry,
    toolFirewall: new ToolFirewall({ registry, ledger }),
    contextStore: {
      getContextForLLMInjection: () => ({ recentTurns: [], posture: null }),
      _transcriptStore: {
        updateOrAddTurn: (_conversationId, _userId, turn) => {
          transcriptTurns.push(turn);
        },
      },
      _operationalStore: { update: () => {} },
    },
    _resolvePolicy: () => ({
      version: "v3",
      allowedToolCategories: ["read", "analysis", "draft", "execute", "research"],
      allowExecution: true,
      requirePosture: "WORK",
    }),
    async executeToolV2(toolName, params, policy, context = {}) {
      const permission = this.toolFirewall.checkPermission({
        toolName,
        policy,
        context,
        params,
      });
      if (!permission.permitted) {
        const err = new Error(permission.message);
        err.reason = permission.reason;
        throw err;
      }

      const tool = this.toolRegistry.get(toolName);
      const result = await tool.handler(params, context);
      this.ledger.record({
        type: "tool_execution_v2",
        toolName,
        success: true,
      });
      return { result, trace: { toolName } };
    },
    storeProposal(proposal) {
      storedProposals.push(proposal);
    },
  };

  return {
    engine,
    storedProposals,
    transcriptTurns,
  };
}

function buildDataAccess(overrides = {}) {
  return {
    clients: true,
    dossiers: true,
    lawsuits: true,
    tasks: true,
    personalTasks: true,
    missions: true,
    sessions: true,
    financialEntries: true,
    notifications: true,
    history: true,
    documents: true,
    ...overrides,
  };
}

function createSequenceClient(responses) {
  let index = 0;
  return async () => {
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next;
  };
}

async function testReadToolUsage() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_1",
            type: "function",
            function: {
              name: "listTasks",
              arguments: JSON.stringify({ status: "open" }),
            },
          },
        ],
      },
      {
        role: "assistant",
        content: "Found 2 open tasks.",
        tool_calls: [],
      },
    ]),
  });

  const result = await service.run({
    message: "Show open tasks",
    sessionId: "s_read",
    context: {
      posture: "WORK",
      dataAccess: buildDataAccess(),
    },
  });

  assert.strictEqual(result.message, "Found 2 open tasks.");
  assert.strictEqual(result.toolExecutions.length, 1);
  assert.strictEqual(result.toolExecutions[0].ok, true);
  assert.strictEqual(result.toolExecutions[0].toolName, "listTasks");
}

async function testMultiStepToolChaining() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_1",
            type: "function",
            function: {
              name: "listTasks",
              arguments: JSON.stringify({ status: "open" }),
            },
          },
        ],
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_2",
            type: "function",
            function: {
              name: "detectOverdueTasks",
              arguments: JSON.stringify({ includeBlocked: true }),
            },
          },
        ],
      },
      {
        role: "assistant",
        content: "You have 2 open tasks and 3 overdue tasks.",
        tool_calls: [],
      },
    ]),
  });

  const result = await service.run({
    message: "Analyze my task status",
    sessionId: "s_chain",
    context: {
      posture: "WORK",
      dataAccess: buildDataAccess(),
    },
  });

  assert.strictEqual(result.toolExecutions.length, 2);
  assert.strictEqual(result.toolExecutions[0].toolName, "listTasks");
  assert.strictEqual(result.toolExecutions[1].toolName, "detectOverdueTasks");
}

async function testMutationCreatesProposal() {
  const { engine, storedProposals } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_mut",
            type: "function",
            function: {
              name: "universalMutation",
              arguments: JSON.stringify({
                operation: "UPDATE_ENTITY",
                params: {
                  entityType: "task",
                  entityId: 9,
                  changes: { status: "completed" },
                },
              }),
            },
          },
        ],
      },
      {
        role: "assistant",
        content: "I prepared a proposal. Please confirm it before execution.",
        tool_calls: [],
      },
    ]),
  });

  const result = await service.run({
    message: "Mark task 9 as completed",
    sessionId: "s_mut",
    context: {
      posture: "WORK",
      dataAccess: buildDataAccess(),
    },
  });

  assert.strictEqual(result.toolExecutions.length, 1);
  assert.strictEqual(result.toolExecutions[0].ok, true);
  assert.strictEqual(result.toolExecutions[0].result.requiresConfirmation, true);
  assert.strictEqual(storedProposals.length, 1);
  assert.strictEqual(storedProposals[0].proposalId, "prop_9");
}

async function testDisabledToolNotAccessible() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_denied",
            type: "function",
            function: {
              name: "getDossier",
              arguments: JSON.stringify({ dossierId: 1 }),
            },
          },
        ],
      },
      {
        role: "assistant",
        content: "Dossier access is disabled in your context panel.",
        tool_calls: [],
      },
    ]),
  });

  const result = await service.run({
    message: "Open dossier 1",
    sessionId: "s_denied",
    context: {
      posture: "WORK",
      dataAccess: buildDataAccess({ dossiers: false }),
    },
  });

  assert.strictEqual(
    result.availableTools.some((tool) => tool.name === "getDossier"),
    false,
  );
  assert.strictEqual(result.toolExecutions.length, 1);
  assert.strictEqual(result.toolExecutions[0].ok, false);
  assert.strictEqual(result.toolExecutions[0].error.code, "TOOL_NOT_EXPOSED");
}

async function testSchemaValidationFailure() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_bad_args",
            type: "function",
            function: {
              name: "listTasks",
              arguments: JSON.stringify({ status: 7 }),
            },
          },
        ],
      },
      {
        role: "assistant",
        content: "I could not run that call because the arguments were invalid.",
        tool_calls: [],
      },
    ]),
  });

  const result = await service.run({
    message: "List tasks",
    sessionId: "s_bad_schema",
    context: {
      posture: "WORK",
      dataAccess: buildDataAccess(),
    },
  });

  assert.strictEqual(result.toolExecutions.length, 1);
  assert.strictEqual(result.toolExecutions[0].ok, false);
  assert.strictEqual(
    result.toolExecutions[0].error.code,
    "TOOL_ARGUMENTS_SCHEMA_INVALID",
  );
}

async function run() {
  await testReadToolUsage();
  await testMultiStepToolChaining();
  await testMutationCreatesProposal();
  await testDisabledToolNotAccessible();
  await testSchemaValidationFailure();
  console.log("chat.agent.service tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

