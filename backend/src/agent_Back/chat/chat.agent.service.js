"use strict";

const { TOOL_DOMAIN_MAP } = require("../tools/tool.firewall");
const { generateToolCallingTurn, generateChatResponse } = require("../llm.client");
const { resolveInteractionPosture, POSTURES } = require("../posture.resolver");
const { filterToolsForChat } = require("./chat.tool.exposure");
const { rankExposedToolsForMessage, DEFAULT_TOOL_CAP } = require("./chat.tool.ranker");
const { resolveChatAmbiguity } = require("./chat.ambiguity.resolver");
const {
  detectMutationIntent,
  getMutationIntentDetectorConfig,
} = require("./chat.mutationIntentDetector");
const {
  decideMutationMode,
  isConfirmationResumeMessage,
  normalizeMutationSemantics,
  classifyCapabilitySupport,
} = require("./mutationDecisionEngine");
const {
  logMutationIntentProposalCreated,
  logMutationIntentActionAttempted,
  logMutationIntentActionOutcome,
} = require("./chat.mutationIntentLogging");
const { resolveAdaptiveMutationRemediation } = require("../engine/agentMutationConstraintResolver");
const { planEntityCreation } = require("../mutations/entityCreationPlanner");
const { detectDraftIntent, isSlashCommand, parseSlashCommand } = require("../intent.classifier");
const { detectDocumentGenerationIntent } = require("../documentGeneration.intent");
const { toProposalArtifact } = require("../proposals/proposalArtifact");
const operatorsService = require("../../services/operators.service");
const documentGenerationService = require("../../services/documentGeneration/documentGeneration.service");
const documentGenerationPreviewService = require("../../services/documentGeneration/documentGenerationPreview.service");
const {
  DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  normalizeOutputFormatPreference,
} = require("../../domain/documentFormatGovernance");
const {
  resolveStorageTarget,
} = require("../../domain/document.storage.resolver");
const {
  resolveClientQuery,
  resolveDossierQuery,
  resolveTaskQuery,
  resolveSessionQuery,
  resolveLawsuitQuery,
  resolveMissionQuery,
  resolveOfficerQuery,
  resolvePersonalTaskQuery,
  resolveFinancialEntryQuery,
  resolveDocumentQuery,
  normalizeText: normalizeEntityResolverText,
} = require("../entity.resolver");

const MAX_TOOL_ROUNDS = Math.max(
  1,
  parseInt(process.env.AGENT_CHAT_MAX_TOOL_ROUNDS || "8", 10),
);
const MAX_COMPLETION_TOKENS = Math.max(
  256,
  parseInt(process.env.AGENT_CHAT_MAX_COMPLETION_TOKENS || "1400", 10),
);
const TOOL_STEP_COMMENTARY_ENABLED = false;
const ENTITY_FOCUS_PATTERN =
  /\b(client|dossier|lawsuit|task|mission)\s*(#\s*\d+|\d+)\b/i;
const ENTITY_NAMED_PATTERN =
  /\b(our|this|that|my)\s+(client|dossier|lawsuit|task|mission)\b|\b(client|dossier|lawsuit|task|mission)\s+([A-Za-z\u00C0-\u024F\u0600-\u06FF][^?.,!\n]{1,90})|\b(قضية|ملف)\s+([\u0600-\u06FF][^?.,!\n]{1,90})/iu;

const BLOCKED_MUTATION_ERROR_CODES = new Set([
  "DOMAIN_ACCESS_DENIED",
  "MUTATION_PERMISSION_DENIED",
  "ACCESS_DENIED",
  "PERMISSION_DENIED",
  "POSTURE_MISMATCH",
  "RISK_ACK_REQUIRED",
  "EXPLICIT_MUTATION_COMMAND_REQUIRED",
  "CONFIRMATION_REQUIRED",
  "EXECUTION_NOT_PERMITTED",
  "DOMAIN_RULE_BLOCKED",
]);
function isTruthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

const CHAT_MUTATION_DEBUG_ENABLED =
  isTruthyEnv(process.env.AGENT_CHAT_MUTATION_DEBUG) ||
  isTruthyEnv(process.env.AGENT_MUTATION_DEBUG) ||
  process.env.NODE_ENV !== "production";
const CHAT_ADAPTIVE_DOMAIN_CONSTRAINTS_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS ?? "1").toLowerCase(),
);
function isScopeBindingEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.AGENT_SCOPE_BINDING_ENABLED ?? "1").toLowerCase(),
  );
}

function toErrorCode(message, fallback = "TOOL_EXECUTION_FAILED") {
  const raw = String(message || "").trim();
  if (!raw) return fallback;
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80) || fallback;
}

function isLikelyResolutionReply(message = "", followUpIntent = null) {
  if (followUpIntent?.pendingOperationId || followUpIntent?.resolvedEntity) return true;
  const text = String(message || "").trim();
  if (!text) return false;
  if (/^[A-Z]{2,10}-\d{2,8}(?:-\d{1,8})?$/i.test(text)) return true;
  if (/^\d+$/.test(text)) return true;
  if (text.split(/\s+/).length > 4) return false;
  if (/\b(show|list|recent|create|generate|draft|prepare|write)\b/i.test(text)) return false;
  return /[\p{L}\p{N}]/u.test(text);
}

