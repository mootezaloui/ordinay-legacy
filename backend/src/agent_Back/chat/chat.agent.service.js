"use strict";

const { TOOL_DOMAIN_MAP } = require("../tools/tool.firewall");
const { generateToolCallingTurn, generateChatResponse } = require("../llm.client");
const { resolveInteractionPosture, POSTURES } = require("../posture.resolver");
const { filterToolsForChat } = require("./chat.tool.exposure");

const MAX_TOOL_ROUNDS = Math.max(
  1,
  parseInt(process.env.AGENT_CHAT_MAX_TOOL_ROUNDS || "8", 10),
);
const MAX_COMPLETION_TOKENS = Math.max(
  256,
  parseInt(process.env.AGENT_CHAT_MAX_COMPLETION_TOKENS || "1400", 10),
);
const TOOL_STEP_COMMENTARY_ENABLED =
  process.env.AGENT_CHAT_TOOL_STEP_COMMENTARY !== "false";
const ENTITY_FOCUS_PATTERN =
  /\b(client|dossier|lawsuit|task|mission)\s*(#\s*\d+|\d+)\b/i;
const ENTITY_NAMED_PATTERN =
  /\b(our|this|that|my)\s+(client|dossier|lawsuit|task|mission)\b|\b(client|dossier|lawsuit|task|mission)\s+([A-Za-z\u00C0-\u024F\u0600-\u06FF][^?.,!\n]{1,60})/i;

function toErrorCode(message, fallback = "TOOL_EXECUTION_FAILED") {
  const raw = String(message || "").trim();
  if (!raw) return fallback;
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80) || fallback;
}

class ChatAgentService {
  constructor({ engine, llmClient, maxToolRounds, maxCompletionTokens } = {}) {
    if (!engine) {
      throw new Error("ChatAgentService requires an engine instance");
    }
    this.engine = engine;
    this.ajv = engine.ajv;
    this.llmClient = llmClient || generateToolCallingTurn;
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
    this.maxCompletionTokens = maxCompletionTokens || MAX_COMPLETION_TOKENS;
  }

