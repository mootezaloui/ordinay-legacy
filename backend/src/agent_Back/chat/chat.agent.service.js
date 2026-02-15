"use strict";

const { TOOL_DOMAIN_MAP } = require("../tools/tool.firewall");
const { generateToolCallingTurn } = require("../llm.client");
const { resolveInteractionPosture, POSTURES } = require("../posture.resolver");
const { filterToolsForChat } = require("./chat.tool.exposure");

const MAX_TOOL_ROUNDS = Math.max(
  1,
  parseInt(process.env.AGENT_CHAT_MAX_TOOL_ROUNDS || "8", 10),
);

function toErrorCode(message, fallback = "TOOL_EXECUTION_FAILED") {
  const raw = String(message || "").trim();
  if (!raw) return fallback;
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80) || fallback;
}

class ChatAgentService {
  constructor({ engine, llmClient, maxToolRounds } = {}) {
    if (!engine) {
      throw new Error("ChatAgentService requires an engine instance");
    }
    this.engine = engine;
    this.ajv = engine.ajv;
    this.llmClient = llmClient || generateToolCallingTurn;
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
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

    this.engine.ledger.record({
      type: "chat_mode_run_started",
      agentVersion: policy.version,
      posture,
      conversationId: requestContext.conversationId || null,
      toolCount: exposedTools.length,
      timestamp: new Date().toISOString(),
    });

    const toolExecutions = [];
    let finalMessage = "";
    let rounds = 0;

    while (rounds < this.maxToolRounds) {
      rounds += 1;
      const assistant = await this.llmClient({
        messages,
        tools: exposedTools.map((tool) => tool.definition),
        signal,
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
    if (list.length <= 12) return list;

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
      return filtered.slice(0, 12);
    }

    const preferred = list.filter((tool) => {
      const domain = TOOL_DOMAIN_MAP[tool.name] || "";
      return domain === "web" || domain === "legal";
    });
    if (preferred.length > 0) {
      const picked = [...preferred, ...list.filter((tool) => !preferred.includes(tool))];
      return picked.slice(0, 12);
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
}

module.exports = {
  ChatAgentService,
};
