"use strict";

const { TOOL_DOMAIN_MAP } = require("../tools/tool.firewall");
const { generateToolCallingTurn, generateChatResponse } = require("../llm.client");
const { resolveInteractionPosture, POSTURES } = require("../posture.resolver");
const { filterToolsForChat } = require("./chat.tool.exposure");
const { resolveChatAmbiguity } = require("./chat.ambiguity.resolver");

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
    followUpIntent = null,
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

    const resolvedSelection = this._extractResolvedSelection(followUpIntent);
    const effectiveUserMessage = resolvedSelection
      ? String(
          `show ${resolvedSelection.entityType} ${resolvedSelection.label || resolvedSelection.entityId}`,
        ).trim()
      : String(followUpIntent?.originalMessage || userMessage).trim() || userMessage;

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
    if (resolvedSelection) {
      Object.assign(requestContext, resolvedSelection.scope);
      requestContext.resolvedEntity = {
        type: resolvedSelection.entityType,
        id: resolvedSelection.entityId,
        label: resolvedSelection.label,
      };
      requestContext._resolvedFromSuggestion = true;
    }
    const llmHistory =
      typeof this.engine.contextStore?.getContextForLLMInjection === "function"
        ? this.engine.contextStore.getContextForLLMInjection(requestContext)
        : {};
    const posture = await this._resolvePosture({
      message: effectiveUserMessage,
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
      effectiveUserMessage,
      allExposedTools,
    );
    const ambiguityResolution = resolvedSelection
      ? {
          status: "resolved",
          resolvedScope: resolvedSelection.scope,
          resolutionMeta: {
            status: "resolved",
            entityType: resolvedSelection.entityType,
            candidatesCount: 1,
            autoPicked: false,
            chosenId: resolvedSelection.entityId,
          },
        }
      : await resolveChatAmbiguity({
          engine: this.engine,
          message: effectiveUserMessage,
          policy,
          executionContext,
          exposedTools,
        });

    if (ambiguityResolution?.status === "resolved" && ambiguityResolution?.resolvedScope) {
      Object.assign(executionContext, ambiguityResolution.resolvedScope);
      Object.assign(requestContext, ambiguityResolution.resolvedScope);
    }

    if (
      ["ambiguous", "missing", "not_found"].includes(
        String(ambiguityResolution?.status || ""),
      ) &&
      ambiguityResolution?.suggestionArtifact
    ) {
      const finalMessage =
        String(ambiguityResolution.suggestionArtifact?.message || "").trim() ||
        "I need one more detail to continue.";
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture,
        toolExecutions: [],
        artifactType: "context_suggestion",
        artifact: ambiguityResolution.suggestionArtifact,
      });
      this.engine.ledger.record({
        type: "chat_mode_ambiguity_resolved",
        status: ambiguityResolution.status,
        entityType: ambiguityResolution?.resolutionMeta?.entityType || null,
        candidatesCount:
          ambiguityResolution?.resolutionMeta?.candidatesCount || 0,
        autoPicked: Boolean(ambiguityResolution?.resolutionMeta?.autoPicked),
        timestamp: new Date().toISOString(),
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture,
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: ambiguityResolution.suggestionArtifact,
        resolutionMeta: ambiguityResolution.resolutionMeta || null,
        availableTools: exposedTools.map((tool) => ({
          name: tool.name,
          category: tool.category,
        })),
      };
    }

    const messages = this._buildModelMessages({
      userMessage: effectiveUserMessage,
      llmHistory,
      posture,
      requestContext,
      exposedTools,
    });
    if (resolvedSelection) {
      messages.push({
        role: "system",
        content:
          `Resolved user selection: ${resolvedSelection.label || resolvedSelection.entityType}. ` +
          "Do not ask the user to choose again. Focus only on this selected entity.",
      });
    }
    const toolExecutions = [];
    const deterministicGrounding = await this._runDeterministicGrounding({
      userMessage: effectiveUserMessage,
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
            effectiveUserMessage,
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
      userMessage: effectiveUserMessage,
      finalMessage,
      deterministicGrounding,
      toolExecutions,
    });
    finalMessage = this._enforceResolvedSelectionAnswer({
      finalMessage,
      resolvedSelection,
      deterministicGrounding,
    });

    this._recordTranscript({
      requestContext,
      userMessage: effectiveUserMessage,
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
      ambiguityArtifact: null,
      resolutionMeta: ambiguityResolution?.resolutionMeta || null,
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
        "Never expose internal numeric IDs in user-facing text. Use names, titles, and references.",
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
    artifactType = "chat",
    artifact = null,
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
          type: artifactType === "context_suggestion" ? "context_suggestion" : "chat",
          message: finalMessage,
          posture,
          toolCalls: toolExecutions.length,
          ...(artifactType === "context_suggestion" && artifact
            ? { suggestion: artifact }
            : {}),
        },
        artifactType,
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
      return "I need the exact entity before I can give grounded advice. Please share the client name or the dossier/lawsuit/task/mission reference.";
    }

    return "I could not load grounded entity data for this request. Please provide the exact client name or dossier/lawsuit reference, then I can give a precise priority plan.";
  }

  _enforceResolvedSelectionAnswer({
    finalMessage,
    resolvedSelection,
    deterministicGrounding,
  }) {
    const base = String(finalMessage || "").trim();
    if (!resolvedSelection) return base;

    const looksUnresolved =
      !base ||
      /\b(which one|exact entity|provide .*reference|share .*reference|could not load grounded)\b/i.test(
        base,
      );
    if (!looksUnresolved) return base;

    const snapshot = deterministicGrounding?.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return "I have your selection. I can now show the full record details for this item.";
    }
    return this._buildEntityGraphResponse(snapshot);
  }

  _buildEntityGraphResponse(snapshot) {
    const root = snapshot?.root || {};
    const display = root?.title || root?.name || "Selected record";
    const lines = [];
    lines.push(`${display}`);
    lines.push(`Type: ${root?.type || "entity"}`);
    if (root?.status) lines.push(`Status: ${root.status}`);
    if (root?.priority) lines.push(`Priority: ${root.priority}`);
    if (root?.keyDates?.nextUpcoming) {
      lines.push(`Next date: ${String(root.keyDates.nextUpcoming).slice(0, 10)}`);
    }
    const parents = snapshot?.parents || {};
    if (parents?.client?.name || parents?.client?.title) {
      lines.push(`Client: ${parents.client.name || parents.client.title}`);
    }
    const metrics = snapshot?.metrics || {};
    lines.push(
      `Related: ${metrics.totalDossiers || 0} dossiers, ${metrics.totalLawsuits || 0} lawsuits, ${metrics.totalTasks || 0} tasks, ${metrics.totalMissions || 0} missions, ${metrics.totalSessions || 0} sessions`,
    );
    if (Number(metrics.overdueDeadlines || 0) > 0) {
      lines.push(`Overdue deadlines: ${metrics.overdueDeadlines}`);
    }
    if (Number(metrics.upcomingWithin7Days || 0) > 0) {
      lines.push(`Upcoming within 7 days: ${metrics.upcomingWithin7Days}`);
    }

    const children = snapshot?.children || {};
    const renderTop = (key, label) => {
      const rows = Array.isArray(children[key]) ? children[key] : [];
      if (!rows.length) return;
      const preview = rows
        .slice(0, 3)
        .map((row) => {
          const name = row?.title || row?.name || label;
          const status = row?.status ? ` (${row.status})` : "";
          return `- ${name}${status}`;
        })
        .join("\n");
      lines.push(`${label}:`);
      lines.push(preview);
    };
    renderTop("dossiers", "Dossiers");
    renderTop("lawsuits", "Lawsuits");
    renderTop("tasks", "Tasks");
    renderTop("missions", "Missions");
    renderTop("sessions", "Sessions");

    return lines.join("\n");
  }

  async _runDeterministicGrounding({
    userMessage,
    exposedTools,
    policy,
    executionContext,
  }) {
    const hasGraphTool = exposedTools.some((tool) => tool.name === "getEntityGraph");
    if (!hasGraphTool) return null;

    const resolvedEntity = executionContext?.resolvedEntity;
    if (
      resolvedEntity &&
      typeof resolvedEntity === "object" &&
      resolvedEntity.type &&
      Number(resolvedEntity.id) > 0
    ) {
      const execution = await this._executeToolByName({
        toolName: "getEntityGraph",
        args: {
          entityType: String(resolvedEntity.type),
          entityId: Number(resolvedEntity.id),
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
          reason: "resolved_selection",
        };
      }
    }

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

  _extractResolvedSelection(followUpIntent) {
    if (!followUpIntent || typeof followUpIntent !== "object") return null;
    if (String(followUpIntent.intent || "").toUpperCase() !== "RESOLVE_CONTEXT_AND_CONTINUE") {
      return null;
    }
    const resolved = followUpIntent.resolvedEntity || {};
    const entityType = String(resolved.type || followUpIntent.entityType || "")
      .trim()
      .toLowerCase();
    const entityId = Number(resolved.id || followUpIntent.entityId || 0);
    if (!entityType || !Number.isFinite(entityId) || entityId <= 0) return null;
    const scope = {
      ...(followUpIntent.scope && typeof followUpIntent.scope === "object"
        ? followUpIntent.scope
        : {}),
    };
    const keyMap = {
      client: "clientId",
      dossier: "dossierId",
      lawsuit: "lawsuitId",
      task: "taskId",
      personal_task: "personalTaskId",
      session: "sessionId",
      mission: "missionId",
      financial_entry: "financialEntryId",
      notification: "notificationId",
      history_event: "historyEventId",
      officer: "officerId",
    };
    const scopeKey = keyMap[entityType];
    if (scopeKey && !scope[scopeKey]) scope[scopeKey] = entityId;
    return {
      entityType,
      entityId,
      scope,
      label: String(resolved.label || followUpIntent.label || "").trim() || null,
    };
  }
}

module.exports = {
  ChatAgentService,
};