  async run({
    message,
    context = {},
    sessionId,
    agentVersion = "v3",
    metadata = {},
    userId = null,
    tenantId = null,
    signal,
  } = {}) {
    const userMessage = String(message || "").trim();
    if (!userMessage) {
      const error = new Error("Message is required");
      error.status = 400;
      throw error;
    }

    const policy = this.engine._resolvePolicy(agentVersion);
    const requestContext = {
      ...(context || {}),
      conversationId:
        context?.conversationId || context?.agentSessionId || sessionId || undefined,
      userId: context?.userId || userId || "default",
      tenantId: context?.tenantId || tenantId || null,
      requestMetadata:
        metadata && typeof metadata === "object" ? { ...metadata } : undefined,
    };
    const llmHistory =
      typeof this.engine.contextStore?.getContextForLLMInjection === "function"
        ? this.engine.contextStore.getContextForLLMInjection(requestContext)
        : {};
    const posture = await this._resolvePosture({
      message: userMessage,
      context: requestContext,
      llmHistory,
    });

    const executionContext = {
      ...requestContext,
      posture,
      confirmed: true,
      sessionId: sessionId || null,
      dataAccess:
        requestContext.dataAccess && typeof requestContext.dataAccess === "object"
          ? requestContext.dataAccess
          : {},
    };

    const allExposedTools = this._buildExposedTools(policy, executionContext);
    const exposedTools = this._selectToolsForMessage(
      userMessage,
      allExposedTools,
    );
    const messages = this._buildModelMessages({
      userMessage,
      llmHistory,
      posture,
      requestContext,
      exposedTools,
    });
    const toolExecutions = [];
    const deterministicGrounding = await this._runDeterministicGrounding({
      userMessage,
      exposedTools,
      policy,
      executionContext,
    });
    if (deterministicGrounding?.snapshot) {
      messages.push({
        role: "system",
        content: `Authoritative grounding snapshot (do not contradict): ${JSON.stringify(deterministicGrounding.snapshot)}`,
      });
      toolExecutions.push(deterministicGrounding.execution);
    }

    this.engine.ledger.record({
      type: "chat_mode_run_started",
      agentVersion: policy.version,
      posture,
      conversationId: requestContext.conversationId || null,
      toolCount: exposedTools.length,
      timestamp: new Date().toISOString(),
    });

    let finalMessage = "";
    let rounds = 0;
    const stepCommentaries = [];

    while (rounds < this.maxToolRounds) {
      rounds += 1;
      const assistant = await this.llmClient({
        messages,
        tools: exposedTools.map((tool) => tool.definition),
        signal,
        maxTokens: this.maxCompletionTokens,
      });

      const toolCalls = Array.isArray(assistant?.tool_calls)
        ? assistant.tool_calls
        : [];
      if (!toolCalls.length) {
        finalMessage = String(assistant?.content || "").trim();
        break;
      }

      messages.push({
        role: "assistant",
        content: String(assistant?.content || ""),
        tool_calls: toolCalls,
      });

      for (let index = 0; index < toolCalls.length; index += 1) {
        const call = toolCalls[index];
        const execution = await this._executeToolCall({
          call,
          policy,
          executionContext,
          exposedTools,
          stepIndex: toolExecutions.length + index,
        });
        toolExecutions.push(execution);
        if (TOOL_STEP_COMMENTARY_ENABLED) {
          const toolStepCommentary = await this._generateToolStepCommentary({
            userMessage,
            execution,
            stepIndex: toolExecutions.length,
          });
          if (toolStepCommentary) {
            stepCommentaries.push({
              stepIndex: toolExecutions.length,
              toolName: execution.toolName,
              message: toolStepCommentary,
              source: "llm",
              kind: "tool_step",
            });
          }
        }
        messages.push({
          role: "tool",
          tool_call_id: call?.id || `tool_${rounds}_${index}`,
          content: JSON.stringify(execution.responseForModel),
        });
      }
    }

    if (!finalMessage) {
      finalMessage =
        "I completed the available tool calls but could not produce a final response.";
    }
    finalMessage = this._applyGroundingSafety({
      userMessage,
      finalMessage,
      deterministicGrounding,
      toolExecutions,
    });

    this._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture,
      toolExecutions,
    });

    this.engine.ledger.record({
      type: "chat_mode_run_completed",
      agentVersion: policy.version,
      posture,
      conversationId: requestContext.conversationId || null,
      rounds,
      toolCalls: toolExecutions.length,
      timestamp: new Date().toISOString(),
    });

    return {
      message: finalMessage,
      agentVersion: policy.version,
      posture,
      toolExecutions,
      stepCommentaries,
      rounds,
      availableTools: exposedTools.map((tool) => ({
        name: tool.name,
        category: tool.category,
      })),
    };
  }

  _buildExposedTools(policy, executionContext) {
    const scoped = filterToolsForChat({
      engine: this.engine,
      policy,
      executionContext,
    });
    return scoped.map((tool) => ({
      name: tool.name,
      category: tool.category,
      schema: tool.schema,
      validate: this.ajv.compile(tool.schema),
      definition: {
        type: "function",
        function: {
          name: tool.name,
          description:
            String(this.engine.toolRegistry.get(tool.name)?.description || "").trim() ||
            tool.name,
          parameters: tool.schema,
        },
      },
    }));
  }

  _buildModelMessages({
    userMessage,
    llmHistory,
    posture,
    requestContext,
    exposedTools,
  }) {
    const systemInstruction = {
      mode: "CHATBOT_AGENT_MODE",
      requirements: [
        "You are the planner and tool caller.",
        "Use only exposed tools when needed; do not invent tools.",
        "Validate facts with tool results before answering.",
        "For entity-specific legal work, call getEntityGraph first to ground parent/child context before synthesis.",
        "For execute operations, call universalMutation to create proposals. Never claim execution happened.",
        "If a requested capability is unavailable, explain constraint briefly.",
      ],
      posture,
      allowedEntityScope: {
        clientId: requestContext.clientId || null,
        dossierId: requestContext.dossierId || null,
        lawsuitId: requestContext.lawsuitId || null,
        sessionId: requestContext.sessionId || null,
        taskId: requestContext.taskId || null,
      },
      dataAccess: requestContext.dataAccess || {},
      availableTools: exposedTools.map((tool) => ({
        name: tool.name,
        category: tool.category,
        domain: TOOL_DOMAIN_MAP[tool.name] || null,
      })),
      groundingPrimer: {
        preferredReadTool: "getEntityGraph",
        example: {
          tool: "getEntityGraph",
          args: {
            entityType: "dossier",
            entityId: 123,
            depth: 2,
            direction: "both",
          },
        },
      },
    };

    const messages = [
      {
        role: "system",
        content: `Return concise, user-facing responses.\n${JSON.stringify(systemInstruction)}`,
      },
    ];

    const turns = Array.isArray(llmHistory?.recentTurns) ? llmHistory.recentTurns : [];
    const recentTurns = turns.slice(-6);
    for (const turn of recentTurns) {
      if (turn?.userMessage) {
        messages.push({ role: "user", content: String(turn.userMessage) });
      }
      const assistantContent =
        turn?.agentOutput?.message || turn?.agentOutput?.summary || null;
      if (assistantContent) {
        messages.push({ role: "assistant", content: String(assistantContent) });
      }
    }

    messages.push({ role: "user", content: userMessage });
    return messages;
  }

  _selectToolsForMessage(userMessage, tools) {
    let list = Array.isArray(tools) ? tools : [];
    const hasMcpWebSearch = list.some((tool) => tool.name === "mcpWebSearch");
    const hasMcpDeepSearch = list.some((tool) => tool.name === "mcpDeepSearch");
    const hasMcpLegalSearch = list.some((tool) => tool.name === "mcpLegalSearch");
    if (hasMcpWebSearch) {
      list = list.filter((tool) => tool.name !== "webSearch");
    }
    if (hasMcpDeepSearch || hasMcpLegalSearch) {
      list = list.filter((tool) => tool.name !== "legalResearch");
    }
    const graphTool = list.find((tool) => tool.name === "getEntityGraph");
    if (list.length <= 12) {
      return graphTool
        ? [graphTool, ...list.filter((tool) => tool.name !== "getEntityGraph")]
        : list;
    }

    const text = String(userMessage || "").toLowerCase();
    const domainHints = [];
    if (/\bclient|clients|customer|customers\b/.test(text)) domainHints.push("clients");
    if (/\bdossier|dossiers|matter|matters|case|cases\b/.test(text))
      domainHints.push("dossiers");
    if (/\btask|tasks|todo|overdue\b/.test(text)) domainHints.push("tasks");
    if (/\bsession|sessions|hearing|hearings\b/.test(text))
      domainHints.push("sessions");
    if (/\blawsuit|lawsuits|litigation\b/.test(text))
      domainHints.push("lawsuits");
    if (/\bfinancial|invoice|invoices|payment|payments|billing\b/.test(text))
      domainHints.push("financialEntries");

    const filtered =
      domainHints.length > 0
        ? list.filter((tool) => {
            const domain = TOOL_DOMAIN_MAP[tool.name] || "";
            return domainHints.includes(domain);
          })
        : [];

    if (filtered.length > 0) {
      if (graphTool && !filtered.some((tool) => tool.name === "getEntityGraph")) {
        return [graphTool, ...filtered].slice(0, 12);
      }
      return filtered.slice(0, 12);
    }

    const preferred = list.filter((tool) => {
      const domain = TOOL_DOMAIN_MAP[tool.name] || "";
      return domain === "web" || domain === "legal";
    });
    if (preferred.length > 0) {
      const picked = [...preferred, ...list.filter((tool) => !preferred.includes(tool))];
      if (graphTool && !picked.some((tool) => tool.name === "getEntityGraph")) {
        return [graphTool, ...picked].slice(0, 12);
      }
      return picked.slice(0, 12);
    }
    if (graphTool) {
      return [graphTool, ...list.filter((tool) => tool.name !== "getEntityGraph")].slice(0, 12);
    }
    return list.slice(0, 12);
  }

  async _executeToolCall({
    call,
    policy,
    executionContext,
    exposedTools,
    stepIndex,
  }) {
    const toolName = String(call?.function?.name || "").trim();
    const exposed = exposedTools.find((tool) => tool.name === toolName);
    if (!exposed) {
      return {
        ok: false,
        toolName,
        error: {
          code: "TOOL_NOT_EXPOSED",
          message: `Tool '${toolName}' is not available in this context.`,
        },
        responseForModel: {
          ok: false,
          code: "TOOL_NOT_EXPOSED",
          message: `Tool '${toolName}' is not available in this context.`,
        },
      };
    }

    let args;
    try {
      const rawArgs = call?.function?.arguments;
      if (rawArgs && typeof rawArgs === "object") {
        args = rawArgs;
      } else {
        args = JSON.parse(String(rawArgs || "{}"));
      }
    } catch (_) {
      return {
        ok: false,
        toolName,
        error: {
          code: "TOOL_ARGUMENTS_INVALID_JSON",
          message: "Tool arguments must be valid JSON.",
        },
        responseForModel: {
          ok: false,
          code: "TOOL_ARGUMENTS_INVALID_JSON",
          message: "Tool arguments must be valid JSON.",
        },
      };
    }

    const valid = exposed.validate(args);
    if (!valid) {
      return {
        ok: false,
        toolName,
        args,
        error: {
          code: "TOOL_ARGUMENTS_SCHEMA_INVALID",
          message: "Tool arguments failed schema validation.",
          details: exposed.validate.errors || [],
        },
        responseForModel: {
          ok: false,
          code: "TOOL_ARGUMENTS_SCHEMA_INVALID",
          message: "Tool arguments failed schema validation.",
        },
      };
    }

    try {
      const v2Result = await this.engine.executeToolV2(
        toolName,
        args,
        policy,
        {
          ...executionContext,
          confirmed: true,
          planId: `chat_${Date.now()}`,
          stepIndex,
        },
      );
      const result = v2Result?.result;
      if (
        result &&
        typeof result === "object" &&
        result.proposalId &&
        result.requiresConfirmation === true &&
        typeof this.engine.storeProposal === "function"
      ) {
        this.engine.storeProposal(result, {
          conversationId: executionContext.conversationId || null,
          sessionId: executionContext.sessionId || null,
          userId: executionContext.userId || null,
          tenantId: executionContext.tenantId || null,
        });
      }

      this.engine.ledger.record({
        type: "chat_mode_tool_call",
        toolName,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return {
        ok: true,
        toolName,
        args,
        result,
        responseForModel: {
          ok: true,
          tool: toolName,
          result,
        },
      };
    } catch (error) {
      const code = toErrorCode(error?.reason || error?.message);
      const safeMessage =
        String(error?.message || "").trim() || "Tool execution failed.";
      this.engine.ledger.record({
        type: "chat_mode_tool_call",
        toolName,
        success: false,
        error: safeMessage,
        timestamp: new Date().toISOString(),
      });
      return {
        ok: false,
        toolName,
        args,
        error: {
          code,
          message: safeMessage,
        },
        responseForModel: {
          ok: false,
          code,
          message: safeMessage,
        },
      };
    }
  }

  _recordTranscript({
    requestContext,
    userMessage,
    finalMessage,
    posture,
    toolExecutions,
  }) {
    const conversationId = requestContext.conversationId;
    const userId = requestContext.userId || "default";
    const transcriptStore = this.engine.contextStore?._transcriptStore;
    if (
      transcriptStore &&
      typeof transcriptStore.updateOrAddTurn === "function" &&
      conversationId
    ) {
      transcriptStore.updateOrAddTurn(conversationId, userId, {
        userMessage,
        agentIntent: "CHATBOT_AGENT_MODE",
        agentOutput: {
          type: "chat",
          message: finalMessage,
          posture,
          toolCalls: toolExecutions.length,
        },
        artifactType: "chat",
      });
    }

    const operationalStore = this.engine.contextStore?._operationalStore;
    if (
      operationalStore &&
      typeof operationalStore.update === "function" &&
      conversationId
    ) {
      operationalStore.update(userId, conversationId, {
        posture,
        lastIntent: "CHATBOT_AGENT_MODE",
        source: "chat_agent_mode",
        lastQuery: userMessage,
      });
    }
  }

  _applyGroundingSafety({
    userMessage,
    finalMessage,
    deterministicGrounding,
    toolExecutions,
  }) {
    if (!this._looksEntityScopedRequest(userMessage)) {
      return finalMessage;
    }

    const hasEntityGraphExecution = (toolExecutions || []).some(
      (execution) => execution?.ok && execution?.toolName === "getEntityGraph",
    );
    if (hasEntityGraphExecution) {
      return finalMessage;
    }

    if (deterministicGrounding && deterministicGrounding.reason === "entity_ambiguous") {
      return "I need the exact entity before I can give grounded advice. Please share the client ID (or exact dossier/lawsuit/task/mission ID).";
    }

    return "I could not load grounded entity data for this request. Please provide the exact entity ID (for example: client #12), then I can give a precise priority plan.";
  }

  async _runDeterministicGrounding({
    userMessage,
    exposedTools,
    policy,
    executionContext,
  }) {
    const hasGraphTool = exposedTools.some((tool) => tool.name === "getEntityGraph");
    if (!hasGraphTool) return null;

    const message = String(userMessage || "").trim();
    if (!message || !this._looksEntityScopedRequest(message)) return null;

    const explicitRef = this._extractExplicitEntityReference(message);
    if (explicitRef) {
      const execution = await this._executeToolByName({
        toolName: "getEntityGraph",
        args: {
          entityType: explicitRef.entityType,
          entityId: explicitRef.entityId,
          depth: 2,
          direction: "both",
        },
        policy,
        executionContext,
      });
      if (execution?.ok) {
        return {
          snapshot: execution.result,
          execution,
          reason: "explicit_reference",
        };
      }
      return null;
    }

    const clientQuery = this._extractClientNameQuery(message);
    const hasListClients = exposedTools.some((tool) => tool.name === "listClients");
    if (!clientQuery || !hasListClients) {
      return { reason: "entity_ambiguous" };
    }

    const clientSearch = await this._executeToolByName({
      toolName: "listClients",
      args: { query: clientQuery, limit: 3 },
      policy,
      executionContext,
    });
    if (!clientSearch?.ok) return { reason: "entity_ambiguous" };

    const clients = Array.isArray(clientSearch.result?.clients)
      ? clientSearch.result.clients
      : [];
    if (clients.length !== 1 || !clients[0]?.id) {
      return { reason: "entity_ambiguous" };
    }

    const execution = await this._executeToolByName({
      toolName: "getEntityGraph",
      args: {
        entityType: "client",
        entityId: Number(clients[0].id),
        depth: 2,
        direction: "both",
      },
      policy,
      executionContext,
    });
    if (!execution?.ok) return { reason: "entity_ambiguous" };

    return {
      snapshot: execution.result,
      execution,
      reason: "client_name_resolved",
    };
  }

  _extractExplicitEntityReference(message) {
    const text = String(message || "");
    const patterns = [
      { entityType: "client", regex: /\bclient\s*#?\s*(\d+)\b/i },
      { entityType: "dossier", regex: /\bdossier\s*#?\s*(\d+)\b/i },
      { entityType: "lawsuit", regex: /\blawsuit\s*#?\s*(\d+)\b/i },
      { entityType: "task", regex: /\btask\s*#?\s*(\d+)\b/i },
      { entityType: "mission", regex: /\bmission\s*#?\s*(\d+)\b/i },
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (!match) continue;
      const entityId = Number(match[1]);
      if (Number.isInteger(entityId) && entityId > 0) {
        return {
          entityType: pattern.entityType,
          entityId,
        };
      }
    }
    return null;
  }

  _looksEntityScopedRequest(message) {
    const text = String(message || "").trim();
    if (!text) return false;
    return ENTITY_FOCUS_PATTERN.test(text) || ENTITY_NAMED_PATTERN.test(text);
  }

  _extractClientNameQuery(message) {
    const text = String(message || "");
    const match = text.match(/\bclient\s+([^?.,!\n]+)/i);
    if (!match) return null;
    const value = String(match[1] || "")
      .replace(/\b(what|which|where|why|when|how)\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return value || null;
  }

  async _executeToolByName({ toolName, args, policy, executionContext }) {
    try {
      const v2Result = await this.engine.executeToolV2(toolName, args, policy, {
        ...executionContext,
        confirmed: true,
        planId: `chat_grounding_${Date.now()}`,
        stepIndex: -1,
      });
      return {
        ok: true,
        toolName,
        args,
        result: v2Result?.result,
        responseForModel: {
          ok: true,
          tool: toolName,
          result: v2Result?.result,
        },
      };
    } catch (error) {
      return {
        ok: false,
        toolName,
        args,
        error: {
          code: toErrorCode(error?.reason || error?.message),
          message: String(error?.message || "Tool execution failed."),
        },
        responseForModel: {
          ok: false,
          code: toErrorCode(error?.reason || error?.message),
          message: String(error?.message || "Tool execution failed."),
        },
      };
    }
  }

  async _resolvePosture({ message, context, llmHistory }) {
    if (context?.posture) return context.posture;
    if (llmHistory?.posture) return llmHistory.posture;
    try {
      const resolved = await resolveInteractionPosture(message, context, {
        allowLLM: false,
      });
      return resolved?.mode || POSTURES.ASSISTANT;
    } catch (_) {
      return POSTURES.ASSISTANT;
    }
  }

  async _generateToolStepCommentary({ userMessage, execution, stepIndex }) {
    if (!execution || typeof execution !== "object") return "";
    const toolName = String(execution.toolName || "").trim();
    if (!toolName) return "";

    const summary = execution.ok
      ? this._summarizeToolResult(execution.result)
      : `Tool error: ${String(execution?.error?.message || "Unknown error")}`.slice(
          0,
          220,
        );

    const prompt = [
      "Write one short user-facing operational commentary sentence.",
      "No markdown. No bullets. No greetings.",
      "Do not mention internal systems, policies, permissions, or tokens.",
      "Focus on what this tool result adds for the user right now.",
      `User request: ${String(userMessage || "").trim()}`,
      `Step: ${Number(stepIndex) || 0}`,
      `Tool: ${toolName}`,
      `Outcome: ${summary}`,
      "Output one sentence only (max 180 characters).",
    ].join("\n");

    try {
      const raw = await generateChatResponse(prompt);
      const text = String(raw || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return "";
      return text.slice(0, 180);
    } catch (_) {
      return "";
    }
  }

  _summarizeToolResult(result) {
    if (result === null || result === undefined) return "No data returned";
    if (typeof result === "string") return result.slice(0, 220);
    if (typeof result !== "object") return String(result).slice(0, 220);

    const parts = [];
    if (typeof result.count === "number") {
      parts.push(`count=${result.count}`);
    }
    if (Array.isArray(result.items)) {
      parts.push(`items=${result.items.length}`);
    }
    if (Array.isArray(result.results)) {
      parts.push(`results=${result.results.length}`);
    }
    if (Array.isArray(result.clients)) {
      parts.push(`clients=${result.clients.length}`);
    }
    if (typeof result.message === "string" && result.message.trim()) {
      parts.push(`message=${result.message.trim().slice(0, 120)}`);
    }
    if (parts.length > 0) {
      return parts.join(", ").slice(0, 220);
    }

    try {
      return JSON.stringify(result).slice(0, 220);
    } catch (_) {
      return "Structured result";
    }
  }
}

module.exports = {
  ChatAgentService,
};