class ChatAgentService {
  constructor({
    engine,
    llmClient,
    mutationIntentExtractor,
    maxToolRounds,
    maxCompletionTokens,
  } = {}) {
    if (!engine) {
      throw new Error("ChatAgentService requires an engine instance");
    }
    this.engine = engine;
    this.ajv = engine.ajv;
    this.llmClient = llmClient || generateToolCallingTurn;
    this.mutationIntentExtractor = mutationIntentExtractor || generateChatResponse;
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
    this.maxCompletionTokens = maxCompletionTokens || MAX_COMPLETION_TOKENS;
    this.scopeManager = engine.scopeManager || null;
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
    const draftIntent = detectDraftIntent(effectiveUserMessage, context || {});
    const contextMetadata =
      context?.requestMetadata &&
      typeof context.requestMetadata === "object" &&
      !Array.isArray(context.requestMetadata)
        ? context.requestMetadata
        : {};
    const incomingMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const mergedMetadata = {
      ...contextMetadata,
      ...incomingMetadata,
    };
    const documentOutputFormatPreference =
      normalizeOutputFormatPreference(
        mergedMetadata.documentOutputFormatPreference ||
          context?.documentOutputFormatPreference,
      ) || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
    const requestContext = {
      ...(context || {}),
      conversationId:
        context?.conversationId || context?.agentSessionId || sessionId || undefined,
      userId: context?.userId || userId || "default",
      tenantId: context?.tenantId || tenantId || null,
      documentOutputFormatPreference,
      requestMetadata: {
        ...mergedMetadata,
        documentOutputFormatPreference,
      },
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

    const explicitMutationSlashResult = await this._tryHandleExplicitMutationSlashCommand({
      userMessage,
      requestContext,
      policy,
      sessionId,
      userId: requestContext.userId || userId || null,
      tenantId: requestContext.tenantId || tenantId || null,
    });
    if (explicitMutationSlashResult) {
      return explicitMutationSlashResult;
    }

    const pendingOperation =
      typeof this.engine.getPendingOperation === "function"
        ? this.engine.getPendingOperation(requestContext)
        : null;
    if (
      pendingOperation &&
      (!followUpIntent?.pendingOperationId ||
        String(followUpIntent.pendingOperationId) === String(pendingOperation.id))
    ) {
      const updatedPending =
        typeof this.engine.applyResolutionInput === "function"
          ? await this.engine.applyResolutionInput(
              requestContext,
              userMessage,
              followUpIntent,
            )
          : null;
      const candidatePending = updatedPending || pendingOperation;
      if (
        candidatePending &&
        typeof this.engine.canResumePendingOperation === "function" &&
        this.engine.canResumePendingOperation(candidatePending) &&
        String(candidatePending.operationType || "").toLowerCase() !==
          "document_generation"
      ) {
        if (typeof this.engine.resumePendingOperation === "function") {
          await this.engine.resumePendingOperation(requestContext, {
            default: async () => null,
          });
        }
      } else if (isLikelyResolutionReply(userMessage, followUpIntent)) {
        const missingEntity =
          candidatePending?.requiredBindings?.[0]?.entityType || "entity";
        const suggestionArtifact = {
          type: "context_suggestion",
          message: `I still need the exact ${missingEntity} to resume your previous request.`,
          entityType: missingEntity,
          reason: "missing_context",
          originalIntent: candidatePending?.originalIntent || "CHATBOT_AGENT_MODE",
          originalMessage: candidatePending?.originalMessage || userMessage,
          pendingOperationId: candidatePending?.id || null,
          suggestions: [],
          allowManualInput: true,
          manualInputHint: `Provide a ${missingEntity} reference or exact name.`,
          timestamp: new Date().toISOString(),
          source: "pending-operation",
        };
        this._recordTranscript({
          requestContext,
          userMessage,
          finalMessage: suggestionArtifact.message,
          posture: "ASSISTANT",
          toolExecutions: [],
          artifactType: "context_suggestion",
          artifact: suggestionArtifact,
        });
        return {
          message: suggestionArtifact.message,
          agentVersion: policy.version,
          posture: "ASSISTANT",
          toolExecutions: [],
          stepCommentaries: [],
          rounds: 0,
          ambiguityArtifact: suggestionArtifact,
          resolutionMeta: {
            status: "missing",
            entityType: missingEntity,
            candidatesCount: 0,
            autoPicked: false,
            chosenId: null,
          },
          availableTools: [],
          suppressIntentFraming: false,
          suppressCommentary: false,
        };
      }
    }
    const llmHistory =
      typeof this.engine.contextStore?.getContextForLLMInjection === "function"
        ? this.engine.contextStore.getContextForLLMInjection(requestContext)
        : {};
    this._applyHistoricalScope({
      requestContext,
      llmHistory,
      userMessage: effectiveUserMessage,
    });
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
    const documentGenerationIntent = await detectDocumentGenerationIntent(
      effectiveUserMessage,
      requestContext,
    );
    const documentGenerationResponse =
      documentGenerationIntent
        ? await this._tryHandleDocumentGenerationChatIntent({
            generationRequest: documentGenerationIntent,
            requestContext,
            executionContext,
            policy,
            userMessage: effectiveUserMessage,
          })
        : null;
    if (documentGenerationResponse) {
      return documentGenerationResponse;
    }

    const conversationalMutationProposal =
      ((draftIntent && draftIntent.intent) || documentGenerationIntent)
        ? null
        : await this._tryHandleStrongMutationIntentDetection({
            userMessage,
            effectiveUserMessage,
            requestContext,
            executionContext,
            llmHistory,
            policy,
          });
    if (conversationalMutationProposal) {
      return conversationalMutationProposal;
    }
    const modeAfterMutation =
      this._getOperationalMutationDetectionState(requestContext)?.mode || "informational";
    if (modeAfterMutation === "execution") {
      const finalMessage =
        "Execution mode is active for this request. I should prepare a confirmation-ready change, not advisory instructions. Please restate the exact entity if needed.";
      this._recordTranscript({
        requestContext,
        userMessage: effectiveUserMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
      };
    }
    this._setConversationMode(requestContext, "informational");
    requestContext._conversationMode =
      this._getOperationalMutationDetectionState(requestContext)?.mode || "informational";

    const allExposedTools = this._buildExposedTools(policy, executionContext);
    const exposedTools = this._selectToolsForMessage(
      effectiveUserMessage,
      allExposedTools,
      { executionContext, llmHistory },
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

    const draftRequiresGrounding = this._requiresGroundedDraft({
      userMessage: effectiveUserMessage,
      draftIntent,
      scopeContext: executionContext,
    });

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

    const documentFallback = this._buildDocumentContextFallback({
      requestContext,
      userMessage: effectiveUserMessage,
      policyVersion: policy.version,
      posture,
    });
    if (documentFallback) {
      this._recordTranscript({
        requestContext,
        userMessage: effectiveUserMessage,
        finalMessage: documentFallback.message,
        posture,
        toolExecutions: [],
      });
      this.engine.ledger.record({
        type: "chat_mode_document_fallback",
        agentVersion: policy.version,
        posture,
        conversationId: requestContext.conversationId || null,
        timestamp: new Date().toISOString(),
      });
      return documentFallback;
    }

    const messages = this._buildModelMessages({
      userMessage: effectiveUserMessage,
      llmHistory,
      posture,
      requestContext,
      exposedTools,
      draftIntent,
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
      requireGrounding: draftRequiresGrounding,
    });
    if (deterministicGrounding?.snapshot) {
      messages.push({
        role: "system",
        content: `Authoritative grounding snapshot (do not contradict): ${JSON.stringify(deterministicGrounding.snapshot)}`,
      });
      toolExecutions.push(deterministicGrounding.execution);
    }

    const officialDraftGuard = this._buildOfficialDraftGuard({
      userMessage: effectiveUserMessage,
      draftIntent,
      deterministicGrounding,
    });
    if (officialDraftGuard?.systemMessage) {
      messages.push({
        role: "system",
        content: officialDraftGuard.systemMessage,
      });
    }

    if (draftRequiresGrounding && !deterministicGrounding?.snapshot) {
      const blockedMessage = this._buildDraftGroundingBlockedMessage({
        userMessage: effectiveUserMessage,
        deterministicGrounding,
      });
      this._recordTranscript({
        requestContext,
        userMessage: effectiveUserMessage,
        finalMessage: blockedMessage,
        posture,
        toolExecutions,
      });
      return {
        message: blockedMessage,
        agentVersion: policy.version,
        posture,
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: ambiguityResolution?.resolutionMeta || null,
        availableTools: exposedTools.map((tool) => ({
          name: tool.name,
          category: tool.category,
        })),
      };
    }

    this.engine.ledger.record({
      type: "chat_mode_run_started",
      agentVersion: policy.version,
      posture,
      conversationId: requestContext.conversationId || null,
      toolCount: exposedTools.length,
      toolExposureCap: DEFAULT_TOOL_CAP,
      exposedToolRanks: exposedTools.map((tool) => ({
        name: tool.name,
        rank: tool.rank || null,
        score: tool.rankScore ?? null,
        reason: tool.rankReason || null,
      })),
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
      if (toolCalls.length > 0) {
        this.engine.ledger.record({
          type: "chat_mode_tool_calls_requested",
          conversationId: requestContext.conversationId || null,
          requested: toolCalls.map((call) => {
            const toolName = String(call?.function?.name || "").trim();
            const exposed = exposedTools.find((tool) => tool.name === toolName);
            return {
              toolName,
              rank: exposed?.rank || null,
              score: exposed?.rankScore ?? null,
            };
          }),
          timestamp: new Date().toISOString(),
        });
      }
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
    finalMessage = this._enforceGroundingSnapshotConsistency({
      userMessage: effectiveUserMessage,
      finalMessage,
      deterministicGrounding,
    });
    finalMessage = this._enforceResolvedSelectionAnswer({
      finalMessage,
      resolvedSelection,
      deterministicGrounding,
    });
    finalMessage = this._enforceExecutionLockedNoAdvisoryFallback({
      finalMessage,
      requestContext,
    });
    finalMessage = this._normalizeResponseMarkdown({
      content: finalMessage,
      outputType: "message",
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
    const toolSelectionMeta =
      typeof this.engine.toolRegistry?.listForSelection === "function"
        ? this.engine.toolRegistry.listForSelection({ agentVersion: policy.version })
        : [];
    const selectionMetaByName = new Map(
      (Array.isArray(toolSelectionMeta) ? toolSelectionMeta : []).map((row) => [row.name, row]),
    );
    const scoped = filterToolsForChat({
      engine: this.engine,
      policy,
      executionContext,
    });
    return scoped.map((tool) => ({
      name: tool.name,
      category: tool.category,
      schema: tool.schema,
      profile: selectionMetaByName.get(tool.name) || {
        name: tool.name,
        group: tool.category,
        description: String(this.engine.toolRegistry.get(tool.name)?.description || "").trim(),
        examples: [],
        entityTypes: [],
      },
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
    draftIntent,
  }) {
    const systemInstruction = {
      mode: "CHATBOT_AGENT_MODE",
      requirements: [
        "You are the planner and tool caller.",
        "Use only exposed tools when needed; do not invent tools.",
        "Validate facts with tool results before answering.",
        "Never expose internal numeric IDs in user-facing text. Use names, titles, and references.",
        "For entity-specific legal work, call getEntityGraph first to ground parent/child context before synthesis.",
        "Do not expose internal mutation commands or command syntax in chat responses.",
        "If a requested capability is unavailable, explain constraint briefly.",
        "You are not allowed to fabricate legal references or leave placeholders. If information is missing, ask.",
        "Prefer real grounded values. If a required value is missing, bracket placeholders are allowed.",
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
      draftPolicy:
        draftIntent && draftIntent.intent
          ? {
              draftIntent: draftIntent.intent,
              draftType: draftIntent.draftType || null,
              noPlaceholderPolicy: true,
            }
          : null,
      conversationMode: requestContext?._conversationMode || "informational",
      currentScope:
        llmHistory?.conversationScope?.activeScope &&
        Number(llmHistory?.conversationScope?.activeScope?.entityId || 0) > 0
          ? {
              entityType: llmHistory.conversationScope.activeScope.entityType,
              entityId: llmHistory.conversationScope.activeScope.entityId,
              confidence: llmHistory.conversationScope.activeScope.confidence,
              source: llmHistory.conversationScope.activeScope.source,
            }
          : null,
    };

    const messages = [
      {
        role: "system",
        content: [
          "You are Ordinay Chatbot Mode.",
          "Respond directly and concisely.",
          "When performing analysis, retrieval, search, or generation tasks, begin with a short natural intent sentence (1-2 lines).",
          "Use clean markdown in a single message bubble.",
          "Let output structure be chosen freely based on what best serves the user's request.",
          "Do not output HTML tags; output markdown only.",
          "Do not restate the user's request.",
          "Do not restate the user's request verbatim.",
          "Do not use phrases like 'Got it', 'You're asking', 'Based on your request', or 'Here's what I found regarding'.",
          "Do not mention tools or internal system logic.",
          "Do not describe internal reasoning, prompts, snapshots, scope, diagnostics, or system state.",
          "Provide the main result clearly.",
          "After completing any tool calls, your FINAL assistant response must be only a JSON object matching the output contract described below.",
          "Intermediate tool-calling turns may use normal assistant tool-call messages, but the terminal response must be strict JSON only.",
          'Final output contract JSON schema: {"outputType":"message|document|mutation|research","title":"optional string","content":"required string","metadata":{}}',
          'CRITICAL: The "content" field value must be user-facing text and may use markdown when helpful.',
          'Use "message" for conversational/informational replies.',
          'Use "document" for standalone artifacts intended to be printed, signed, sent, filed, or stored. If unsure between message and document for a formal output, prefer "document".',
          'For outputType "document", metadata must include artifactKind and structureHints.',
          'metadata.artifactKind should be one of: document, table, email, letter, report, memo.',
          'metadata.structureHints must include booleans: hasTabularData, requiresEditing, intendedForFiling.',
          'metadata.storageHint is optional and should be one of: inherit, client, dossier, lawsuit, financial_entry, mission, session, task.',
          "If storageHint is omitted, use inherit.",
          'Use "mutation" when the response intends to modify system data. For mutation, metadata.operations is required and must be structured.',
          'Use "research" for external research outputs.',
          "Do not output raw text outside the final JSON object.",
          "If structured data is returned, include any commentary or explanation inside the JSON content field.",
          "Do not duplicate information between content and metadata.",
          "Do not produce meta commentary.",
          "Ask a follow-up question only when required data is missing and you cannot proceed.",
          "When structured/tool data is available, give a short human answer, not a JSON dump or field-by-field dump.",
          "Never expose internal numeric IDs in user-facing text unless the user explicitly asks for an identifier.",
          ...(String(requestContext?._conversationMode || "").toLowerCase() === "execution"
            ? [
                "Execution mode is active for this conversation turn.",
                "When execution mode is active, you are an execution-capable agent.",
                "Do not provide advisory workflow instructions instead of executing.",
                "Do not claim lack of permissions.",
                "If a mutation can be prepared, propose confirmation.",
              ]
            : []),
          `Operational context (not user-facing): ${JSON.stringify(systemInstruction)}`,
        ].join("\n"),
      },
    ];

    const docCtx = requestContext?.documentContext;
    if (
      docCtx &&
      Array.isArray(docCtx.documents) &&
      docCtx.documents.length > 0
    ) {
      const readableDocs = docCtx.documents.filter(
        (doc) => doc && (doc.has_text || (typeof doc.text === "string" && doc.text.trim().length > 0)),
      );
      const docPayload = {
        sessionId: docCtx.sessionId || requestContext?.sessionId || null,
        totalDocuments: docCtx.totalDocuments || docCtx.documents.length,
        readableCount: docCtx.readableCount || readableDocs.length,
        processingCount: docCtx.processingCount || 0,
        unreadableCount: docCtx.unreadableCount || 0,
        documents: docCtx.documents.map((doc) => ({
          title: doc.title || doc.original_filename || `document_${doc.document_id}`,
          mime_type: doc.mime_type || null,
          text_status: doc.text_status || null,
          text_source: doc.text_source || null,
          understanding_status: doc.understanding_status || doc.text_status || null,
          understanding_confidence: Number.isFinite(doc.understanding_confidence)
            ? doc.understanding_confidence
            : null,
          text: typeof doc.text === "string" ? doc.text.slice(0, 8000) : null,
          visual_summary:
            doc.artifacts && typeof doc.artifacts === "object"
              ? String(doc.artifacts.visual_summary || "").slice(0, 1000)
              : null,
          risk_flags:
            doc.artifacts && typeof doc.artifacts === "object" && Array.isArray(doc.artifacts.risk_flags)
              ? doc.artifacts.risk_flags.slice(0, 10)
              : [],
        })),
      };

      messages.push({
        role: "system",
        content:
          "Attached session documents are already available. " +
          "Use this context directly when the user asks about an image/file. " +
          "Do not ask the user to upload the same file again unless document context is empty/unreadable.\n" +
          JSON.stringify(docPayload),
      });
    }

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

  _selectToolsForMessage(userMessage, tools, { executionContext = {}, llmHistory = {} } = {}) {
    const ranked = rankExposedToolsForMessage({
      userMessage,
      tools,
      executionContext,
      llmHistory,
      cap: DEFAULT_TOOL_CAP,
    });
    return ranked.tools;
  }

  async _tryHandleExplicitMutationSlashCommand({
    userMessage,
    requestContext,
    policy,
    sessionId,
    userId,
    tenantId,
  }) {
    if (!isSlashCommand(userMessage)) return null;

    const parsed = parseSlashCommand(userMessage);
    if (!parsed?.valid || parsed.commandKey !== "mutate") return null;

    let args;
    try {
      const raw = Array.isArray(parsed.args) ? parsed.args.join(" ").trim() : "";
      if (!raw) throw new Error("Command /mutate requires a JSON payload.");
      args = JSON.parse(raw);
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("Mutation command payload must be a JSON object.");
      }
    } catch (error) {
      const message =
        error?.message && /json/i.test(String(error.message))
          ? error.message
          : "Invalid JSON for /mutate command.";
      const finalMessage =
        `${message} Use: /mutate {"entityType":"task","entityId":"123","operation":"update","payload":{"status":"completed"},"reasoningSummary":"..."}`;
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
      });
      return {
        message: finalMessage,
        intent: "COMMAND",
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
      };
    }

    const executionContext = {
      ...requestContext,
      explicitMutationCommand: true,
      confirmed: true,
      posture: "WORK",
      sessionId: sessionId || requestContext?.conversationId || null,
      userId: userId || requestContext?.userId || null,
      tenantId: tenantId || requestContext?.tenantId || null,
      dataAccess:
        requestContext?.dataAccess && typeof requestContext.dataAccess === "object"
          ? requestContext.dataAccess
          : {},
      sourceRoute: "/agent/chat",
    };

    try {
      const v2Result = await this.engine.executeToolV2(
        "propose_entity_mutation",
        args,
        policy,
        executionContext,
      );
      const proposal = v2Result?.result;
      if (!proposal?.proposalId || proposal.requiresConfirmation !== true) {
        throw new Error("Failed to create mutation proposal.");
      }

      if (typeof this.engine.storeProposal === "function") {
        this.engine.storeProposal(proposal, {
          explicitMutationCommand: true,
          proposalKind: "entity_mutation",
          sourceRoute: "/agent/chat",
          conversationId: requestContext?.conversationId || null,
          sessionId: executionContext.sessionId || null,
          userId: executionContext.userId || null,
          tenantId: executionContext.tenantId || null,
        });
      }

      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification: null,
        pendingMutationProposal: {
          proposalId: proposal.proposalId,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          riskLevel: "unknown",
        },
        suppressMutationDetectionUntilResolved: true,
      });

      const artifactProposal =
        bindingAudit && bindingAudit.applied
          ? {
              ...proposal,
              confirmation: {
                ...(proposal?.confirmation || {}),
                scopeBinding: bindingAudit,
              },
            }
          : proposal;
      const proposalArtifact = toProposalArtifact(artifactProposal, executionContext.sessionId);
      const toolExecutions = [
        {
          ok: true,
          toolName: "propose_entity_mutation",
          args,
          result: proposal,
          responseForModel: null,
        },
      ];
      const finalMessage =
        "I prepared a mutation proposal. Please review and confirm it before execution.";
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
        artifactType: "proposal",
        artifact: proposalArtifact,
      });
      this.engine.ledger.record({
        type: "chat_mode_tool_call",
        toolName: "propose_entity_mutation",
        success: true,
        timestamp: new Date().toISOString(),
      });

      return {
        message: finalMessage,
        intent: "COMMAND",
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: proposalArtifact,
        resolutionMeta: null,
        availableTools: [],
      };
    } catch (error) {
      const safeMessage =
        String(error?.message || "").trim() || "Mutation proposal failed.";
      this.engine.ledger.record({
        type: "chat_mode_tool_call",
        toolName: "propose_entity_mutation",
        success: false,
        error: safeMessage,
        timestamp: new Date().toISOString(),
      });
      const finalMessage = `Could not create mutation proposal: ${safeMessage}`;
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
      });
      return {
        message: finalMessage,
        intent: "COMMAND",
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
      };
    }
  }

  _getOperationalMutationDetectionState(requestContext = {}) {
    const operationalStore = this.engine.contextStore?._operationalStore;
    const conversationId = requestContext?.conversationId;
    const userId = requestContext?.userId || "default";
    if (
      !operationalStore ||
      typeof operationalStore.get !== "function" ||
      !conversationId
    ) {
      return null;
    }
    return operationalStore.get(userId, conversationId);
  }

  _updateOperationalMutationDetectionState(requestContext = {}, updates = {}) {
    const operationalStore = this.engine.contextStore?._operationalStore;
    const conversationId = requestContext?.conversationId;
    const userId = requestContext?.userId || "default";
    if (
      !operationalStore ||
      typeof operationalStore.update !== "function" ||
      !conversationId
    ) {
      return null;
    }
    return operationalStore.update(userId, conversationId, updates);
  }

  _setConversationMode(requestContext = {}, mode = "informational", extra = {}) {
    const normalized = ["execution", "informational", "clarification"].includes(String(mode))
      ? String(mode)
      : "informational";
    return this._updateOperationalMutationDetectionState(requestContext, {
      mode: normalized,
      ...extra,
    });
  }

  _buildMutationDetectorLogger() {
    return (entry) => {
      if (this.engine?.ledger && typeof this.engine.ledger.record === "function") {
        this.engine.ledger.record(entry);
      }
    };
  }

  _debugChatMutation(event, payload = {}) {
    if (!CHAT_MUTATION_DEBUG_ENABLED) return;
    try {
      console.warn("[chat-mutation-debug]", event, payload);
    } catch (_) {}
  }

  _resolveMutationOrchestrationPolicy(policy = null) {
    const currentVersion = String(policy?.version || "").toLowerCase();
    if (currentVersion === "v3") return policy;
    if (this.engine && typeof this.engine._resolvePolicy === "function") {
      try {
        const v3Policy = this.engine._resolvePolicy("v3");
        if (v3Policy?.version) {
          this._debugChatMutation("policy_override", {
            fromPolicyVersion: policy?.version || null,
            toPolicyVersion: v3Policy.version,
          });
          return v3Policy;
        }
      } catch (error) {
        this._debugChatMutation("policy_override_failed", {
          fromPolicyVersion: policy?.version || null,
          error: error?.message || String(error),
        });
      }
    }
    return policy;
  }

  _resolveChatMutationExecutionMode({ requestContext = {}, detectorResult = null } = {}) {
    if (detectorResult?.requiresExtraConfirmation === true) return "confirm";
    const metadata = requestContext?.requestMetadata || {};
    const metadataRequestedAutoExecute =
      String(metadata.chatMutationExecutionMode || "").toLowerCase() === "auto_execute" ||
      metadata.autoExecuteMutations === true;
    const devAutoExecuteEnabled =
      String(process.env.AGENT_DEV_ALLOW_AUTO_EXECUTE || "").toLowerCase() === "true" &&
      String(process.env.NODE_ENV || "").toLowerCase() !== "production";

    if (metadataRequestedAutoExecute && !devAutoExecuteEnabled) {
      this.engine?.ledger?.record?.({
        type: "chat_mutation_auto_execute_blocked",
        sourceRoute: "/agent/chat",
        reason: "DEV_FLAG_DISABLED",
        timestamp: new Date().toISOString(),
      });
      return "confirm";
    }

    if (metadataRequestedAutoExecute && devAutoExecuteEnabled) {
      return "auto_execute";
    }
    return "confirm";
  }

  _adaptiveDomainConstraintsEnabled() {
    return CHAT_ADAPTIVE_DOMAIN_CONSTRAINTS_ENABLED;
  }

  _scopeBindingEnabled() {
    return isScopeBindingEnabled();
  }

  async _createMutationWorkflowProposal({
    workflowProposalInput,
    policy,
    executionContext,
  }) {
    const stageExecutionContext = {
      ...executionContext,
      posture: "WORK",
      confirmed: true,
      strongMutationIntent: true,
      explicitMutationCommand: false,
      sourceRoute: "/agent/chat",
    };
    const v2Result = await this.engine.executeToolV2(
      "propose_mutation_workflow",
      workflowProposalInput,
      policy,
      stageExecutionContext,
    );
    const proposal = v2Result?.result;
    if (!proposal?.proposalId || proposal.requiresConfirmation !== true) {
      const err = new Error("Failed to create mutation workflow proposal.");
      err.code = "MUTATION_WORKFLOW_PROPOSAL_INVALID";
      throw err;
    }
    return { proposal, stageExecutionContext };
  }

  _extractConfirmedWorkflowExecutionResult(confirmResult = null) {
    const actionResult = confirmResult?.executedActions?.[0]?.result;
    if (!actionResult || typeof actionResult !== "object") {
      const err = new Error("Workflow execution returned no result.");
      err.code = "MUTATION_WORKFLOW_RESULT_INVALID";
      throw err;
    }
    if (actionResult.ok !== true) {
      const err = new Error("Workflow execution did not succeed.");
      err.code = String(actionResult.errorCode || actionResult.code || "MUTATION_WORKFLOW_FAILED");
      throw err;
    }
    return actionResult;
  }

  _buildAdaptiveWorkflowOutcomeMessage({
    status,
    resolverResult,
    failure = null,
    executionMode = "confirm",
    workflowResult = null,
  }) {
    if (status === "PROPOSED") {
      return String(
        resolverResult?.userFacingSummary ||
          "I found related records that need to be cleaned up first. I will handle them and then continue. Do you want me to proceed?",
      );
    }
    if (status === "EXECUTED") {
      if (workflowResult?.goalReached === false) {
        return String(
          workflowResult?.message ||
            "I cleaned up the open items, but I could not complete the final requested change yet.",
        );
      }
      return "Done. I applied the requested changes and cleaned up the related records.";
    }
    if (status === "BLOCKED") {
      return String(
        resolverResult?.blocked?.safeMessage ||
          failure?.safeMessage ||
          "I can’t apply that change right now.",
      );
    }
    if (status === "FAILED") {
      return String(
        failure?.safeMessage ||
          (executionMode === "auto_execute"
            ? "I couldn’t apply those changes due to a system error. Try again, or I can prepare them for confirmation."
            : "I couldn’t prepare those changes due to a system error. Try again, or I can prepare them for confirmation."),
      );
    }
    return "I couldn’t complete that request right now.";
  }

  async _tryAdaptiveWorkflowForBlockedMutation({
    error,
    detectorResult,
    requestContext,
    executionContext,
    policy,
    userMessage,
    toolExecutions,
    logger,
  }) {
    if (!this._adaptiveDomainConstraintsEnabled()) return null;
    if (String(error?.code || "").toUpperCase() !== "DOMAIN_RULE_BLOCKED") return null;

    const toolArgs = detectorResult?.proposalInput || {};
    const executionMode = this._resolveChatMutationExecutionMode({ requestContext, detectorResult });
    const blockedExisting =
      error?.domainRule?.existing && typeof error.domainRule.existing === "object"
        ? { ...error.domainRule.existing }
        : null;
    const resolvedEntity = requestContext?.resolvedEntity || executionContext?.resolvedEntity || null;
    const resolvedEntityMatchesTarget =
      resolvedEntity &&
      String(resolvedEntity.type || "").toLowerCase() === String(toolArgs.entityType || "").toLowerCase() &&
      Number(resolvedEntity.id) > 0 &&
      Number(resolvedEntity.id) === Number(toolArgs.entityId);
    const resolverExisting =
      blockedExisting ||
      (resolvedEntityMatchesTarget
        ? {
            ...(String(toolArgs.entityType || "").toLowerCase() === "client"
              ? { name: resolvedEntity.label || null }
              : { title: resolvedEntity.label || null }),
          }
        : null);
    const resolverResult = resolveAdaptiveMutationRemediation({
      requestedMutation: {
        entityType: toolArgs.entityType,
        entityId: toolArgs.entityId,
        operation: toolArgs.operation,
        payload: toolArgs.payload || {},
      },
      executionMode,
      existing: resolverExisting,
      allowFinancialAutoCleanup: false,
      mode: "proposal_preflight",
      evaluation: error?.domainRule?.evaluation || null,
    });

    this.engine.ledger.record?.({
      type: "mutation_constraint_adaptation_selected",
      sourceRoute: "/agent/chat",
      route: resolverResult?.route || "none",
      entityType: toolArgs.entityType || null,
      entityId: toolArgs.entityId || null,
      timestamp: new Date().toISOString(),
    });

    if (!resolverResult || resolverResult.route === "blocked") {
      const finalMessage = this._buildAdaptiveWorkflowOutcomeMessage({
        status: "BLOCKED",
        resolverResult,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: "BLOCKED",
          entityType: toolArgs.entityType || null,
          entityId: Number(toolArgs.entityId) || null,
          operation: toolArgs.operation || "update",
          safeMessage: finalMessage,
          reasonCode: "DOMAIN_CONSTRAINT_UNRESOLVED",
        }),
      };
    }

    if (resolverResult.route === "clarify") {
      const finalMessage = String(
        resolverResult?.clarification?.question ||
          "I need one more detail before I can safely continue.",
      );
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
      };
    }

    if (!resolverResult.workflowProposalInput) return null;

    let workflowProposalBundle;
    try {
      workflowProposalBundle = await this._createMutationWorkflowProposal({
        workflowProposalInput: resolverResult.workflowProposalInput,
        policy,
        executionContext,
      });
    } catch (workflowError) {
      const normalizedFailure = this._normalizeMutationToolOrExecutionFailure(workflowError, {
        phase: "proposal",
      });
      const finalMessage = this._buildAdaptiveWorkflowOutcomeMessage({
        status: normalizedFailure.outcome,
        resolverResult,
        failure: normalizedFailure,
        executionMode,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: normalizedFailure.outcome,
          entityType: toolArgs.entityType || null,
          entityId: Number(toolArgs.entityId) || null,
          operation: toolArgs.operation || "update",
          safeMessage: finalMessage,
          reasonCode: normalizedFailure.code,
          workflowType: resolverResult.workflowProposalInput.workflowType,
          factsSummary: resolverResult.facts || null,
        }),
      };
    }

