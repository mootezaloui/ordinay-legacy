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
    name: "getEntityGraph",
    category: TOOL_CATEGORIES.READ,
    description: "Get deterministic entity graph",
    inputSchema: {
      type: "object",
      properties: {
        entityType: { type: "string" },
        entityId: { type: "integer", minimum: 1 },
        depth: { type: "integer" },
        direction: { type: "string" },
      },
      required: ["entityType", "entityId"],
      additionalProperties: true,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async (params) => ({
      root: {
        type: params.entityType,
        id: params.entityId,
        title: "Divorce Case",
        reference: "DOS-2026-001",
        court: "Casablanca Court",
        status: "open",
        priority: "high",
        keyDates: { nextUpcoming: "2026-02-20T09:00:00.000Z" },
      },
      parents: {
        client: { id: 7, name: "Youssef Daly" },
      },
      children: {
        lawsuits: [{ id: 2, title: "Criminal Theft", status: "in_progress" }],
        tasks: [{ id: 124, title: "Review contract", status: "todo" }],
        missions: [],
        sessions: [],
        dossiers: [],
      },
      metrics: {
        totalDossiers: 0,
        totalLawsuits: 1,
        totalTasks: 1,
        totalMissions: 0,
        totalSessions: 0,
        overdueDeadlines: 1,
        upcomingWithin7Days: 1,
      },
    }),
  });

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
    name: "listDossiers",
    category: TOOL_CATEGORIES.READ,
    description: "List dossiers",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async (params) => {
      const all = [
        { id: 10, title: "Divorce Case", reference: "DOS-10" },
        { id: 11, title: "Commercial Case", reference: "DOS-11" },
      ];
      if (!params?.query) return { dossiers: all };
      const q = String(params.query).toLowerCase();
      return {
        dossiers: all.filter((d) => String(d.title).toLowerCase().includes(q)),
      };
    },
  });

  registry.register({
    name: "listLawsuits",
    category: TOOL_CATEGORIES.READ,
    description: "List lawsuits",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async () => ({
      lawsuits: [
        { id: 20, title: "Criminal Theft", reference: "LAW-20" },
        { id: 21, title: "Administrative Dispute", reference: "LAW-21" },
      ],
    }),
  });

  registry.register({
    name: "listSessions",
    category: TOOL_CATEGORIES.READ,
    description: "List sessions",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async () => ({
      sessions: [
        { id: 30, title: "Initial Hearing" },
        { id: 31, title: "Follow Up Hearing" },
      ],
    }),
  });

  registry.register({
    name: "listMissions",
    category: TOOL_CATEGORIES.READ,
    description: "List missions",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    outputSchema: baseObjectOutputSchema,
    reversibility: false,
    sideEffects: false,
    allowedAgentVersions: ["v3"],
    handler: async () => ({
      missions: [
        { id: 40, title: "Mission One" },
        { id: 41, title: "Mission Two" },
      ],
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
    async _callReadTool(toolName, params, policy) {
      const permission = this.toolFirewall.checkPermission({
        toolName,
        policy,
        context: { ...params, confirmed: true, dataAccess: buildDataAccess() },
        params,
      });
      if (!permission.permitted) {
        const err = new Error(permission.message);
        err.reason = permission.reason;
        throw err;
      }
      const tool = this.toolRegistry.get(toolName);
      return tool.handler(params || {});
    },
    async resolveEntity({ entityType, identifier, mode }) {
      const text = String(identifier || "").toLowerCase();
      if (entityType === "dossier" && mode === "id" && Number(identifier) === 10) {
        return { found: true, entityId: 10, entity: { id: 10, title: "Divorce Case" } };
      }
      if (entityType === "task" && mode === "id" && Number(identifier) === 9) {
        return { found: true, entityId: 9, entity: { id: 9, title: "Task 9" } };
      }
      if (entityType === "dossier" && text.includes("commercial")) {
        return { found: true, entityId: 11, entity: { id: 11, title: "Commercial Case" } };
      }
      if (entityType === "dossier" && text.includes("case")) {
        return {
          found: false,
          reason: "ambiguous",
          candidates: [
            { id: 10, name: "Divorce Case", score: 0.93 },
            { id: 11, name: "Commercial Case", score: 0.91 },
          ],
        };
      }
      if (entityType === "lawsuit" && text.includes("case")) {
        return {
          found: false,
          reason: "ambiguous",
          candidates: [
            { id: 20, name: "Criminal Theft", score: 0.92 },
            { id: 21, name: "Administrative Dispute", score: 0.88 },
          ],
        };
      }
      if (entityType === "task" && text.includes("task")) {
        return {
          found: false,
          reason: "ambiguous",
          candidates: [
            { id: 1, name: "Task A", score: 0.91 },
            { id: 2, name: "Task B", score: 0.89 },
          ],
        };
      }
      if (entityType === "session" && text.includes("hearing")) {
        return {
          found: false,
          reason: "ambiguous",
          candidates: [
            { id: 30, name: "Initial Hearing", score: 0.92 },
            { id: 31, name: "Follow Up Hearing", score: 0.86 },
          ],
        };
      }
      if (entityType === "mission" && text.includes("mission")) {
        return {
          found: false,
          reason: "ambiguous",
          candidates: [
            { id: 40, name: "Mission One", score: 0.92 },
            { id: 41, name: "Mission Two", score: 0.90 },
          ],
        };
      }
      return { found: false, reason: "not_found" };
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

  const mutationExecution = result.toolExecutions.find(
    (entry) => entry.toolName === "universalMutation",
  );
  assert.ok(mutationExecution, "Expected universalMutation execution");
  assert.strictEqual(mutationExecution.ok, true);
  assert.strictEqual(mutationExecution.result.requiresConfirmation, true);
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

async function testAmbiguousDossierReturnsContextSuggestion() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: async () => ({ role: "assistant", content: "unused", tool_calls: [] }),
  });
  const result = await service.run({
    message: "Show dossier case",
    sessionId: "s_amb_dossier",
    context: { posture: "WORK", dataAccess: buildDataAccess() },
  });
  assert.strictEqual(result.toolExecutions.length, 0);
  assert.ok(result.ambiguityArtifact);
  assert.strictEqual(result.ambiguityArtifact.type, "context_suggestion");
  assert.ok(result.ambiguityArtifact.suggestions.length >= 2);
}

async function testMissingDraftTargetReturnsSuggestion() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: async () => ({ role: "assistant", content: "unused", tool_calls: [] }),
  });
  const result = await service.run({
    message: "draft client email",
    sessionId: "s_missing_draft",
    context: { posture: "WORK", dataAccess: buildDataAccess() },
  });
  assert.ok(result.ambiguityArtifact);
  assert.strictEqual(result.ambiguityArtifact.entityType, "client");
}

async function testAmbiguousExecuteReturnsSuggestion() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: async () => ({ role: "assistant", content: "unused", tool_calls: [] }),
  });
  const result = await service.run({
    message: "update task task",
    sessionId: "s_amb_exec",
    context: { posture: "WORK", dataAccess: buildDataAccess() },
  });
  assert.ok(result.ambiguityArtifact);
  assert.strictEqual(result.ambiguityArtifact.entityType, "task");
}

async function testResolvedEntityScopeContinuesToolCalls() {
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
      { role: "assistant", content: "ok", tool_calls: [] },
    ]),
  });
  const result = await service.run({
    message: "show dossier commercial",
    sessionId: "s_resolved_scope",
    context: { posture: "WORK", dataAccess: buildDataAccess() },
  });
  assert.strictEqual(result.ambiguityArtifact, null);
  assert.ok(result.toolExecutions.length >= 1);
  assert.ok(
    result.toolExecutions.some((entry) => entry.toolName === "listTasks"),
  );
}

async function testAmbiguousEntityVariants() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: async () => ({ role: "assistant", content: "unused", tool_calls: [] }),
  });
  const scenarios = [
    { message: "show lawsuit case", expected: "lawsuit" },
    { message: "show session hearing", expected: "session" },
    { message: "show mission mission", expected: "mission" },
  ];
  for (const scenario of scenarios) {
    const result = await service.run({
      message: scenario.message,
      sessionId: `s_var_${scenario.expected}`,
      context: { posture: "WORK", dataAccess: buildDataAccess() },
    });
    assert.ok(result.ambiguityArtifact);
    assert.strictEqual(result.ambiguityArtifact.entityType, scenario.expected);
  }
}

async function testResolvedFollowUpSelectionSkipsAmbiguity() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_followup",
            type: "function",
            function: {
              name: "listTasks",
              arguments: JSON.stringify({ status: "open" }),
            },
          },
        ],
      },
      { role: "assistant", content: "Focused on selected dossier.", tool_calls: [] },
    ]),
  });

  const result = await service.run({
    message: "Divorce Case",
    followUpIntent: {
      intent: "RESOLVE_CONTEXT_AND_CONTINUE",
      originalIntent: "READ_DOSSIER",
      originalMessage: "show dossier divorce case",
      resolvedEntity: { type: "dossier", id: 10, label: "Divorce Case" },
      scope: { dossierId: 10 },
    },
    sessionId: "s_followup_selected",
    context: { posture: "WORK", dataAccess: buildDataAccess() },
  });

  assert.strictEqual(result.ambiguityArtifact, null);
  assert.ok(result.toolExecutions.length >= 1);
  assert.ok(
    result.toolExecutions.some((entry) => entry.toolName === "listTasks"),
  );
  assert.strictEqual(result.resolutionMeta.chosenId, 10);
}