    const { proposal } = workflowProposalBundle;
    toolExecutions.push({
      ok: true,
      toolName: "propose_mutation_workflow",
      args: resolverResult.workflowProposalInput,
      result: proposal,
      responseForModel: null,
    });

    const expiresAt = new Date(Date.now() + 300000).toISOString();
    if (typeof this.engine.storeProposal === "function") {
      this.engine.storeProposal(proposal, {
        explicitMutationCommand: false,
        strongMutationIntent: true,
        origin: "strong_mutation_intent",
        proposalKind: "entity_mutation_workflow",
        sourceRoute: "/agent/chat",
        conversationId: requestContext?.conversationId || null,
        sessionId: executionContext.sessionId || null,
        userId: executionContext.userId || null,
        tenantId: executionContext.tenantId || null,
        requiresExtraConfirmation: true,
        riskLevel: resolverResult.risk || "high",
      });
    }

    if (resolverResult.route !== "auto_execute_workflow") {
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification: null,
        pendingMutationProposal: {
          proposalId: proposal.proposalId,
          createdAt: new Date().toISOString(),
          expiresAt,
          riskLevel: resolverResult.risk || "high",
        },
        suppressMutationDetectionUntilResolved: true,
      });
      const artifactProposal =
        bindingAudit && bindingAudit.applied
          ? {
              ...proposal,
              confirmation: {
                ...(proposal?.confirmation || {}),
                scopeBinding: bindingAudit,
              },
            }
          : proposal;
      const proposalArtifact = toProposalArtifact(artifactProposal, executionContext.sessionId);
      const finalMessage = this._buildAdaptiveWorkflowOutcomeMessage({
        status: "PROPOSED",
        resolverResult,
        executionMode,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
        artifactType: "proposal",
        artifact: proposalArtifact,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: proposalArtifact,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: "PROPOSED",
          entityType: toolArgs.entityType || null,
          entityId: Number(toolArgs.entityId) || null,
          operation: toolArgs.operation || "update",
          proposalId: proposal.proposalId,
          workflowType: resolverResult.workflowProposalInput.workflowType,
          factsSummary: resolverResult.facts || null,
        }),
      };
    }

    let confirmResult;
    try {
      confirmResult = await this._tryAutoExecuteStoredProposal({
        proposal,
        executionContext,
      });
      const workflowResult = this._extractConfirmedWorkflowExecutionResult(confirmResult);
      toolExecutions.push({
        ok: true,
        toolName: "confirmProposal",
        args: { proposalId: proposal.proposalId },
        result: confirmResult,
        responseForModel: null,
      });
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification: null,
        pendingMutationProposal: null,
        suppressMutationDetectionUntilResolved: false,
      });
      const finalMessage = this._buildAdaptiveWorkflowOutcomeMessage({
        status: "EXECUTED",
        resolverResult,
        executionMode,
        workflowResult,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: "EXECUTED",
          entityType: toolArgs.entityType || null,
          entityId: Number(toolArgs.entityId) || null,
          operation: toolArgs.operation || "update",
          proposalId: proposal.proposalId,
          workflowType: resolverResult.workflowProposalInput.workflowType,
          goalReached: workflowResult.goalReached !== false,
          factsSummary: resolverResult.facts || null,
        }),
      };
    } catch (workflowExecError) {
      const normalizedFailure = this._normalizeMutationToolOrExecutionFailure(workflowExecError, {
        phase: "execution",
      });
      const finalMessage = this._buildAdaptiveWorkflowOutcomeMessage({
        status: normalizedFailure.outcome,
        resolverResult,
        failure: normalizedFailure,
        executionMode,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: normalizedFailure.outcome,
          entityType: toolArgs.entityType || null,
          entityId: Number(toolArgs.entityId) || null,
          operation: toolArgs.operation || "update",
          proposalId: proposal.proposalId,
          workflowType: resolverResult.workflowProposalInput.workflowType,
          reasonCode: normalizedFailure.code,
          safeMessage: finalMessage,
          factsSummary: resolverResult.facts || null,
        }),
      };
    }
  }

  _isBlockedMutationErrorCode(code) {
    return BLOCKED_MUTATION_ERROR_CODES.has(String(code || "").toUpperCase());
  }

  _normalizeMutationToolOrExecutionFailure(failure, context = {}) {
    const phase = String(context.phase || "mutation").toLowerCase();
    const errorObj =
      failure && typeof failure === "object" && failure.error && typeof failure.error === "object"
        ? failure.error
        : failure && typeof failure === "object"
          ? failure
          : {};
    const code = String(
      errorObj.code || failure?.code || failure?.reason || toErrorCode(failure?.message),
    )
      .trim()
      .toUpperCase() || "EXECUTION_ERROR";
    const internalMessage = String(
      errorObj.message || failure?.message || "Mutation operation failed",
    ).trim() || "Mutation operation failed";

    const outcome = this._isBlockedMutationErrorCode(code) ? "BLOCKED" : "FAILED";
    let safeMessage = "";

    if (outcome === "BLOCKED") {
      if (code === "RISK_ACK_REQUIRED") {
        safeMessage = "This change needs an extra confirmation before I can apply it.";
      } else if (code === "DOMAIN_RULE_BLOCKED") {
        safeMessage =
          internalMessage ||
          "I can’t apply that change because related records need to be updated first.";
      } else {
        safeMessage = "I can’t apply that change right now.";
      }
    } else if (code === "ENTITY_NOT_FOUND" || code === "SNAPSHOT_MISMATCH") {
      safeMessage =
        "I couldn’t apply that change because the record changed. Try again, and I can prepare the update again if needed.";
    } else if (phase === "proposal") {
      safeMessage =
        "I couldn’t prepare that change due to a system error. Try again, or I can help you prepare it for confirmation.";
    } else {
      safeMessage =
        "I couldn’t update the record due to a system error. Try again, or I can prepare the change for confirmation.";
    }

    return {
      outcome,
      code,
      internalMessage,
      safeMessage,
      canRetry: true,
      canProposeFallback: phase !== "proposal",
    };
  }

  _describeMutationTarget(detectorResult = null) {
    const entityType = String(detectorResult?.proposalInput?.entityType || "").toLowerCase();
    const operation = String(detectorResult?.proposalInput?.operation || "update").toLowerCase();
    const metadata = detectorResult?.metadata || {};
    const field = String(metadata.field || "").toLowerCase();
    const payload = detectorResult?.proposalInput?.payload || {};
    if (entityType === "client" && field === "status") {
      const statusValue = String(payload.status || "").toLowerCase();
      if (statusValue === "inactive" || payload.status === "inActive") {
        return {
          objectLabel: "the client",
          proposalLabel: "mark the client as inactive",
          completedLabel: "marked the client as inactive",
        };
      }
      return {
        objectLabel: "the client",
        proposalLabel: "update the client status",
        completedLabel: "updated the client status",
      };
    }
    const prettyEntity = entityType ? entityType.replace(/_/g, " ") : "record";
    const prettyField = field ? field.replace(/_/g, " ") : "record";
    if (operation === "create") {
      return {
        objectLabel: `new ${prettyEntity}`,
        proposalLabel: `create a new ${prettyEntity}`,
        completedLabel: `created a new ${prettyEntity}`,
      };
    }
    if (operation === "delete") {
      return {
        objectLabel: `the ${prettyEntity}`,
        proposalLabel: `delete the ${prettyEntity}`,
        completedLabel: `deleted the ${prettyEntity}`,
      };
    }
    return {
      objectLabel: `the ${prettyEntity}`,
      proposalLabel: `update the ${prettyEntity} ${prettyField}`,
      completedLabel: `updated the ${prettyEntity} ${prettyField}`,
    };
  }

  _buildUserFacingMutationOutcomeMessage({
    status,
    detectorResult,
    failure = null,
    executionMode = "confirm",
  }) {
    const labels = this._describeMutationTarget(detectorResult);
    const operation = String(detectorResult?.proposalInput?.operation || "update").toLowerCase();
    const genericBlocked = String(failure?.safeMessage || "").trim() === "I can’t apply that change right now.";
    if (status === "EXECUTED") {
      return `Done. I ${labels.completedLabel}.`;
    }
    if (status === "PROPOSED") {
      return `I can ${labels.proposalLabel}. Confirm?`;
    }
    if (status === "BLOCKED") {
      if (genericBlocked && operation === "create") {
        return `I couldn’t prepare ${labels.objectLabel} yet because I still need more context. Please provide the parent reference (for example the client or dossier).`;
      }
      return String(failure?.safeMessage || "I can’t apply that change right now.");
    }
    if (status === "FAILED") {
      if (executionMode === "auto_execute") {
        return String(
          failure?.safeMessage ||
            "I couldn’t update the record due to a system error. Try again, or I can prepare the change for confirmation.",
        );
      }
      return String(
        failure?.safeMessage ||
          "I couldn’t prepare that change due to a system error. Try again, or I can help you prepare it for confirmation.",
      );
    }
    return "I couldn’t complete that change safely.";
  }

  _recordMutationOutcomeLedger(logger, payload = {}) {
    logMutationIntentActionOutcome(logger, payload);
  }

  _buildMutationOutcomeEnvelope(payload = {}) {
    const allowed = new Set(["EXECUTED", "PROPOSED", "FAILED", "BLOCKED"]);
    const status = String(payload.status || "").toUpperCase();
    if (!allowed.has(status)) {
      return {
        ...payload,
        status: "FAILED",
        reasonCode: payload.reasonCode || "INVALID_MUTATION_OUTCOME",
        safeMessage:
          payload.safeMessage || "I couldn’t complete that change due to a system error.",
      };
    }
    return { ...payload, status };
  }

  _extractConfirmedMutationExecutionResult(confirmResult = null, { operation = "update" } = {}) {
    const actionResult = confirmResult?.executedActions?.[0]?.result;
    if (!actionResult || typeof actionResult !== "object") {
      const err = new Error("Mutation execution returned no result.");
      err.code = "MUTATION_EXECUTION_RESULT_INVALID";
      throw err;
    }
    if (actionResult.ok !== true) {
      const err = new Error("Mutation execution did not succeed.");
      err.code = String(actionResult.errorCode || actionResult.code || "MUTATION_EXECUTION_FAILED");
      throw err;
    }
    if (String(operation || "").toLowerCase() === "update") {
      const rowCount = Number(actionResult.rowCount);
      if (!Number.isFinite(rowCount) || rowCount !== 1) {
        const err = new Error("Mutation execution did not update exactly one record.");
        err.code = "MUTATION_ROWCOUNT_INVALID";
        throw err;
      }
    }
    return actionResult;
  }

  async _createMutationProposalFromStrongIntent({
    detectorResult,
    policy,
    executionContext,
    userMessage,
  }) {
    this._debugChatMutation("create_mutation_proposal:start", {
      operation: detectorResult?.proposalInput?.operation || null,
      entityType: detectorResult?.proposalInput?.entityType || null,
      entityId: detectorResult?.proposalInput?.entityId || null,
      parent: detectorResult?.proposalInput?.parent || null,
      payloadKeys: Object.keys(detectorResult?.proposalInput?.payload || {}),
      confidence: detectorResult?.scores?.finalConfidence ?? null,
    });
    let bindingAudit = null;
    let toolArgs;
    if (
      this._scopeBindingEnabled() &&
      this.scopeManager &&
      typeof this.scopeManager.resolveBindingsForProposalInput === "function"
    ) {
      const scopeBinding = await this.scopeManager.resolveBindingsForProposalInput({
        proposalInput: detectorResult?.proposalInput || {},
        requestContext: executionContext,
        executionContext,
        lookupFns: {},
        // Wrap existing ad-hoc deterministic enrichment instead of duplicating it.
        legacyEnricher: async (proposalInputCandidate) =>
          this._enrichCreateMutationProposalInputWithContext({
            detectorResult: { ...detectorResult, proposalInput: proposalInputCandidate },
            policy,
            executionContext,
          }),
      });
      bindingAudit = scopeBinding?.bindingAudit || null;
      if (scopeBinding?.clarification?.message) {
        const err = new Error(scopeBinding.clarification.message);
        err.code = "CREATE_PLANNER_CLARIFY";
        err.clarificationQuestions = [scopeBinding.clarification.message];
        throw err;
      }
      toolArgs = scopeBinding?.proposalInput || detectorResult?.proposalInput || {};
    } else {
      toolArgs = await this._enrichCreateMutationProposalInputWithContext({
        detectorResult,
        policy,
        executionContext,
      });
    }
    let plannerResult = null;
    if (String(toolArgs?.operation || "").toLowerCase() === "create") {
      plannerResult = await planEntityCreation(
        {
          entityType: toolArgs?.entityType,
          resolvedEntityContext: { parent: toolArgs?.parent || null },
          conversationContext: String(userMessage || ""),
          extractedSignals: {
            parent: toolArgs?.parent || null,
            detector: {
              confidence: detectorResult?.scores?.finalConfidence ?? null,
              reasonCode: detectorResult?.reasonCode || detectorResult?.stage3Decision?.reason || null,
            },
          },
        },
        {
          logger: (entry) => this._debugChatMutation("entity_creation_planner", entry),
        },
      );
      this._debugChatMutation("create_mutation_proposal:planner_result", {
        hasPayload: Boolean(plannerResult?.enrichedPayload),
        clarificationCount: Array.isArray(plannerResult?.clarificationQuestions)
          ? plannerResult.clarificationQuestions.length
          : 0,
        confidence: plannerResult?.confidence ?? null,
        source: plannerResult?.source || null,
        semanticProfile: plannerResult?.semanticProfile || null,
      });
      if (Array.isArray(plannerResult?.clarificationQuestions) && plannerResult.clarificationQuestions.length > 0) {
        const err = new Error(plannerResult.clarificationQuestions[0]);
        err.code = "CREATE_PLANNER_CLARIFY";
        err.clarificationQuestions = plannerResult.clarificationQuestions;
        err.plannerResult = plannerResult;
        throw err;
      }
      if (plannerResult?.enrichedPayload && typeof plannerResult.enrichedPayload === "object") {
        const existingPayload = toolArgs.payload && typeof toolArgs.payload === "object" ? { ...toolArgs.payload } : {};
        toolArgs.payload = { ...existingPayload, ...plannerResult.enrichedPayload };
        for (const fk of ["client_id", "dossier_id", "lawsuit_id", "mission_id", "task_id"]) {
          if (Object.prototype.hasOwnProperty.call(existingPayload, fk) && existingPayload[fk] != null) {
            toolArgs.payload[fk] = existingPayload[fk];
          }
        }
      }
      if (typeof plannerResult?.semanticProfile?.summary === "string" && plannerResult.semanticProfile.summary.trim()) {
        toolArgs.reasoningSummary = plannerResult.semanticProfile.summary.trim().slice(0, 280);
      }
    }
    this._debugChatMutation("create_mutation_proposal:tool_args_enriched", {
      operation: toolArgs?.operation || null,
      entityType: toolArgs?.entityType || null,
      entityId: toolArgs?.entityId || null,
      parent: toolArgs?.parent || null,
      payloadKeys: Object.keys(toolArgs?.payload || {}),
    });
    const stage3ExecutionContext = {
      ...executionContext,
      posture: "WORK",
      confirmed: true,
      strongMutationIntent: true,
      explicitMutationCommand: false,
      sourceRoute: "/agent/chat",
      creationPlannerMeta: plannerResult || null,
    };
    const v2Result = await this.engine.executeToolV2(
      "propose_entity_mutation",
      toolArgs,
      policy,
      stage3ExecutionContext,
    );
    this._debugChatMutation("create_mutation_proposal:tool_result", {
      proposalId: v2Result?.result?.proposalId || null,
      status: v2Result?.result?.status || null,
      actionType: v2Result?.result?.actionType || null,
      requiresConfirmation: v2Result?.result?.requiresConfirmation ?? null,
      error: v2Result?.error || null,
    });
    const proposal = v2Result?.result;
    if (!proposal?.proposalId || proposal.requiresConfirmation !== true) {
      const err = new Error("Failed to create mutation proposal.");
      err.code = "MUTATION_PROPOSAL_INVALID";
      throw err;
    }
    return { proposal, toolArgs, stage3ExecutionContext, plannerResult, bindingAudit };
  }

  async _enrichCreateMutationProposalInputWithContext({
    detectorResult,
    policy,
    executionContext,
  }) {
    const toolArgs = detectorResult?.proposalInput
      ? JSON.parse(JSON.stringify(detectorResult.proposalInput))
      : {};
    const operation = String(toolArgs?.operation || "").toLowerCase();
    if (operation !== "create") return toolArgs;

    const entityType = String(toolArgs?.entityType || "").toLowerCase();
    const parent = toolArgs?.parent && typeof toolArgs.parent === "object" ? toolArgs.parent : null;
    this._debugChatMutation("create_context_enrichment:input", {
      entityType,
      parent,
      payloadKeys: Object.keys(toolArgs?.payload || {}),
    });
    if (!parent) return toolArgs;

    if (entityType === "lawsuit" && String(parent.entityType || "").toLowerCase() === "client") {
      const clientId = Number(parent.entityId);
      if (!Number.isInteger(clientId) || clientId <= 0) return toolArgs;

      const dossierExec = await this._executeToolByName({
        toolName: "listDossiersForClient",
        args: { clientId, limit: 25 },
        policy,
        executionContext,
      });
      this._debugChatMutation("create_context_enrichment:list_dossiers_for_client", {
        clientId,
        ok: Boolean(dossierExec?.ok),
        error: dossierExec?.error || null,
        count: Number(dossierExec?.result?.count) || 0,
      });
      if (!dossierExec?.ok) return toolArgs;
      const dossiers = Array.isArray(dossierExec?.result?.dossiers) ? dossierExec.result.dossiers : [];
      const active = dossiers.filter((d) => String(d?.status || "").toLowerCase() !== "closed");
      const candidates = active.length > 0 ? active : dossiers;
      this._debugChatMutation("create_context_enrichment:dossier_candidates", {
        clientId,
        dossiers: dossiers.slice(0, 5).map((d) => ({
          id: Number(d?.id) || null,
          reference: d?.reference || d?.code || null,
          title: d?.title || null,
          status: d?.status || null,
        })),
        activeCount: active.length,
        candidateCount: candidates.length,
      });
      if (candidates.length === 1 && Number.isInteger(Number(candidates[0]?.id))) {
        const dossierId = Number(candidates[0].id);
        toolArgs.parent = {
          entityType: "dossier",
          entityId: dossierId,
          source: "context_inferred_from_client",
        };
        if (!toolArgs.payload || typeof toolArgs.payload !== "object") toolArgs.payload = {};
        if (!toolArgs.payload.dossier_id) toolArgs.payload.dossier_id = dossierId;
        this._debugChatMutation("create_context_enrichment:resolved_parent", {
          childEntityType: entityType,
          originalParent: parent,
          resolvedParent: toolArgs.parent,
          dossierId,
        });
        return toolArgs;
      }

      const err = new Error(
        candidates.length === 0
          ? "No dossier found for this client. Please choose the dossier before creating the lawsuit."
          : "Multiple dossiers found for this client. Please specify which dossier should contain the new lawsuit.",
      );
      err.code = candidates.length === 0 ? "PARENT_CONTEXT_DOSSIER_NOT_FOUND" : "PARENT_CONTEXT_DOSSIER_AMBIGUOUS";
      this._debugChatMutation("create_context_enrichment:failed", {
        code: err.code,
        message: err.message,
        clientId,
        candidateCount: candidates.length,
      });
      throw err;
    }

    // Dossier creation starts from a client parent; ensure the service-required FK is present.
    if (entityType === "dossier" && String(parent.entityType || "").toLowerCase() === "client") {
      const clientId = Number(parent.entityId);
      if (Number.isInteger(clientId) && clientId > 0) {
        if (!toolArgs.payload || typeof toolArgs.payload !== "object") toolArgs.payload = {};
        if (!toolArgs.payload.client_id) toolArgs.payload.client_id = clientId;
        this._debugChatMutation("create_context_enrichment:resolved_parent", {
          childEntityType: entityType,
          originalParent: parent,
          resolvedParent: parent,
          clientId,
        });
      }
      return toolArgs;
    }

    return toolArgs;
  }

  async _tryAutoExecuteStoredProposal({ proposal, executionContext }) {
    if (typeof this.engine.confirmProposal !== "function") {
      const err = new Error("Mutation execution is not available in this chat context.");
      err.code = "EXECUTION_NOT_PERMITTED";
      throw err;
    }
    return this.engine.confirmProposal({
      proposalId: proposal.proposalId,
      sessionId: executionContext?.sessionId || null,
      userId: executionContext?.userId || null,
      ackRisk: false,
    });
  }

  async _executeDetectedMutationFlow({
    detectorResult,
    requestContext,
    executionContext,
    policy,
    userMessage,
  }) {
    const logger = this._buildMutationDetectorLogger();
    const mutationPolicy = this._resolveMutationOrchestrationPolicy(policy);
    const executionMode = this._resolveChatMutationExecutionMode({
      requestContext,
      detectorResult,
      policy: mutationPolicy,
    });
    const toolExecutions = [];
    const toolArgs = detectorResult?.proposalInput || null;

    logMutationIntentActionAttempted(logger, {
      sourceRoute: "/agent/chat",
      stage: "proposal",
      toolName: "propose_entity_mutation",
      executionMode,
      entityType: toolArgs?.entityType || null,
      entityId: toolArgs?.entityId || null,
      operation: toolArgs?.operation || null,
      field: detectorResult?.metadata?.field || null,
      finalConfidence: detectorResult?.scores?.finalConfidence ?? null,
    });

    let proposalBundle;
    try {
      proposalBundle = await this._createMutationProposalFromStrongIntent({
        detectorResult,
        policy: mutationPolicy,
        executionContext,
        userMessage,
      });
    } catch (error) {
      if (String(error?.code || "").toUpperCase() === "CREATE_PLANNER_CLARIFY") {
        const finalMessage = String(
          Array.isArray(error?.clarificationQuestions) && error.clarificationQuestions.length > 0
            ? error.clarificationQuestions[0]
            : error?.message || "I need one more detail before I can prepare this new record.",
        );
        this._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture: "WORK",
          toolExecutions: [],
        });
        return {
          message: finalMessage,
          agentVersion: policy.version,
          posture: "WORK",
          toolExecutions: [],
          stepCommentaries: [],
          rounds: 0,
          ambiguityArtifact: null,
          resolutionMeta: { planner: error?.plannerResult || null },
          availableTools: [],
          suppressIntentFraming: true,
          suppressCommentary: false,
        };
      }
      const adaptiveResponse = await this._tryAdaptiveWorkflowForBlockedMutation({
        error,
        detectorResult,
        requestContext,
        executionContext,
        policy: mutationPolicy,
        userMessage,
        toolExecutions,
        logger,
      });
      if (adaptiveResponse) {
        return adaptiveResponse;
      }
      this._debugChatMutation("proposal_failed", {
        code: error?.code || error?.reason || null,
        message: error?.message || null,
        policyVersion: mutationPolicy?.version || policy?.version || null,
        entityType: toolArgs?.entityType || null,
        entityId: toolArgs?.entityId || null,
      });
      const normalizedFailure = this._normalizeMutationToolOrExecutionFailure(error, {
        phase: "proposal",
      });
      const finalMessage = this._buildUserFacingMutationOutcomeMessage({
        status: normalizedFailure.outcome,
        detectorResult,
        failure: normalizedFailure,
        executionMode,
      });
      this._recordMutationOutcomeLedger(logger, {
        sourceRoute: "/agent/chat",
        outcome: normalizedFailure.outcome,
        stage: "proposal",
        toolName: "propose_entity_mutation",
        success: false,
        reasonCode: normalizedFailure.code,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: normalizedFailure.outcome,
          entityType: toolArgs?.entityType || null,
          entityId: toolArgs?.entityId || null,
          operation: toolArgs?.operation || detectorResult?.proposalInput?.operation || "update",
          field: detectorResult?.metadata?.field || null,
          value: toolArgs?.payload?.[detectorResult?.metadata?.field] ?? null,
          reasonCode: normalizedFailure.code,
          safeMessage: finalMessage,
        }),
      };
    }

    const { proposal, toolArgs: resolvedToolArgs, bindingAudit } = proposalBundle;
    const proposalRequiresExtraConfirmation =
      detectorResult.requiresExtraConfirmation === true ||
      proposal?.confirmation?.extraRiskAck === true;
    toolExecutions.push({
      ok: true,
      toolName: "propose_entity_mutation",
      args: resolvedToolArgs,
      result: proposal,
      responseForModel: null,
    });

    const expiresAt = new Date(Date.now() + 300000).toISOString();
    if (typeof this.engine.storeProposal === "function") {
      this.engine.storeProposal(proposal, {
        explicitMutationCommand: false,
        strongMutationIntent: true,
        origin: "strong_mutation_intent",
        proposalKind: "entity_mutation",
        sourceRoute: "/agent/chat",
        conversationId: requestContext?.conversationId || null,
        sessionId: executionContext.sessionId || null,
        userId: executionContext.userId || null,
        tenantId: executionContext.tenantId || null,
        detectionConfidence: detectorResult.scores?.finalConfidence ?? null,
        detectionScores: detectorResult.scores || null,
        riskLevel: proposalRequiresExtraConfirmation ? "high" : detectorResult.risk || "low",
        requiresExtraConfirmation: proposalRequiresExtraConfirmation,
        scopeBinding: bindingAudit || null,
      });
    }

    logMutationIntentProposalCreated(logger, {
      proposalId: proposal.proposalId,
      entityType: resolvedToolArgs.entityType,
      entityId: resolvedToolArgs.entityId,
      operation: resolvedToolArgs.operation,
      finalConfidence: detectorResult.scores?.finalConfidence ?? null,
      riskLevel: proposalRequiresExtraConfirmation ? "high" : detectorResult.risk || "low",
      sourceRoute: "/agent/chat",
    });

    const forceProposal =
      executionMode !== "auto_execute" || proposalRequiresExtraConfirmation === true;

    if (forceProposal) {
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification: null,
        pendingMutationProposal: {
          proposalId: proposal.proposalId,
          createdAt: new Date().toISOString(),
          expiresAt,
          riskLevel: proposalRequiresExtraConfirmation ? "high" : detectorResult.risk || "low",
        },
        suppressMutationDetectionUntilResolved: true,
      });

      const artifactProposal =
        bindingAudit && bindingAudit.applied
          ? {
              ...proposal,
              confirmation: {
                ...(proposal?.confirmation || {}),
                scopeBinding: bindingAudit,
              },
            }
          : proposal;
      const proposalArtifact = toProposalArtifact(artifactProposal, executionContext.sessionId);
      const finalMessage = this._buildUserFacingMutationOutcomeMessage({
        status: "PROPOSED",
        detectorResult,
        executionMode,
      });

      this._recordMutationOutcomeLedger(logger, {
        sourceRoute: "/agent/chat",
        outcome: "PROPOSED",
        stage: "proposal",
        toolName: "propose_entity_mutation",
        success: true,
        proposalId: proposal.proposalId,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
        artifactType: "proposal",
        artifact: proposalArtifact,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: proposalArtifact,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: "PROPOSED",
          entityType: resolvedToolArgs.entityType,
          entityId: resolvedToolArgs.entityId,
          operation: "update",
          field: detectorResult?.metadata?.field || null,
          value: resolvedToolArgs?.payload?.[detectorResult?.metadata?.field] ?? null,
          proposalId: proposal.proposalId,
        }),
      };
    }

    logMutationIntentActionAttempted(logger, {
      sourceRoute: "/agent/chat",
      stage: "execution",
      toolName: "confirmProposal",
      executionMode,
      proposalId: proposal.proposalId,
      entityType: resolvedToolArgs.entityType,
      entityId: resolvedToolArgs.entityId,
      operation: resolvedToolArgs.operation,
    });

    let confirmResult;
    try {
      confirmResult = await this._tryAutoExecuteStoredProposal({
        proposal,
        executionContext,
      });
    } catch (error) {
      this._debugChatMutation("execution_failed", {
        code: error?.code || error?.reason || null,
        message: error?.message || null,
        proposalId: proposal?.proposalId || null,
      });
      const normalizedFailure = this._normalizeMutationToolOrExecutionFailure(error, {
        phase: "execution",
      });
      const finalMessage = this._buildUserFacingMutationOutcomeMessage({
        status: normalizedFailure.outcome,
        detectorResult,
        failure: normalizedFailure,
        executionMode,
      });
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification: null,
        pendingMutationProposal: null,
        suppressMutationDetectionUntilResolved: false,
      });
      this._recordMutationOutcomeLedger(logger, {
        sourceRoute: "/agent/chat",
        outcome: normalizedFailure.outcome,
        stage: "execution",
        toolName: "confirmProposal",
        success: false,
        reasonCode: normalizedFailure.code,
        proposalId: proposal.proposalId,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: normalizedFailure.outcome,
          entityType: resolvedToolArgs.entityType,
          entityId: resolvedToolArgs.entityId,
          operation: "update",
          field: detectorResult?.metadata?.field || null,
          value: resolvedToolArgs?.payload?.[detectorResult?.metadata?.field] ?? null,
          proposalId: proposal.proposalId,
          reasonCode: normalizedFailure.code,
          safeMessage: finalMessage,
        }),
      };
    }

    const confirmStatus = String(confirmResult?.status || "").toLowerCase();
    if (confirmStatus !== "success") {
      const normalizedFailure = this._normalizeMutationToolOrExecutionFailure(confirmResult, {
        phase: "execution",
      });
      const finalMessage = this._buildUserFacingMutationOutcomeMessage({
        status: normalizedFailure.outcome,
        detectorResult,
        failure: normalizedFailure,
        executionMode,
      });
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification: null,
        pendingMutationProposal: null,
        suppressMutationDetectionUntilResolved: false,
      });
      this._recordMutationOutcomeLedger(logger, {
        sourceRoute: "/agent/chat",
        outcome: normalizedFailure.outcome,
        stage: "execution",
        toolName: "confirmProposal",
        success: false,
        reasonCode: normalizedFailure.code,
        proposalId: proposal.proposalId,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: normalizedFailure.outcome,
          entityType: resolvedToolArgs.entityType,
          entityId: resolvedToolArgs.entityId,
          operation: "update",
          field: detectorResult?.metadata?.field || null,
          value: resolvedToolArgs?.payload?.[detectorResult?.metadata?.field] ?? null,
          proposalId: proposal.proposalId,
          reasonCode: normalizedFailure.code,
          safeMessage: finalMessage,
        }),
      };
    }

    try {
      this._extractConfirmedMutationExecutionResult(confirmResult, {
        operation: resolvedToolArgs?.operation || "update",
      });
    } catch (error) {
      const normalizedFailure = this._normalizeMutationToolOrExecutionFailure(error, {
        phase: "execution",
      });
      const finalMessage = this._buildUserFacingMutationOutcomeMessage({
        status: normalizedFailure.outcome,
        detectorResult,
        failure: normalizedFailure,
        executionMode,
      });
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification: null,
        pendingMutationProposal: null,
        suppressMutationDetectionUntilResolved: false,
      });
      this._recordMutationOutcomeLedger(logger, {
        sourceRoute: "/agent/chat",
        outcome: normalizedFailure.outcome,
        stage: "execution",
        toolName: "confirmProposal",
        success: false,
        reasonCode: normalizedFailure.code,
        proposalId: proposal.proposalId,
      });
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions,
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions,
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: normalizedFailure.outcome,
          entityType: resolvedToolArgs.entityType,
          entityId: resolvedToolArgs.entityId,
          operation: "update",
          field: detectorResult?.metadata?.field || null,
          value: resolvedToolArgs?.payload?.[detectorResult?.metadata?.field] ?? null,
          proposalId: proposal.proposalId,
          reasonCode: normalizedFailure.code,
          safeMessage: finalMessage,
        }),
      };
    }

    toolExecutions.push({
      ok: true,
      toolName: "confirmProposal",
      args: { proposalId: proposal.proposalId },
      result: confirmResult,
      responseForModel: null,
    });
    this._updateOperationalMutationDetectionState(requestContext, {
      pendingMutationClarification: null,
      pendingMutationProposal: null,
      suppressMutationDetectionUntilResolved: false,
    });
    const finalMessage = this._buildUserFacingMutationOutcomeMessage({
      status: "EXECUTED",
      detectorResult,
      executionMode,
    });
    this._recordMutationOutcomeLedger(logger, {
      sourceRoute: "/agent/chat",
      outcome: "EXECUTED",
      stage: "execution",
      toolName: "confirmProposal",
      success: true,
      proposalId: proposal.proposalId,
    });
    this._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture: "WORK",
      toolExecutions,
    });
    return {
      message: finalMessage,
      agentVersion: policy.version,
      posture: "WORK",
      toolExecutions,
      stepCommentaries: [],
      rounds: 0,
      ambiguityArtifact: null,
      resolutionMeta: null,
      availableTools: [],
      suppressIntentFraming: true,
      suppressCommentary: false,
      mutationOutcome: this._buildMutationOutcomeEnvelope({
        status: "EXECUTED",
        entityType: resolvedToolArgs.entityType,
        entityId: resolvedToolArgs.entityId,
        operation: "update",
        field: detectorResult?.metadata?.field || null,
        value: resolvedToolArgs?.payload?.[detectorResult?.metadata?.field] ?? null,
        proposalId: proposal.proposalId,
      }),
    };
  }

  async _tryHandleStrongMutationIntentDetection({
    userMessage,
    effectiveUserMessage,
    requestContext,
    executionContext,
    llmHistory,
    policy,
  }) {
    const detectorConfig = getMutationIntentDetectorConfig();
    if (!detectorConfig.enabled) return null;
    const semantic = normalizeMutationSemantics(effectiveUserMessage);
    const detectorInputMessage = semantic?.canonicalMessage || effectiveUserMessage;

    const state = this._getOperationalMutationDetectionState(requestContext) || {};
    const nowMs = Date.now();
    const pendingProposal = state.pendingMutationProposal || null;
    const pendingProposalActive =
      pendingProposal &&
      pendingProposal.proposalId &&
      (!pendingProposal.expiresAt || Date.parse(pendingProposal.expiresAt) > nowMs);

    if (pendingProposal && !pendingProposalActive) {
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationProposal: null,
        suppressMutationDetectionUntilResolved: false,
      });
    }

    if (
      state.suppressMutationDetectionUntilResolved === true &&
      pendingProposalActive
    ) {
      return null;
    }

    const candidateMutation = state.candidateMutation || null;
    if (
      candidateMutation &&
      candidateMutation.detectorResult &&
      !pendingProposalActive &&
      isConfirmationResumeMessage(effectiveUserMessage)
    ) {
      this._setConversationMode(requestContext, "execution");
      return this._executeDetectedMutationFlow({
        detectorResult: candidateMutation.detectorResult,
        requestContext,
        executionContext,
        policy,
        userMessage,
      });
    }

    const mutationIntent = await detectMutationIntent(effectiveUserMessage, {
      // semantic-normalized message lets detector stay simple while route stays deterministic
      llmHistory,
      executionContext,
      pendingClarification: state.pendingMutationClarification || null,
      llmExtractor: this.mutationIntentExtractor,
      entityNameResolver: ({ entityType, query, message }) =>
        this._resolveMutationEntityByName({
          entityType,
          query,
          message,
          policy,
          executionContext,
        }),
      logger: this._buildMutationDetectorLogger(),
      sourceRoute: "/agent/chat",
    });

    let normalizedMutationIntent = mutationIntent;
    if (
      detectorInputMessage &&
      detectorInputMessage !== effectiveUserMessage &&
      (!mutationIntent || !mutationIntent.entityId || mutationIntent.routeDecision === "clarify")
    ) {
      normalizedMutationIntent = await detectMutationIntent(detectorInputMessage, {
        llmHistory,
        executionContext,
        pendingClarification: state.pendingMutationClarification || null,
        llmExtractor: this.mutationIntentExtractor,
        entityNameResolver: ({ entityType, query, message }) =>
          this._resolveMutationEntityByName({
            entityType,
            query,
            message,
            policy,
            executionContext,
          }),
        logger: this._buildMutationDetectorLogger(),
        sourceRoute: "/agent/chat",
      });
    }
    const effectiveMutationIntent = normalizedMutationIntent || mutationIntent;
    this._debugChatMutation("detector_result", {
      intentType: effectiveMutationIntent?.intentType || null,
      routeDecision: effectiveMutationIntent?.routeDecision || null,
      operation: effectiveMutationIntent?.operation || effectiveMutationIntent?.proposalInput?.operation || null,
      entityType: effectiveMutationIntent?.entityType || effectiveMutationIntent?.proposalInput?.entityType || null,
      entityId: effectiveMutationIntent?.entityId || effectiveMutationIntent?.proposalInput?.entityId || null,
      reasonCode: effectiveMutationIntent?.reasonCode || null,
      question: effectiveMutationIntent?.question || null,
      proposalInput: effectiveMutationIntent?.stage3Decision?.proposalInput || effectiveMutationIntent?.proposalInput || null,
    });

    if (!effectiveMutationIntent) {
      const noIntentDecision = decideMutationMode({
        message: effectiveUserMessage,
        mutationIntent: null,
        candidateMutation,
        semantic,
      });
      this._setConversationMode(requestContext, noIntentDecision.mode);
      if (noIntentDecision.decision === "CLARIFY_ENTITY") {
        const finalMessage = "Which record do you want me to update? I can prepare a confirmation once I identify it.";
        this._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture: "WORK",
          toolExecutions: [],
        });
        return {
          message: finalMessage,
          agentVersion: policy.version,
          posture: "WORK",
          toolExecutions: [],
          stepCommentaries: [],
          rounds: 0,
          ambiguityArtifact: null,
          resolutionMeta: null,
          availableTools: [],
          suppressIntentFraming: true,
          suppressCommentary: false,
        };
      }
      return null;
    }

    const modeDecision = decideMutationMode({
      message: effectiveUserMessage,
      mutationIntent: effectiveMutationIntent,
      candidateMutation,
      semantic,
    });
    this._setConversationMode(requestContext, modeDecision.mode);
    const capabilityDecision = classifyCapabilitySupport({
      semantic,
      mutationIntent: effectiveMutationIntent,
    });

    if (effectiveMutationIntent.routeDecision === "clarify") {
      const detectorResult = effectiveMutationIntent.stage3Decision || null;
      if (
        semantic?.strongMutationIntent === true &&
        capabilityDecision.support === "single_field" &&
        String(effectiveMutationIntent?.reasonCode || "").toLowerCase() === "operation_not_supported"
      ) {
        const finalMessage =
          "I recognized a mutation request, but I need one more detail to prepare the right confirmation-ready change. Please confirm the target record and exact status change.";
        this._setConversationMode(requestContext, "clarification", {
          candidateMutation: {
            semantic,
            mutationIntent: effectiveMutationIntent,
            createdAt: new Date().toISOString(),
          },
        });
        this._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture: "WORK",
          toolExecutions: [],
        });
        return {
          message: finalMessage,
          agentVersion: policy.version,
          posture: "WORK",
          toolExecutions: [],
          stepCommentaries: [],
          rounds: 0,
          ambiguityArtifact: null,
          resolutionMeta: null,
          availableTools: [],
          suppressIntentFraming: true,
          suppressCommentary: false,
        };
      }
      this._updateOperationalMutationDetectionState(requestContext, {
        pendingMutationClarification:
          detectorResult?.clearPendingClarification === true
            ? null
            : detectorResult?.pendingClarification !== undefined
              ? detectorResult.pendingClarification
              : state.pendingMutationClarification || null,
        suppressMutationDetectionUntilResolved:
          detectorResult?.pendingClarification ? true : false,
        candidateMutation:
          modeDecision.decision === "CLARIFY_ENTITY" && effectiveMutationIntent.entityId
            ? {
                detectorResult: effectiveMutationIntent.stage3Decision || null,
                mutationIntent: effectiveMutationIntent,
                semantic,
                createdAt: new Date().toISOString(),
              }
            : state.candidateMutation || null,
      });

      const finalMessage = String(effectiveMutationIntent.question || detectorResult?.question || "").trim() ||
        "I need one more detail to prepare a safe mutation proposal.";
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
      };
    }

    if (effectiveMutationIntent.routeDecision === "blocked") {
      this._updateOperationalMutationDetectionState(requestContext, {
        candidateMutation:
          modeDecision.decision === "FORCE_MUTATION_PROPOSAL" && effectiveMutationIntent.entityId
            ? {
                detectorResult: effectiveMutationIntent.stage3Decision || null,
                mutationIntent: effectiveMutationIntent,
                semantic,
                createdAt: new Date().toISOString(),
              }
            : state.candidateMutation || null,
      });
      const finalMessage = String(
        effectiveMutationIntent.safeMessage || "I can’t apply that change right now.",
      );
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
      });
      return {
        message: finalMessage,
        agentVersion: policy.version,
        posture: "WORK",
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        resolutionMeta: null,
        availableTools: [],
        suppressIntentFraming: true,
        suppressCommentary: false,
        mutationOutcome: this._buildMutationOutcomeEnvelope({
          status: "BLOCKED",
          entityType: effectiveMutationIntent.entityType || null,
          entityId: effectiveMutationIntent.entityId || null,
          operation: effectiveMutationIntent.operation || "unknown",
          field: effectiveMutationIntent.field || null,
          value: effectiveMutationIntent.value ?? null,
          reasonCode: effectiveMutationIntent.reasonCode || "MUTATION_INTENT_BLOCKED",
          safeMessage: finalMessage,
        }),
      };
    }

    if (effectiveMutationIntent.routeDecision !== "orchestrate") return null;

    const detectorResult = effectiveMutationIntent.stage3Decision || null;
    if (!detectorResult || detectorResult.decision !== "propose") return null;
    if (detectorResult.shadowMode === true) {
      return null;
    }
    this._updateOperationalMutationDetectionState(requestContext, {
      mode: "execution",
      candidateMutation: {
        detectorResult,
        mutationIntent: effectiveMutationIntent,
        semantic,
        createdAt: new Date().toISOString(),
      },
    });
    return this._executeDetectedMutationFlow({
      detectorResult,
      requestContext,
      executionContext,
      policy,
      userMessage,
    });
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
      this.engine.ledger.record({
        type: "chat_mode_tool_call_rejected",
        toolName,
        reason: "TOOL_NOT_EXPOSED",
        timestamp: new Date().toISOString(),
      });
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
      this.engine.ledger.record({
        type: "chat_mode_tool_call_rejected",
        toolName,
        reason: "TOOL_ARGUMENTS_INVALID_JSON",
        timestamp: new Date().toISOString(),
      });
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
      this.engine.ledger.record({
        type: "chat_mode_tool_call_rejected",
        toolName,
        reason: "TOOL_ARGUMENTS_SCHEMA_INVALID",
        timestamp: new Date().toISOString(),
      });
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
        toolRank: exposed?.rank || null,
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
      const code = String(error?.code || toErrorCode(error?.reason || error?.message));
      const safeMessage =
        String(error?.message || "").trim() || "Tool execution failed.";
      this.engine.ledger.record({
        type: "chat_mode_tool_call",
        toolName,
        toolRank: exposed?.rank || null,
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

    const inferredActiveEntity = this._inferActiveEntityFromChatTurn({
      requestContext,
      toolExecutions,
      artifactType,
      artifact,
    });
    const inferredEntityType = inferredActiveEntity?.type || this._inferEntityTypeFromScope(requestContext);
    const pendingSelection =
      artifactType === "context_suggestion" &&
      artifact &&
      typeof artifact === "object" &&
      Array.isArray(artifact.suggestions) &&
      artifact.suggestions.length > 1
        ? {
            entityType: String(artifact.entityType || "").toLowerCase() || null,
            count: artifact.suggestions.length,
          }
        : null;

    if (this.scopeManager && typeof this.scopeManager.applyEvent === "function") {
      // Event hook: update scope using explicit structured outcomes from this completed chat turn.
      if (requestContext?.resolvedEntity?.type && Number(requestContext?.resolvedEntity?.id) > 0) {
        this.scopeManager.applyEvent(requestContext, {
          type: "ENTITY_SELECTED_EXPLICIT",
          entityType: requestContext.resolvedEntity.type,
          entityId: requestContext.resolvedEntity.id,
          source: "explicit",
          resolutionPath: "explicit_selection",
        });
      } else if (inferredActiveEntity?.type && Number(inferredActiveEntity?.id) > 0) {
        this.scopeManager.applyEvent(requestContext, {
          type: "READ_ENTITY_UNAMBIGUOUS",
          entityType: inferredActiveEntity.type,
          entityId: inferredActiveEntity.id,
          source:
            inferredActiveEntity.source === "chat_resolved_selection"
              ? "explicit"
              : inferredActiveEntity.source === "chat_tool_result" ||
                  inferredActiveEntity.source === "chat_entity_graph"
                ? "show_command"
                : "resolved",
          resolutionPath:
            inferredActiveEntity.source === "chat_resolved_selection"
              ? "explicit_selection"
              : "tool_single_entity",
        });
      } else if (pendingSelection) {
        this.scopeManager.applyEvent(requestContext, { type: "READ_AMBIGUOUS" });
      }
    }

    const operationalStore = this.engine.contextStore?._operationalStore;
    if (
      operationalStore &&
      typeof operationalStore.update === "function" &&
      conversationId
    ) {
      operationalStore.update(userId, conversationId, {
        activeEntity: inferredActiveEntity || undefined,
        posture,
        lastIntent: "CHATBOT_AGENT_MODE",
        lastEntityType: inferredEntityType || undefined,
        pendingSelection,
        source: "chat_agent_mode",
        lastQuery: userMessage,
      });
    }
  }

  _inferEntityTypeFromScope(context = {}) {
    try {
      const resolved = resolveStorageTarget({
        activeScope: {
          taskId: context.taskId,
          sessionId: context.sessionId,
          missionId: context.missionId,
          financialEntryId: context.financialEntryId,
          lawsuitId: context.lawsuitId,
          dossierId: context.dossierId,
          clientId: context.clientId,
        },
      });
      if (resolved?.entityType) return resolved.entityType;
    } catch (_) {
      // Fall through to non-storage conversational scopes.
    }

    if (context.personalTaskId) return "personal_task";
    if (context.notificationId) return "notification";
    if (context.historyEventId) return "history_event";
    return null;
  }

  _applyHistoricalScope({ requestContext = {}, llmHistory = {}, userMessage = "" } = {}) {
    if (
      this.scopeManager &&
      typeof this.scopeManager.projectScopeToRequestContext === "function"
    ) {
      this.scopeManager.projectScopeToRequestContext({ requestContext, llmHistory });
    }

    const active =
      llmHistory?.conversationScope?.activeScope || llmHistory?.activeEntity || requestContext?.activeEntity;
    const activeType = String(active?.entityType || active?.type || "").toLowerCase();
    const activeId = Number(active?.entityId || active?.id || 0);
    if (!activeType || !Number.isFinite(activeId) || activeId <= 0) return;

    const scopeKeyMap = {
      client: "clientId",
      dossier: "dossierId",
      lawsuit: "lawsuitId",
      task: "taskId",
      session: "sessionId",
      mission: "missionId",
      personal_task: "personalTaskId",
      financial_entry: "financialEntryId",
      notification: "notificationId",
      history_event: "historyEventId",
    };
    const key = scopeKeyMap[activeType];
    if (key && !requestContext[key]) {
      requestContext[key] = activeId;
    }
    if (
      (!requestContext.activeEntity || typeof requestContext.activeEntity !== "object") &&
      key
    ) {
      requestContext.activeEntity = {
        type: activeType,
        id: activeId,
        source: "conversation_context",
      };
    }

    // Parent -> child propagation for conversational follow-ups:
    // e.g. "show his dossiers" right after reading a client.
    if (activeType !== "client" || requestContext.clientId) return;
    const readIntent = detectReadIntent(String(userMessage || ""), requestContext);
    const childIntents = new Set([
      "LIST_DOSSIERS",
      "READ_DOSSIER",
      "LIST_TASKS",
      "READ_TASK",
      "LIST_SESSIONS",
      "READ_SESSION",
      "LIST_LAWSUITS",
      "READ_LAWSUIT",
      "LIST_MISSIONS",
      "READ_MISSION",
      "LIST_FINANCIAL_ENTRIES",
      "READ_FINANCIAL_ENTRY",
    ]);
    if (childIntents.has(String(readIntent?.intent || "").toUpperCase())) {
      requestContext.clientId = activeId;
    }
  }

  _inferActiveEntityFromChatTurn({
    requestContext = {},
    toolExecutions = [],
    artifactType = "chat",
    artifact = null,
  } = {}) {
    const resolvedType = String(requestContext?.resolvedEntity?.type || "").toLowerCase();
    const resolvedId = Number(requestContext?.resolvedEntity?.id || 0);
    if (resolvedType && Number.isFinite(resolvedId) && resolvedId > 0) {
      return { type: resolvedType, id: resolvedId, source: "chat_resolved_selection" };
    }

    for (let i = toolExecutions.length - 1; i >= 0; i -= 1) {
      const execution = toolExecutions[i];
      if (!execution?.ok || !execution.result || typeof execution.result !== "object") {
        continue;
      }
      const fromResult = this._inferActiveEntityFromToolResult(execution.result);
      if (fromResult) return fromResult;
    }

    if (artifactType === "context_suggestion" && artifact && typeof artifact === "object") {
      const suggestion = Array.isArray(artifact.suggestions) ? artifact.suggestions[0] : null;
      const entityType = String(suggestion?.entityType || artifact.entityType || "").toLowerCase();
      const entityId = Number(suggestion?.entityId || 0);
      if (entityType && Number.isFinite(entityId) && entityId > 0) {
        return { type: entityType, id: entityId, source: "chat_context_suggestion" };
      }
    }

    const scopedType = this._inferEntityTypeFromScope(requestContext);
    if (!scopedType) return null;
    const scopeKeyMap = {
      client: "clientId",
      dossier: "dossierId",
      lawsuit: "lawsuitId",
      task: "taskId",
      session: "sessionId",
      mission: "missionId",
      personal_task: "personalTaskId",
      financial_entry: "financialEntryId",
      notification: "notificationId",
      history_event: "historyEventId",
    };
    const scopeId = Number(requestContext?.[scopeKeyMap[scopedType]] || 0);
    if (!Number.isFinite(scopeId) || scopeId <= 0) return null;
    return { type: scopedType, id: scopeId, source: "chat_scope" };
  }

  _inferActiveEntityFromToolResult(result) {
    if (!result || typeof result !== "object") return null;

    const directMap = {
      client: "client",
      dossier: "dossier",
      lawsuit: "lawsuit",
      task: "task",
      session: "session",
      mission: "mission",
      personal_task: "personalTask",
      financial_entry: "financialEntry",
      notification: "notification",
      history_event: "historyEvent",
    };
    for (const [type, key] of Object.entries(directMap)) {
      const row = result[key];
      const id = Number(row?.id || 0);
      if (row && typeof row === "object" && Number.isFinite(id) && id > 0) {
        return { type, id, source: "chat_tool_result" };
      }
    }

    const listMap = {
      client: "clients",
      dossier: "dossiers",
      lawsuit: "lawsuits",
      task: "tasks",
      session: "sessions",
      mission: "missions",
      personal_task: "personalTasks",
      financial_entry: "financialEntries",
      notification: "notifications",
      history_event: "historyEvents",
    };
    for (const [type, key] of Object.entries(listMap)) {
      const rows = result[key];
      if (!Array.isArray(rows) || rows.length !== 1) continue;
      const id = Number(rows[0]?.id || 0);
      if (Number.isFinite(id) && id > 0) {
        return { type, id, source: "chat_tool_result" };
      }
    }

    if (result.root && typeof result.root === "object") {
      const rootType = String(result.root.type || "").toLowerCase();
      const rootId = Number(result.root.id || 0);
      if (rootType && Number.isFinite(rootId) && rootId > 0) {
        return { type: rootType === "case" ? "lawsuit" : rootType, id: rootId, source: "chat_entity_graph" };
      }
    }

    const fallbackType = String(result.entityType || "").toLowerCase();
    const fallbackId = Number(result.entityId || result.id || 0);
    if (fallbackType && Number.isFinite(fallbackId) && fallbackId > 0) {
      return { type: fallbackType === "case" ? "lawsuit" : fallbackType, id: fallbackId, source: "chat_tool_result" };
    }

    return null;
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
      (execution) =>
        execution?.ok &&
        (execution?.toolName === "getEntityGraph" ||
          execution?.toolName === "getDossier"),
    );
    if (hasEntityGraphExecution) {
      return finalMessage;
    }

    if (deterministicGrounding && deterministicGrounding.reason === "entity_ambiguous") {
      return "I need the exact entity before I can give grounded advice. Please share the client name or the dossier/lawsuit/task/mission reference.";
    }

    return "I could not load grounded entity data for this request. Please provide the exact client name or dossier/lawsuit reference, then I can give a precise priority plan.";
  }

  _enforceGroundingSnapshotConsistency({
    userMessage,
    finalMessage,
    deterministicGrounding,
  }) {
    const snapshot = deterministicGrounding?.snapshot;
    if (!snapshot || typeof snapshot !== "object") return String(finalMessage || "");
    if (!this._looksEntityScopedRequest(userMessage)) return String(finalMessage || "");

    const metrics = snapshot.metrics || {};
    const relatedCount =
      Number(metrics.totalDossiers || 0) +
      Number(metrics.totalLawsuits || 0) +
      Number(metrics.totalTasks || 0) +
      Number(metrics.totalMissions || 0) +
      Number(metrics.totalSessions || 0) +
      Number(metrics.totalDocuments || 0);
    if (relatedCount <= 0) return String(finalMessage || "");

    const message = String(finalMessage || "").trim();
    if (!message) return this._buildEntityGraphResponse(snapshot);

    const contradictoryEmptyLinkClaim =
      /\bno\b[\s\S]{0,100}\b(dossiers?|lawsuits?|tasks?|missions?|sessions?|documents?)\b/i.test(
        message,
      ) ||
      /\bnone\b[\s\S]{0,100}\b(dossiers?|lawsuits?|tasks?|missions?|sessions?|documents?)\b/i.test(
        message,
      ) ||
      /\bno\b[\s\S]{0,80}\blinked\b/i.test(message);

    if (!contradictoryEmptyLinkClaim) return message;
    return this._buildEntityGraphResponse(snapshot);
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
    if (root?.reference || root?.dossier_reference) {
      lines.push(`Reference: ${root.reference || root.dossier_reference}`);
    }
    if (root?.court || root?.court_name) {
      lines.push(`Court: ${root.court || root.court_name}`);
    }
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
    requireGrounding = false,
  }) {
    const hasGraphTool = exposedTools.some((tool) => tool.name === "getEntityGraph");
    const hasGetDossierTool = exposedTools.some((tool) => tool.name === "getDossier");
    if (!hasGraphTool && !hasGetDossierTool) return null;

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

    const scopedEntity = this._extractScopedEntityFromContext(executionContext);
    if (scopedEntity && hasGraphTool) {
      const execution = await this._executeToolByName({
        toolName: "getEntityGraph",
        args: {
          entityType: scopedEntity.entityType,
          entityId: scopedEntity.entityId,
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
          reason: "scoped_context_resolved",
        };
      }
    }
    if (
      scopedEntity &&
      scopedEntity.entityType === "dossier" &&
      hasGetDossierTool &&
      !hasGraphTool
    ) {
      const execution = await this._executeToolByName({
        toolName: "getDossier",
        args: { dossierId: scopedEntity.entityId },
        policy,
        executionContext,
      });
      if (execution?.ok) {
        return {
          snapshot: execution.result,
          execution,
          reason: "scoped_dossier_resolved",
        };
      }
    }

    const message = String(userMessage || "").trim();
    if (!message || !this._looksEntityScopedRequest(message)) {
      return requireGrounding ? { reason: "entity_ambiguous" } : null;
    }

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

  _extractScopedEntityFromContext(executionContext = {}) {
    try {
      const resolved = resolveStorageTarget({
        activeScope: {
          taskId: executionContext?.taskId,
          sessionId: executionContext?.sessionId,
          missionId: executionContext?.missionId,
          financialEntryId: executionContext?.financialEntryId,
          lawsuitId: executionContext?.lawsuitId,
          dossierId: executionContext?.dossierId,
          clientId: executionContext?.clientId,
        },
      });
      return {
        entityType: resolved.entityType,
        entityId: resolved.entityId,
      };
    } catch (_) {
      return null;
    }
  }

  _requiresGroundedDraft({ userMessage, draftIntent, scopeContext }) {
    if (!draftIntent || !draftIntent.intent) return false;
    const hasScopedContext = Boolean(this._extractScopedEntityFromContext(scopeContext));
    const hasEntityHints =
      Array.isArray(draftIntent.entityHints) &&
      draftIntent.entityHints.some((hint) =>
        ["id", "name", "reference"].includes(String(hint?.type || "")),
      );
    return hasScopedContext || hasEntityHints || this._looksEntityScopedRequest(userMessage);
  }

  _buildDraftGroundingBlockedMessage({ deterministicGrounding }) {
    if (deterministicGrounding?.reason === "entity_ambiguous") {
      return "I cannot draft this yet. I need to read and confirm the exact entity first. Please provide the client name and/or dossier title/reference.";
    }
    return "I cannot draft this yet because entity grounding is not confirmed. I need to read the referenced record first (getEntityGraph/getDossier).";
  }

  _isOfficialDraftRequest({ userMessage, draftIntent }) {
    if (!draftIntent || !draftIntent.intent) return false;
    const draftType = String(draftIntent.draftType || "").toUpperCase();
    if (["COURT_MOTION", "HEARING_REQUEST"].includes(draftType)) return true;
    const text = String(userMessage || "").toLowerCase();
    return (
      /\b(court|motion|petition|official request|judicial request)\b/.test(text) ||
      /محكمة|طلب\s+رسمي|عريضة/.test(text)
    );
  }

  _buildOfficialDraftGuard({ userMessage, draftIntent, deterministicGrounding }) {
    if (!this._isOfficialDraftRequest({ userMessage, draftIntent })) {
      return null;
    }
    const snapshot = deterministicGrounding?.snapshot;
    if (!snapshot || typeof snapshot !== "object") return null;

    const operator = this._getOperatorDraftIdentity();

    const dossierReference = this._extractDossierReferenceFromSnapshot(snapshot);
    const legalReference = this._extractLegalReferenceFromSnapshot(snapshot);
    const courtName = this._extractCourtNameFromSnapshot(snapshot);
    return {
      systemMessage: `Official draft binding data (use real values when available; placeholders allowed only for missing values): ${JSON.stringify({
        lawyer: operator.profile,
        dossierReference: dossierReference || null,
        courtName: courtName || null,
        legalReference: legalReference || null,
        missingLawyerFields: operator.missing,
      })}`,
    };
  }

  async _tryHandleDocumentGenerationChatIntent({
    generationRequest,
    requestContext,
    executionContext,
    policy,
    userMessage,
  } = {}) {
    if (!generationRequest || typeof generationRequest !== "object") return null;

    if (!generationRequest?.target?.type || !Number.isInteger(Number(generationRequest?.target?.id))) {
      const finalMessage =
        "I can generate this as a stored document preview, but I need the exact target record first (client, dossier, lawsuit, task, mission, or session).";
      this._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: executionContext?.posture || "WORK",
        toolExecutions: [],
      });
      return {
        message: finalMessage,
        intent: "DOCUMENT_GENERATION",
        agentVersion: policy?.version || "v3",
        posture: executionContext?.posture || "WORK",
        toolExecutions: [],
        stepCommentaries: [],
        rounds: 0,
        ambiguityArtifact: null,
        outputArtifact: null,
        resolutionMeta: null,
        availableTools: [],
      };
    }

    let plan;
    try {
      plan = await documentGenerationService.planDocument(generationRequest);
    } catch (error) {
      if (String(error?.code || "") === "TEMPLATE_NOT_FOUND") {
        const outputArtifact = {
          type: "document_generation_missing_fields",
          message: error.message || "Template not found for the requested document.",
          documentType: generationRequest?.documentType || null,
          target: generationRequest?.target || null,
          missingFields: [
            {
              path: "template",
              label: "Template",
              reason: "template_not_found",
              example: "Install a template for this documentType/language/version.",
            },
          ],
          schemaVersion: null,
          templateKey: null,
        };
        const finalMessage =
          "I recognized a document-generation request, but the required template is not available. I returned a generation artifact with the missing template requirement.";
        this._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture: executionContext?.posture || "WORK",
          toolExecutions: [],
          artifactType: "document_generation_missing_fields",
          artifact: outputArtifact,
        });
        return {
          message: finalMessage,
          intent: "DOCUMENT_GENERATION",
          agentVersion: policy?.version || "v3",
          posture: executionContext?.posture || "WORK",
          toolExecutions: [],
          stepCommentaries: [],
          rounds: 0,
          ambiguityArtifact: null,
          outputArtifact,
          resolutionMeta: null,
          availableTools: [],
        };
      }
      throw error;
    }

    const outputArtifact =
      plan?.status === "missing_fields"
        ? {
            type: "document_generation_missing_fields",
            message: "Required fields are missing before generation.",
            documentType: plan.documentType,
            target: plan.target,
            missingFields: plan.missingFields,
            schemaVersion: plan.schemaVersion,
            templateKey: plan.templateKey,
          }
        : documentGenerationPreviewService.createPreview(plan, {
            conversationId: requestContext?.conversationId || null,
            sessionId: executionContext?.sessionId || null,
            createdBy: executionContext?.userId ? String(executionContext.userId) : null,
          });

    const finalMessage =
      outputArtifact?.type === "document_generation_preview"
        ? "I prepared a stored document generation preview artifact. Review it, then confirm to create and attach the generated document."
        : "I prepared a document-generation requirements artifact showing the missing fields needed before generation.";

    this._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture: executionContext?.posture || "WORK",
      toolExecutions: [],
      artifactType: outputArtifact?.type || null,
      artifact: outputArtifact || null,
    });

    return {
      message: finalMessage,
      intent: "DOCUMENT_GENERATION",
      agentVersion: policy?.version || "v3",
      posture: executionContext?.posture || "WORK",
      toolExecutions: [],
      stepCommentaries: [],
      rounds: 0,
      ambiguityArtifact: null,
      outputArtifact,
      resolutionMeta: null,
      availableTools: [],
    };
  }

  _getOperatorDraftIdentity() {
    let operator = null;
    try {
      operator = operatorsService.getCurrentOperator();
    } catch (_) {
      operator = null;
    }
    const profile = {
      lawyerName: operator?.name || null,
      licenseNumber: operator?.bar_number || operator?.bar_id || null,
      officeAddress: operator?.office_address || null,
      contactEmail: operator?.email || null,
      contactPhone: operator?.phone || operator?.mobile || null,
      officeName: operator?.office_name || operator?.office || null,
    };
    const missing = [];
    if (!profile.lawyerName) missing.push("lawyer name");
    if (!profile.licenseNumber) missing.push("license number");
    if (!profile.officeAddress) missing.push("office address");
    if (!profile.contactEmail && !profile.contactPhone) {
      missing.push("contact information");
    }
    return { profile, missing };
  }

  _extractDossierReferenceFromSnapshot(snapshot) {
    const root = snapshot?.root || {};
    const parents = snapshot?.parents || {};
    const children = snapshot?.children || {};
    return (
      root.reference ||
      root.dossier_reference ||
      parents?.dossier?.reference ||
      (Array.isArray(children.dossiers) && children.dossiers[0]?.reference) ||
      null
    );
  }

  _extractCourtNameFromSnapshot(snapshot) {
    const root = snapshot?.root || {};
    const parents = snapshot?.parents || {};
    return root.court || root.court_name || parents?.lawsuit?.court || null;
  }

  _extractLegalReferenceFromSnapshot(snapshot) {
    const fields = [
      "legal_article",
      "legalArticle",
      "article",
      "article_number",
      "articleNumber",
      "legal_reference",
      "legalReference",
    ];
    const queue = [snapshot?.root, snapshot?.parents, snapshot?.children];
    for (const node of queue) {
      if (!node || typeof node !== "object") continue;
      const stack = [node];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;
        for (const field of fields) {
          if (current[field] !== null && current[field] !== undefined) {
            const value = String(current[field]).trim();
            if (value) return value;
          }
        }
        Object.values(current).forEach((value) => {
          if (value && typeof value === "object") stack.push(value);
        });
      }
    }
    return null;
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

  _enforceExecutionLockedNoAdvisoryFallback({
    finalMessage,
    requestContext,
  } = {}) {
    const mode = String(
      requestContext?._conversationMode ||
        this._getOperationalMutationDetectionState(requestContext)?.mode ||
        "informational",
    ).toLowerCase();
    if (mode !== "execution") return String(finalMessage || "");
    const text = String(finalMessage || "").trim();
    if (!text) {
      return "I can prepare a confirmation-ready change for this request.";
    }
    const forbidden = [
      /i don['’]t have permission/i,
      /je ne peux pas modifier directement/i,
      /cannot modify records directly/i,
      /you need to update manually/i,
      /update manually/i,
      /open the record and change/i,
    ];
    if (!forbidden.some((p) => p.test(text))) return text;
    return "I can prepare a confirmation-ready change for this request. Please confirm the exact entity if there are multiple matches.";
  }

  _normalizeResponseMarkdown({ content = "", outputType = "message" } = {}) {
    const kind = String(outputType || "").toLowerCase();
    if (!["message", "research", "document"].includes(kind)) {
      return String(content || "").trim();
    }

    let text = String(content || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim();
    if (!text) return "";
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text;
  }

  async _resolveMutationEntityByName({
    entityType,
    query,
    policy,
    executionContext,
  } = {}) {
    const normalizedType = String(entityType || "").toLowerCase();
    const normalizedQuery = String(query || "").trim();
    if (!normalizedType || !normalizedQuery) return { kind: "none" };

    const configByType = {
      client: {
        toolName: "listClients",
        resultKey: "clients",
        resolver: resolveClientQuery,
        label: (row) => String(row?.name || row?.company || `Client #${row?.id || "?"}`),
      },
      dossier: {
        toolName: "listDossiers",
        resultKey: "dossiers",
        resolver: resolveDossierQuery,
        label: (row) =>
          String(row?.title || row?.reference || row?.code || `Dossier #${row?.id || "?"}`),
      },
      lawsuit: {
        toolName: "listLawsuits",
        resultKey: "lawsuits",
        resolver: resolveLawsuitQuery,
        label: (row) =>
          String(row?.title || row?.reference || row?.lawsuit_number || `Lawsuit #${row?.id || "?"}`),
      },
      task: {
        toolName: "listTasks",
        resultKey: "tasks",
        resolver: resolveTaskQuery,
        label: (row) => String(row?.title || `Task #${row?.id || "?"}`),
      },
      personal_task: {
        toolName: "listPersonalTasks",
        resultKey: "personalTasks",
        resolver: resolvePersonalTaskQuery,
        label: (row) => String(row?.title || `Personal task #${row?.id || "?"}`),
      },
      mission: {
        toolName: "listMissions",
        resultKey: "missions",
        resolver: resolveMissionQuery,
        label: (row) => String(row?.title || row?.reference || `Mission #${row?.id || "?"}`),
      },
      officer: {
        toolName: "listOfficers",
        resultKey: "officers",
        resolver: resolveOfficerQuery,
        label: (row) => String(row?.name || row?.agency || `Officer #${row?.id || "?"}`),
      },
      session: {
        toolName: "listSessions",
        resultKey: "sessions",
        resolver: resolveSessionQuery,
        label: (row) => String(row?.title || row?.session_type || `Session #${row?.id || "?"}`),
      },
      financial_entry: {
        toolName: "listFinancialEntries",
        resultKey: "financialEntries",
        resolver: resolveFinancialEntryQuery,
        label: (row) =>
          String(row?.title || row?.reference || row?.entry_type || `Financial entry #${row?.id || "?"}`),
      },
      document: {
        toolName: "listDocuments",
        resultKey: "documents",
        resolver: resolveDocumentQuery,
        label: (row) =>
          String(row?.title || row?.original_filename || `Document #${row?.id || "?"}`),
      },
    };

    const config = configByType[normalizedType];
    if (!config) return { kind: "none" };

    const execution = await this._executeToolByName({
      toolName: config.toolName,
      args: { query: normalizedQuery, limit: 25 },
      policy,
      executionContext,
    });
    if (!execution?.ok) return { kind: "none" };

    const rows = Array.isArray(execution.result?.[config.resultKey]) ? execution.result[config.resultKey] : [];
    const resolution = config.resolver(normalizedQuery, rows);
    if (resolution.kind === "one") {
      const matched = resolution.entity || rows.find((row) => Number(row?.id) === Number(resolution.id)) || null;
      return {
        kind: "one",
        id: Number(resolution.id),
        entityType: normalizedType,
        matchKind: this._resolveNameMatchKind(normalizedQuery, matched, normalizedType),
        entity: matched,
      };
    }
    if (resolution.kind === "many") {
      return {
        kind: "many",
        entityType: normalizedType,
        total: resolution.total,
        overflow: resolution.overflow === true,
        candidates: (resolution.candidates || []).map((row) => ({
          id: Number(row?.id),
          entityType: normalizedType,
          label: config.label(row),
        })),
      };
    }
    return { kind: "none", entityType: normalizedType };
  }

  _resolveNameMatchKind(query, entity, entityType) {
    const normalizedQuery = normalizeEntityResolverText(query);
    if (!normalizedQuery || !entity) return "fuzzy";
    const exactFieldMap = {
      client: [entity?.name, entity?.company],
      dossier: [entity?.title, entity?.reference, entity?.code],
      lawsuit: [entity?.title, entity?.reference, entity?.lawsuit_number],
      task: [entity?.title],
      personal_task: [entity?.title],
      mission: [entity?.title, entity?.reference],
      officer: [entity?.name, entity?.agency, entity?.registration_number],
      session: [entity?.title, entity?.session_type],
      financial_entry: [entity?.title, entity?.reference, entity?.entry_type],
      document: [entity?.title, entity?.original_filename],
    };
    const candidates = exactFieldMap[String(entityType || "").toLowerCase()] || [];
    const isExact = candidates.some(
      (value) => normalizeEntityResolverText(value) === normalizedQuery,
    );
    return isExact ? "exact" : "fuzzy";
  }

  _extractClientNameQuery(message) {
    const text = String(message || "");
    const match = text.match(/\bclient\s+([^?.,!\n]+)/i);
    if (!match) return null;
    const value = String(match[1] || "")
      .replace(/\b(we will|i will|what do you think|what should|how should)\b.*$/i, "")
      .replace(/\b(today|tomorrow|this week|right now)\b.*$/i, "")
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

  _buildDocumentContextFallback({
    requestContext,
    userMessage,
    policyVersion,
    posture,
  }) {
    const docCtx = requestContext?.documentContext;
    if (!docCtx || !Array.isArray(docCtx.documents) || docCtx.documents.length === 0) {
      return null;
    }
    if (!this._isDocumentFocusedPrompt(userMessage)) {
      return null;
    }

    const docs = docCtx.documents.filter(Boolean);
    const readableDocs = docs.filter(
      (doc) =>
        Boolean(doc.has_text) ||
        (typeof doc.text === "string" && doc.text.trim().length > 0) ||
        (doc.artifacts &&
          typeof doc.artifacts === "object" &&
          typeof doc.artifacts.visual_summary === "string" &&
          doc.artifacts.visual_summary.trim().length > 0),
    );
    if (readableDocs.length > 0) {
      return null;
    }

    const unreadableDocs = docs.filter(
      (doc) =>
        ["unreadable", "failed"].includes(
          String(doc.text_status || "").toLowerCase(),
        ) ||
        ["unreadable", "failed"].includes(
          String(doc.understanding_status || "").toLowerCase(),
        ),
    );
    const processingDocs = docs.filter(
      (doc) => {
        const understanding = String(doc.understanding_status || "").toLowerCase();
        if (["failed", "completed", "unreadable", "readable"].includes(understanding)) {
          return false;
        }
        return (
          String(doc.text_status || "").toLowerCase() === "processing" ||
          understanding === "processing"
        );
      },
    );

    let message = "";
    if (unreadableDocs.length > 0) {
      const lines = unreadableDocs.slice(0, 2).map((doc) => {
        const name = doc.title || doc.original_filename || `document_${doc.document_id}`;
        const confidence = Number.isFinite(doc.understanding_confidence)
          ? `, confidence ${Math.round(doc.understanding_confidence * 100)}%`
          : "";
        const riskFlags =
          doc.artifacts &&
          typeof doc.artifacts === "object" &&
          Array.isArray(doc.artifacts.risk_flags)
            ? doc.artifacts.risk_flags
                .filter((flag) => typeof flag === "string" && flag.trim())
                .slice(0, 3)
            : [];
        const reason = riskFlags.length ? ` Reasons: ${riskFlags.join("; ")}.` : "";
        return `- ${name} (${String(doc.understanding_status || doc.text_status || "unreadable")}${confidence}).${reason}`;
      });
      const processingSuffix =
        processingDocs.length > 0
          ? ` ${processingDocs.length} other attachment(s) are still processing.`
          : "";
      message = [
        "I can see your attached file(s), but I could not extract readable content from at least one file in the current environment.",
        ...lines,
        `You can retry analysis, upload a clearer/text-based version, or verify offline OCR assets/dependencies are installed correctly on this machine.${processingSuffix}`,
      ].join("\n");
    } else if (processingDocs.length > 0) {
      const names = processingDocs
        .slice(0, 3)
        .map((doc) => doc.title || doc.original_filename || `document_${doc.document_id}`)
        .join(", ");
      message =
        `I can see your attached file(s), but analysis is still processing for ${processingDocs.length} document(s): ${names}. ` +
        "Please retry in a few seconds.";
    } else {
      message =
        "I can see your attached file(s), but readable content is not available yet. Please retry analysis.";
    }

    return {
      message,
      agentVersion: policyVersion || "v3",
      posture: posture || POSTURES.ASSISTANT,
      toolExecutions: [],
      stepCommentaries: [],
      rounds: 0,
      ambiguityArtifact: null,
      resolutionMeta: null,
      availableTools: [],
      suppressIntentFraming: true,
      suppressCommentary: true,
      documentFallback: true,
    };
  }

  _isDocumentFocusedPrompt(message) {
    const text = String(message || "").toLowerCase();
    if (!text) return false;
    return (
      /\b(file|document|pdf|image|photo|picture|scan|scanned|attachment|attached|ocr)\b/.test(
        text,
      ) ||
      /\bwhat does this (file|document|image|pdf)\b/.test(text) ||
      /\bwhat (is|does) .*written\b/.test(text) ||
      /\bsummar(?:y|ize).*(file|document|pdf|image)\b/.test(text)
    );
  }
}

module.exports = {
  ChatAgentService,
};