async function testResolvedSelectionForcesGroundedAnswerWhenLlmIsAmbiguous() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "I need the exact entity before I can continue.",
        tool_calls: [],
      },
    ]),
  });

  const result = await service.run({
    message: "Divorce Case",
    followUpIntent: {
      intent: "RESOLVE_CONTEXT_AND_CONTINUE",
      originalIntent: "READ_DOSSIER",
      originalMessage: "show dossier divorce case",
      resolvedEntity: { type: "dossier", id: 10, label: "Divorce Case" },
      scope: { dossierId: 10 },
    },
    sessionId: "s_followup_grounded",
    context: { posture: "WORK", dataAccess: buildDataAccess() },
  });

  assert.strictEqual(result.ambiguityArtifact, null);
  assert.match(result.message, /Divorce Case/i);
  assert.match(result.message, /Reference:\s+DOS-2026-001/i);
  assert.match(result.message, /Client:\s+Youssef Daly/i);
  assert.match(result.message, /Related:/i);
}

async function testDraftPlaceholderResponseIsAllowedWhenDataMissing() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content:
          "Subject: Official Request\nDear Court,\n[اسم المحامي]\ninsert here\n[رقم رخصة المحاماة]",
        tool_calls: [],
      },
    ]),
  });

  const result = await service.run({
    message: "write an email update",
    sessionId: "s_placeholder_block",
    context: {
      posture: "WORK",
      clientId: 7,
      dataAccess: buildDataAccess(),
    },
  });

  assert.match(result.message, /\[اسم المحامي\]/i);
  assert.match(result.message, /\[رقم رخصة المحاماة\]/i);
}

async function testMissingLegalArticleDoesNotBlockDraft() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content: "unused",
        tool_calls: [],
      },
    ]),
  });

  service._getOperatorDraftIdentity = () => ({
    profile: {
      lawyerName: "Amina El Idrissi",
      licenseNumber: "BAR-5541",
      officeAddress: "12 Rue Example, Casablanca",
      contactEmail: "amina@example.com",
      contactPhone: "+212600000000",
      officeName: "Cabinet Amina",
    },
    missing: [],
  });

  const result = await service.run({
    message: "Draft an official court motion and cite a legal article for dossier 10",
    sessionId: "s_missing_legal_article",
    context: {
      posture: "WORK",
      dossierId: 10,
      dataAccess: buildDataAccess(),
    },
  });

  assert.strictEqual(result.message, "unused");
  assert.strictEqual(result.rounds, 1);
}

async function testDraftAttemptWithoutGroundingIsBlocked() {
  const { engine } = createEngine();
  const service = new ChatAgentService({
    engine,
    llmClient: createSequenceClient([
      {
        role: "assistant",
        content:
          "Dear Client,\nPlease find below the draft regarding your matter.",
        tool_calls: [],
      },
    ]),
  });

  service._runDeterministicGrounding = async () => null;

  const result = await service.run({
    message: "write an email update",
    sessionId: "s_draft_blocked",
    context: {
      posture: "WORK",
      clientId: 7,
      dataAccess: buildDataAccess(),
    },
  });

  assert.match(result.message, /cannot draft this yet/i);
  assert.strictEqual(result.rounds, 0);
}

async function run() {
  await testReadToolUsage();
  await testMultiStepToolChaining();
  await testMutationCreatesProposal();
  await testDisabledToolNotAccessible();
  await testSchemaValidationFailure();
  await testAmbiguousDossierReturnsContextSuggestion();
  await testMissingDraftTargetReturnsSuggestion();
  await testAmbiguousExecuteReturnsSuggestion();
  await testResolvedEntityScopeContinuesToolCalls();
  await testAmbiguousEntityVariants();
  await testResolvedFollowUpSelectionSkipsAmbiguity();
  await testResolvedSelectionForcesGroundedAnswerWhenLlmIsAmbiguous();
  await testDraftPlaceholderResponseIsAllowedWhenDataMissing();
  await testMissingLegalArticleDoesNotBlockDraft();
  await testDraftAttemptWithoutGroundingIsBlocked();
  console.log("chat.agent.service tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
