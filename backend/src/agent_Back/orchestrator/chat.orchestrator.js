"use strict";

const documentGenerationPreviewService = require("../../services/documentGeneration/documentGenerationPreview.service");
const { ChatAgentService } = require("../chat/chat.agent.service");
const { resolveChatAmbiguity } = require("../chat/chat.ambiguity.resolver");
const { filterToolsForState } = require("../chat/chat.tool.exposure");
const { detectDraftIntent, detectReadIntent } = require("../intent.classifier");
const { buildReadPlan } = require("../read/readPlan.builder");
const { toProposalArtifact } = require("../proposals/proposalArtifact");
const { buildDocumentContext } = require("./document.context.builder");
const { buildDocumentSafeContext } = require("./document.exposure.firewall");
const { discoverScopedTarget } = require("../context/scopeDiscovery");
const {
  bindLastResolvedEntityToRequestContext,
  inferLastResolvedFromGraphResult,
  inferLastResolvedFromToolExecutions,
} = require("../context/scopedEntityContext");
const { CHAT_STATES, selectInitialState } = require("./chat.state.machine");
const { parseFinalOutputContract } = require("./output.contract");
const { parseJsonResponse } = require("../llm/llm.validation");
const { evaluateMutationGovernance } = require("../mutation/mutation.governance");
const {
  getChatOrchestratorState,
  updateChatOrchestratorState,
  clearPendingClarificationState,
} = require("./chat.session.state");
const { runChatToolLoop } = require("./chat.tool.loop");
const { clarificationAnswerMatcher } = require("./clarificationAnswerMatcher");
const {
  DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  DEFAULT_CANONICAL_FORMAT,
  DEFAULT_PREVIEW_FORMAT,
  chooseOutputFormats,
  normalizeArtifactKind,
  normalizeFormat,
  normalizeOutputFormatPreference,
  normalizeStructureHints,
  isCanonicalFormat,
  isPreviewFormat,
} = require("../../domain/documentFormatGovernance");
const {
  StorageHint,
  normalizeStorageHint,
  resolveStorageTarget,
} = require("../../domain/document.storage.resolver");
const {
  buildMissingFieldPrompt,
} = require("../presentation/presentationSanitizer");

function nowIso() {
  return new Date().toISOString();
}

const PENDING_CLARIFICATION_TTL_MS = 3 * 60 * 1000;
const PENDING_CLARIFICATION_MAX_TURNS = 2;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inferLanguageFromText(text, fallback = "en") {
  const raw = String(text || "");
  // Script detection only, no keyword routing.
  if (/[\u0600-\u06FF]/.test(raw)) return "ar";
  return fallback;
}

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const DETERMINISTIC_LIST_INTENTS = new Set([
  "LIST_DOSSIERS",
  "LIST_LAWSUITS",
  "LIST_TASKS",
  "LIST_OVERDUE_TASKS",
  "LIST_MISSIONS",
  "LIST_SESSIONS",
  "LIST_UPCOMING_SESSIONS",
  "LIST_DOCUMENTS",
]);

const LIST_CATEGORY_LABELS = Object.freeze({
  dossiers: "dossiers",
  lawsuits: "lawsuits",
  tasks: "tasks",
  missions: "missions",
  sessions: "sessions",
  documents: "documents",
});

const LIST_CATEGORY_ENTITY_TYPE = Object.freeze({
  dossiers: "dossier",
  lawsuits: "lawsuit",
  tasks: "task",
  missions: "mission",
  sessions: "session",
  documents: "document",
});

function withStateOutput(result, state) {
  return {
    intent: "CHATBOT_AGENT_MODE",
    toolExecutions: [],
    stepCommentaries: [],
    rounds: 0,
    ambiguityArtifact: null,
    outputArtifact: null,
    resolutionMeta: null,
    mutationOutcome: null,
    availableTools: [],
    ...result,
    state,
  };
}

class ChatOrchestrator {
  constructor({ engine, llmClient } = {}) {
    if (!engine) throw new Error("ChatOrchestrator requires engine");
    this.engine = engine;
    this.helper = new ChatAgentService({ engine, llmClient });
  }

  _buildRequestContext({ context = {}, sessionId, metadata, userId, tenantId }) {
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
    const resolvedPreference =
      normalizeOutputFormatPreference(
        mergedMetadata.documentOutputFormatPreference ||
          context?.documentOutputFormatPreference,
      ) || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
    return {
      ...(context || {}),
      conversationId:
        context?.conversationId || context?.agentSessionId || sessionId || undefined,
      userId: context?.userId || userId || "default",
      tenantId: context?.tenantId || tenantId || null,
      documentOutputFormatPreference: resolvedPreference,
      requestMetadata: {
        ...mergedMetadata,
        documentOutputFormatPreference: resolvedPreference,
      },
    };
  }

  _traceExecutionStep(requestContext = {}, step = "", details = {}) {
    this.engine?.ledger?.record?.({
      type: "chat_orchestrator_trace",
      sourceRoute: "/agent/chat",
      conversationId: requestContext?.conversationId || null,
      step: String(step || "").trim() || "unknown",
      ...(details && typeof details === "object" ? details : {}),
      timestamp: new Date().toISOString(),
    });
  }

  _resolveOutputContractExecutionPolicy(currentPolicy = null) {
    if (this.engine && typeof this.engine._resolvePolicy === "function") {
      try {
        const v3Policy = this.engine._resolvePolicy("v3");
        if (v3Policy && v3Policy.version) {
          return v3Policy;
        }
      } catch (_) {
        // fall back to current policy
      }
    }
    return currentPolicy;
  }

  _buildScopeSnapshotForStorage({ requestContext = {}, activeScope = null } = {}) {
    const snapshot = {
      taskId: null,
      sessionId: null,
      missionId: null,
      financialEntryId: null,
      lawsuitId: null,
      dossierId: null,
      clientId: null,
      entityType: null,
      entityId: null,
    };
    if (activeScope?.entityType && validId(activeScope?.entityId)) {
      snapshot.entityType = String(activeScope.entityType).toLowerCase();
      snapshot.entityId = validId(activeScope.entityId);
      const scopeKey = this._scopeKeyForEntityType(snapshot.entityType);
      if (scopeKey && !snapshot[scopeKey]) {
        snapshot[scopeKey] = snapshot.entityId;
      }
      return snapshot;
    }
    snapshot.taskId = validId(requestContext?.taskId);
    snapshot.sessionId = validId(requestContext?.sessionId);
    snapshot.missionId = validId(requestContext?.missionId);
    snapshot.financialEntryId = validId(requestContext?.financialEntryId);
    snapshot.lawsuitId = validId(requestContext?.lawsuitId);
    snapshot.dossierId = validId(requestContext?.dossierId);
    snapshot.clientId = validId(requestContext?.clientId);
    return snapshot;
  }

  _buildStorageScopeSuggestion({
    message = "I need to know which record should store this document before I can continue.",
    originalMessage = "",
  } = {}) {
    return {
      type: "context_suggestion",
      message,
      entityType: "dossier",
      reason: "missing_context",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: originalMessage || null,
      suggestions: [],
      timestamp: nowIso(),
      confidence: 0.9,
      source: "storage_scope_resolution",
      allowManualInput: true,
      manualInputHint:
        "Open/select the target client, dossier, lawsuit, task, session, mission, or financial entry, then retry.",
    };
  }

  _buildMutationGovernanceClarificationArtifact({
    governance = null,
    userMessage = "",
  } = {}) {
    const entityType = String(governance?.entityType || "entity").toLowerCase();
    const missing = Array.isArray(governance?.missingRequiredFields)
      ? governance.missingRequiredFields.filter(Boolean)
      : [];
    const fieldLabel = missing.length > 0 ? missing.join(", ") : "required fields";
    const friendlyPrompt = buildMissingFieldPrompt(missing);
    return {
      type: "context_suggestion",
      message: friendlyPrompt,
      entityType,
      reason: "missing_context",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: String(userMessage || "").trim() || null,
      suggestions: [],
      timestamp: nowIso(),
      confidence: Number.isFinite(Number(governance?.confidence))
        ? Number(governance.confidence)
        : 0.7,
      source: "mutation_governance",
      allowManualInput: true,
      manualInputHint: friendlyPrompt,
      mutationGovernance: {
        intent: governance?.intent || null,
        entityType: governance?.entityType || null,
        missingRequiredFields: missing,
      },
    };
  }

  _buildMutationOperationsFromGovernance(governance = {}, requestContext = {}) {
    const intent = String(governance?.intent || "").toLowerCase();
    const entityType = String(governance?.entityType || "").toLowerCase();
    const extracted =
      governance?.extractedFields &&
      typeof governance.extractedFields === "object" &&
      !Array.isArray(governance.extractedFields)
        ? governance.extractedFields
        : {};
    if (!intent || !entityType) return [];
    if (intent === "create") {
      return [
        {
          op: "CREATE_ENTITY",
          entityType,
          payload: {
            entityType,
            payload: extracted,
          },
          reason: `User requested creating a ${entityType} in chat.`,
        },
      ];
    }
    if (intent === "update") {
      const activeType = String(requestContext?.resolvedEntity?.type || "").toLowerCase();
      const activeId = Number(requestContext?.resolvedEntity?.id || 0);
      const targetId =
        activeType === entityType && Number.isInteger(activeId) && activeId > 0
          ? activeId
          : null;
      const changes = { ...extracted };
      delete changes.entityType;
      delete changes.entityId;
      if (!targetId || Object.keys(changes).length === 0) return [];
      return [
        {
          op: "UPDATE_ENTITY",
          entityType,
          payload: {
            entityType,
            entityId: targetId,
            changes,
          },
          reason: `User requested updating ${entityType} ${targetId} in chat.`,
        },
      ];
    }
    return [];
  }

  _createPreviewArtifactFromDocumentContract({
    contract,
    activeScope,
    requestContext,
    executionContext,
    structuredContext = null,
  }) {
    const metadata =
      contract?.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
        ? contract.metadata
        : {};
    const markdown = String(contract?.content || "").trim();
    const title =
      (typeof contract?.title === "string" && contract.title.trim()) ||
      (typeof metadata.title === "string" && String(metadata.title).trim()) ||
      "Document Draft";
    const language =
      (typeof metadata.language === "string" && metadata.language.trim().toLowerCase()) ||
      inferLanguageFromText(markdown, "en");
    const documentType =
      (typeof metadata.documentType === "string" && metadata.documentType.trim()) ||
      "freeform_request";
    const requestedCanonicalFormat = normalizeFormat(
      metadata.canonicalFormat || metadata.format,
    );
    const requestedPreviewFormat = normalizeFormat(metadata.previewFormat);
    const explicitCanonicalFormat = isCanonicalFormat(requestedCanonicalFormat)
      ? requestedCanonicalFormat
      : null;
    const preferenceFromContext =
      normalizeOutputFormatPreference(requestContext?.documentOutputFormatPreference) ||
      normalizeOutputFormatPreference(requestContext?.requestMetadata?.documentOutputFormatPreference) ||
      DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
    const artifactKind = normalizeArtifactKind(metadata.artifactKind) || "document";
    const structureHints = normalizeStructureHints(metadata.structureHints);
    const formatSelection = chooseOutputFormats({
      preference: explicitCanonicalFormat || preferenceFromContext,
      artifactKind,
      structureHints,
    });
    if (explicitCanonicalFormat) {
      formatSelection.selectionMode = "explicit";
      formatSelection.selectionSource = "explicit_request";
    }
    const canonicalFormat = isCanonicalFormat(formatSelection.canonicalFormat)
      ? formatSelection.canonicalFormat
      : DEFAULT_CANONICAL_FORMAT;
    const previewFormat = isPreviewFormat(requestedPreviewFormat)
      ? requestedPreviewFormat
      : isPreviewFormat(formatSelection.previewFormat)
        ? formatSelection.previewFormat
        : DEFAULT_PREVIEW_FORMAT;
    const templateKey =
      (typeof metadata.templateKey === "string" && metadata.templateKey.trim()) ||
      "llm.freeform.document";
    const schemaVersion =
      (typeof metadata.schemaVersion === "string" && metadata.schemaVersion.trim()) ||
      "v1";
    const explicitStorageHint =
      normalizeStorageHint(requestContext?.requestMetadata?.storageHint) || null;
    const storageHint = explicitStorageHint || StorageHint.INHERIT;
    const scopeSnapshot = this._buildScopeSnapshotForStorage({
      requestContext,
      activeScope,
    });
    let storageTarget;
    try {
      storageTarget = resolveStorageTarget({
        activeScope: scopeSnapshot,
        storageHint,
      });
    } catch (error) {
      if (String(error?.code || "") === "STORAGE_SCOPE_MISSING") {
        return this._buildStorageScopeSuggestion({
          message:
            String(error?.message || "").trim() ||
            "I need a resolved target record before I can prepare this stored document preview.",
          originalMessage: contract?.content || "",
        });
      }
      throw error;
    }
    const previewHtml = `<div dir="${language === "ar" ? "rtl" : "ltr"}" style="white-space:pre-wrap;font-family:system-ui,sans-serif;">${escapeHtml(markdown)}</div>`;
    const plan = {
      target: { type: storageTarget.entityType, id: Number(storageTarget.entityId) },
      documentType,
      language,
      canonicalFormat,
      previewFormat,
      formatSelection,
      // Backward compatibility for downstream code still expecting `format`.
      format: canonicalFormat,
      templateKey,
      schemaVersion,
      contentJson: {
        content: {
          title: String(title),
          markdown,
        },
        structuredContext:
          structuredContext &&
          typeof structuredContext === "object" &&
          !Array.isArray(structuredContext)
            ? structuredContext
            : undefined,
      },
      storageGovernance: {
        storageHint,
        activeScope: scopeSnapshot,
        resolvedTarget: {
          entityType: storageTarget.entityType,
          entityId: storageTarget.entityId,
        },
        resolutionMode: storageTarget.resolutionMode,
        status: "resolved",
        hasScopeBinding:
          requestContext?.hasScopeBinding === true ||
          (explicitStorageHint && explicitStorageHint !== StorageHint.INHERIT) ||
          storageHint !== StorageHint.INHERIT ||
          String(storageTarget?.entityType || "").toLowerCase() !== "client",
        scopeDiscoveryHint:
          requestContext?._scopeDiscoveryHint &&
          typeof requestContext._scopeDiscoveryHint === "object" &&
          !Array.isArray(requestContext._scopeDiscoveryHint)
            ? requestContext._scopeDiscoveryHint
            : null,
      },
      previewHtml,
    };
    return documentGenerationPreviewService.createPreview(plan, {
      conversationId: requestContext?.conversationId || null,
      sessionId: executionContext?.sessionId || null,
      createdBy: executionContext?.userId ? String(executionContext.userId) : null,
    });
  }

  _buildExposedToolsForState(state, policy, executionContext) {
    const scoped = filterToolsForState({
      state,
      engine: this.engine,
      policy,
      executionContext,
    });
    return scoped.map((tool) => ({
      name: tool.name,
      category: tool.category,
      schema: tool.schema,
      validate: this.engine.ajv.compile(tool.schema),
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

  _extractPendingProposal(toolExecutions = [], sessionId = null) {
    for (const execution of toolExecutions) {
      const result = execution?.result;
      if (
        result &&
        typeof result === "object" &&
        result.proposalId &&
        result.requiresConfirmation === true
      ) {
        return {
          proposalId: result.proposalId,
          summary: result.humanReadableSummary || null,
          riskLevel:
            result?.confirmation?.extraRiskAck === true ? "high" : "normal",
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          artifact: toProposalArtifact(result, sessionId),
        };
      }
    }
    return null;
  }

  _resolveActiveEntityScope(requestContext = {}, llmHistory = null) {
    const resolved = requestContext?.resolvedEntity;
    if (resolved && resolved.type && Number.isInteger(Number(resolved.id)) && Number(resolved.id) > 0) {
      return { entityType: String(resolved.type).toLowerCase(), entityId: Number(resolved.id) };
    }
    const activeScope = llmHistory?.conversationScope?.activeScope || null;
    if (
      activeScope &&
      activeScope.entityType &&
      Number.isInteger(Number(activeScope.entityId)) &&
      Number(activeScope.entityId) > 0
    ) {
      return {
        entityType: String(activeScope.entityType).toLowerCase(),
        entityId: Number(activeScope.entityId),
      };
    }
    try {
      const resolvedStorageScope = resolveStorageTarget({
        activeScope: this._buildScopeSnapshotForStorage({ requestContext, activeScope: null }),
        storageHint: StorageHint.INHERIT,
      });
      return {
        entityType: resolvedStorageScope.entityType,
        entityId: resolvedStorageScope.entityId,
      };
    } catch (_) {
      // fall through to null
    }
    return null;
  }

  _isDeterministicListIntent(readIntent = null) {
    const intentName = String(readIntent?.intent || "").trim().toUpperCase();
    return DETERMINISTIC_LIST_INTENTS.has(intentName);
  }

  _formatGraphListItem(node = {}, listCategory = "") {
    const label =
      String(node?.title || node?.name || "").trim() ||
      String(listCategory || "item").replace(/s$/, "");
    const status = String(node?.status || "").trim();
    const dueIso = String(node?.keyDates?.nextUpcoming || "").trim();
    const due = dueIso ? dueIso.slice(0, 10) : "";
    if (status && due) return `- ${label} (${status}, ${due})`;
    if (status) return `- ${label} (${status})`;
    if (due) return `- ${label} (${due})`;
    return `- ${label}`;
  }

  _renderDeterministicReadList({ graphResult = {}, listCategory = "" } = {}) {
    const rows = Array.isArray(graphResult?.children?.[listCategory])
      ? graphResult.children[listCategory]
      : [];
    const categoryLabel = LIST_CATEGORY_LABELS[listCategory] || listCategory || "items";
    const rootLabel =
      String(graphResult?.root?.title || graphResult?.root?.name || "").trim() || null;

    if (!rows.length) {
      if (rootLabel) return `No ${categoryLabel} found for ${rootLabel}.`;
      return `No ${categoryLabel} found in the current scope.`;
    }

    const head = rootLabel
      ? `Found ${rows.length} ${categoryLabel} for ${rootLabel}:`
      : `Found ${rows.length} ${categoryLabel}:`;
    const body = rows.slice(0, 12).map((row) => this._formatGraphListItem(row, listCategory));
    if (rows.length > body.length) {
      body.push(`- and ${rows.length - body.length} more`);
    }
    return [head, ...body].join("\n");
  }

  async _tryRunDeterministicReadList({
    userMessage = "",
    requestContext = {},
    executionContext = {},
    llmHistory = null,
    policy = null,
    posture = "ASSISTANT",
    state = CHAT_STATES.RETRIEVE,
  } = {}) {
    const readIntent = detectReadIntent(String(userMessage || ""), requestContext || {});
    if (!this._isDeterministicListIntent(readIntent)) return null;

    const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
    const plan = buildReadPlan({
      intent: readIntent,
      requestContext,
      activeScope,
    });
    if (!plan) return null;

    this._traceExecutionStep(requestContext, "deterministic_read_plan_built", {
      intent: readIntent.intent,
      toolName: plan.toolName,
      toolInput: plan.toolInput,
    });

    let graphResult = null;
    let toolError = null;
    try {
      graphResult = await this.engine._callReadTool(
        plan.toolName,
        plan.toolInput,
        policy,
      );
    } catch (error) {
      toolError = error;
    }

    const toolExecution = {
      toolName: plan.toolName,
      args: plan.toolInput,
      ok: !toolError,
      result: graphResult,
      error: toolError
        ? {
            code: String(toolError?.code || "TOOL_EXECUTION_FAILED"),
            message: String(toolError?.message || "Tool execution failed."),
          }
        : null,
      responseForModel: toolError
        ? {
            ok: false,
            error: String(toolError?.message || "Tool execution failed."),
          }
        : graphResult,
    };

    const listCategory = String(plan?.renderHint?.listCategory || "").trim();
    const resolvedFromGraph = inferLastResolvedFromGraphResult(graphResult, listCategory);
    if (resolvedFromGraph) {
      updateChatOrchestratorState(this.engine, requestContext, {
        lastResolvedEntity: resolvedFromGraph,
      });
    }
    const listedRows = !toolError && Array.isArray(graphResult?.children?.[listCategory])
      ? graphResult.children[listCategory]
      : [];
    let autoPinnedScope = null;
    if (!toolError && listedRows.length === 1) {
      const targetEntityType = LIST_CATEGORY_ENTITY_TYPE[listCategory] || null;
      const targetEntityId = validId(listedRows[0]?.id);
      if (targetEntityType && targetEntityId) {
        autoPinnedScope = this._pinEntityScopeBeforeContract({
          requestContext,
          executionContext,
          resolvedEntity: {
            entityType: targetEntityType,
            entityId: targetEntityId,
          },
          source: "resolved",
        });
      }
    }
    const finalMessage = toolError
      ? `I could not retrieve ${LIST_CATEGORY_LABELS[listCategory] || "the list"} right now.`
      : this._renderDeterministicReadList({
          graphResult,
          listCategory,
        });

    updateChatOrchestratorState(this.engine, requestContext, {
      activeState: state,
    });

    const outputArtifact = {
      type: "chat",
      message: finalMessage,
      deterministicRead: true,
      listCategory,
    };
    this.helper._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture,
      toolExecutions: [toolExecution],
      artifactType: "chat",
      artifact: outputArtifact,
    });

    return withStateOutput(
      {
        message: finalMessage,
        toolExecutions: [toolExecution],
        stepCommentaries: [],
        rounds: 0,
        outputArtifact,
        resolutionMeta: {
          deterministicReadPlan: {
            intent: readIntent.intent,
            toolName: plan.toolName,
            toolInput: plan.toolInput,
            renderHint: plan.renderHint,
          },
          autoPinnedScope,
        },
      },
      CHAT_STATES.FINAL,
    );
  }

  _scopeKeyForEntityType(entityType = "") {
    const map = {
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
      officer: "officerId",
    };
    return map[String(entityType || "").toLowerCase()] || null;
  }

  _normalizeEntityTypeForDiscovery(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "case") return "lawsuit";
    if (normalized === "hearing") return "session";
    if (normalized === "personal task") return "personal_task";
    if (normalized === "financial entry") return "financial_entry";
    if (normalized === "history event") return "history_event";
    return normalized;
  }

  _extractScopeDiscoveryHints(userMessage, requestContext = {}) {
    const draftIntent = detectDraftIntent(userMessage, requestContext || {});
    if (!draftIntent || !Array.isArray(draftIntent.entityHints) || draftIntent.entityHints.length === 0) {
      return [];
    }
    const hints = [];
    for (const hint of draftIntent.entityHints) {
      const type = String(hint?.type || "").toLowerCase();
      const rawValue =
        type === "reference"
          ? String(hint?.reference || hint?.value || "").trim()
          : type === "id"
            ? String(hint?.id || hint?.entityId || hint?.value || "").trim()
            : String(hint?.nameHint || hint?.value || "").trim();
      if (!rawValue) continue;
      const hintedEntityType = this._normalizeEntityTypeForDiscovery(hint?.entityType);
      hints.push({
        identifier: rawValue,
        mode: type === "id" ? "id" : "name",
        hintedEntityType: hintedEntityType || null,
      });
    }
    const seen = new Set();
    return hints.filter((hint) => {
      const key = `${hint.mode}:${hint.hintedEntityType || "any"}:${hint.identifier.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async _extractScopeDiscoveryHintsWithLLM(userMessage) {
    const extractor = this.helper?.mutationIntentExtractor;
    if (typeof extractor !== "function") return [];
    const prompt = [
      "Extract entity resolution hints from this user request.",
      "Return JSON only with shape: {\"hints\":[{\"entityType\":\"client|dossier|lawsuit|task|session|mission\",\"identifier\":\"string\",\"confidence\":0.0}]}",
      "Rules:",
      "- Extract only explicit concrete references likely pointing to an existing record.",
      "- Do not infer missing entities.",
      "- If uncertain, return {\"hints\":[]}.",
      `User message: ${String(userMessage || "")}`,
    ].join("\n");
    let raw = "";
    try {
      raw = await extractor(prompt);
    } catch (_) {
      return [];
    }
    const parsed = parseJsonResponse(raw);
    const rows = Array.isArray(parsed?.hints) ? parsed.hints : [];
    const allowedTypes = new Set(["client", "dossier", "lawsuit", "task", "session", "mission"]);
    const hints = [];
    for (const row of rows) {
      const entityType = String(row?.entityType || "").trim().toLowerCase();
      const identifier = String(row?.identifier || "").trim();
      const confidence = Number(row?.confidence);
      if (!allowedTypes.has(entityType)) continue;
      if (!identifier) continue;
      if (!Number.isFinite(confidence) || confidence < 0.85) continue;
      hints.push({
        identifier,
        mode: "name",
        hintedEntityType: entityType,
      });
    }
    const seen = new Set();
    return hints.filter((hint) => {
      const key = `${hint.mode}:${hint.hintedEntityType || "any"}:${hint.identifier.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async _extractDocumentScopeHintWithLLM(userMessage) {
    const extractor = this.helper?.mutationIntentExtractor;
    if (typeof extractor !== "function") {
      return {
        queryText: String(userMessage || "").trim() || null,
        preferredScopeLevels: [],
      };
    }
    const prompt = [
      "Extract a scope-discovery hint for deterministic entity resolution.",
      "Return JSON only with shape:",
      '{"queryText":"string|null","preferredScopeLevels":["dossier","lawsuit","session","task","mission","financial_entry","client"]}',
      "Rules:",
      "- Never return IDs.",
      "- Keep queryText as concise noun phrase(s) describing the target context.",
      "- preferredScopeLevels should list likely scope levels by priority.",
      "- If uncertain, set queryText to the original message and preferredScopeLevels to [].",
      `User message: ${String(userMessage || "")}`,
    ].join("\n");
    let raw = "";
    try {
      raw = await Promise.race([
        extractor(prompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("SCOPE_HINT_TIMEOUT")), 1500),
        ),
      ]);
    } catch (_) {
      return {
        queryText: String(userMessage || "").trim() || null,
        preferredScopeLevels: [],
      };
    }
    const parsed = parseJsonResponse(raw);
    const queryText = String(
      parsed?.queryText || parsed?.query || parsed?.text || String(userMessage || ""),
    )
      .replace(/\s+/g, " ")
      .trim();
    const allowed = new Set([
      "client",
      "dossier",
      "lawsuit",
      "session",
      "task",
      "mission",
      "financial_entry",
    ]);
    const preferredScopeLevels = Array.isArray(parsed?.preferredScopeLevels)
      ? parsed.preferredScopeLevels
          .map((value) => String(value || "").trim().toLowerCase())
          .filter((value) => allowed.has(value))
      : [];
    return {
      queryText: queryText || null,
      preferredScopeLevels: Array.from(new Set(preferredScopeLevels)),
    };
  }

  _buildScopeDiscoverySuggestion({ message, found = [], ambiguous = [] } = {}) {
    const suggestions = [];
    for (const row of found) {
      suggestions.push({
        entityType: row.entityType,
        entityId: row.entityId,
        label: row.entityLabel || `${row.entityType} #${row.entityId}`,
        score: 1,
      });
    }
    for (const row of ambiguous) {
      const entityType = String(row?.entityType || "").toLowerCase();
      const candidates = Array.isArray(row?.candidates) ? row.candidates : [];
      for (const c of candidates) {
        const id = Number(c?.id || 0);
        if (!entityType || !Number.isInteger(id) || id <= 0) continue;
        suggestions.push({
          entityType,
          entityId: id,
          label: String(c?.name || `${entityType} #${id}`),
          score: Number.isFinite(Number(c?.score)) ? Number(c.score) : null,
        });
      }
    }
    const deduped = [];
    const seen = new Set();
    for (const s of suggestions) {
      const key = `${s.entityType}:${s.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
      if (deduped.length >= 7) break;
    }
    return {
      type: "context_suggestion",
      message: "I found multiple possible records. Please confirm the exact one before I generate the document artifact.",
      entityType: deduped[0]?.entityType || null,
      reason: "multiple_matches",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: message,
      suggestions: deduped,
      timestamp: nowIso(),
      confidence: 0.82,
      source: "scope_discovery",
      allowManualInput: true,
      manualInputHint: "Provide the exact entity reference, ID, or full name.",
    };
  }

  _isClientOnlyArtifactScope({ activeScope, requestContext = {} } = {}) {
    if (activeScope?.entityType && activeScope?.entityId) {
      return String(activeScope.entityType).toLowerCase() === "client";
    }
    if (!validId(requestContext?.clientId)) return false;
    const deeperKeys = [
      "dossierId",
      "lawsuitId",
      "financialEntryId",
      "missionId",
      "sessionId",
      "taskId",
    ];
    return !deeperKeys.some((key) => validId(requestContext?.[key]));
  }

  _buildArtifactScopeClarifySuggestion({ message, candidates = [] } = {}) {
    const suggestions = (Array.isArray(candidates) ? candidates : [])
      .map((candidate, index) => {
        const entityType = String(candidate?.entityType || "").toLowerCase();
        const entityId = Number(candidate?.entityId || 0);
        if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return null;
        return {
          id: `scope-discovery-${entityType}-${entityId}-${index}`,
          entityType,
          entityId,
          label: String(candidate?.label || `${entityType} #${entityId}`),
          subtitle: candidate?.reference ? `Reference: ${String(candidate.reference)}` : null,
          metadata: {
            score: Number.isFinite(Number(candidate?.score))
              ? Number(Number(candidate.score).toFixed(3))
              : null,
          },
          intent: "RESOLVE_CONTEXT_AND_CONTINUE",
          scope: {
            [this._scopeKeyForEntityType(entityType) || "entityId"]: entityId,
          },
          resolveContext: {
            originalIntent: "CHATBOT_AGENT_MODE",
          },
        };
      })
      .filter(Boolean)
      .slice(0, 5);
    return {
      type: "context_suggestion",
      message:
        "I found multiple matching records under this client. Please confirm which record should receive this generated artifact.",
      entityType: suggestions[0]?.entityType || "dossier",
      reason: "multiple_matches",
      originalIntent: "CHATBOT_AGENT_MODE",
      originalMessage: String(message || "").trim() || null,
      suggestions,
      timestamp: nowIso(),
      confidence: 0.82,
      source: "scope_discovery",
      allowManualInput: true,
      manualInputHint: "Provide the exact reference, title, ID, or date of the target record.",
    };
  }

  async _discoverArtifactScopeFromClient({
    userMessage,
    requestContext,
    executionContext,
    policy,
    llmHistory,
  } = {}) {
    const explicitStorageHint =
      normalizeStorageHint(requestContext?.requestMetadata?.storageHint) || StorageHint.INHERIT;
    if (explicitStorageHint !== StorageHint.INHERIT) {
      return { status: "skipped", reason: "explicit_storage_hint" };
    }

    const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
    if (!this._isClientOnlyArtifactScope({ activeScope, requestContext })) {
      return { status: "skipped", reason: "already_scoped" };
    }
    const clientId = validId(
      activeScope?.entityType === "client" ? activeScope?.entityId : requestContext?.clientId,
    );
    if (!clientId) {
      return { status: "none", reason: "client_scope_missing" };
    }

    const llmHint = await this._extractDocumentScopeHintWithLLM(userMessage);
    this.engine?.ledger?.record?.({
      type: "chat_scope_discovery_started",
      sourceRoute: "/agent/chat",
      conversationId: requestContext?.conversationId || null,
      clientId,
      hint: llmHint,
      timestamp: nowIso(),
    });

    const discovery = await discoverScopedTarget({
      engine: this.engine,
      clientId,
      message: userMessage,
      hint: llmHint,
      policy,
    });
    this.engine?.ledger?.record?.({
      type: "chat_scope_discovery_result",
      sourceRoute: "/agent/chat",
      conversationId: requestContext?.conversationId || null,
      clientId,
      status: discovery?.status || "none",
      targetType:
        discovery?.target?.entityType ||
        discovery?.entityType ||
        null,
      targetId:
        discovery?.target?.entityId ||
        discovery?.entityId ||
        null,
      topScore: Number.isFinite(Number(discovery?.topScore)) ? Number(discovery.topScore) : null,
      runnerUpScore:
        Number.isFinite(Number(discovery?.runnerUpScore)) ? Number(discovery.runnerUpScore) : null,
      timestamp: nowIso(),
    });
    if (discovery?.status === "resolved" && discovery.entityType && validId(discovery.entityId)) {
      const pinned = this._pinEntityScopeBeforeContract({
        requestContext,
        executionContext,
        resolvedEntity: {
          entityType: discovery.entityType,
          entityId: Number(discovery.entityId),
        },
        source: "scope_discovery",
      });
      requestContext.hasScopeBinding = true;
      executionContext.hasScopeBinding = true;
      requestContext._scopeDiscoveryHint = llmHint;
      executionContext._scopeDiscoveryHint = llmHint;
      return {
        status: "resolved",
        resolvedEntity: pinned,
        confidence: Number(discovery.confidence || 0),
        candidatesPreview: discovery.candidatesPreview || [],
        hint: llmHint,
      };
    }
    if (discovery?.status === "clarify") {
      requestContext.hasScopeBinding = false;
      executionContext.hasScopeBinding = false;
      requestContext._scopeDiscoveryHint = llmHint;
      executionContext._scopeDiscoveryHint = llmHint;
      return {
        status: "clarify",
        suggestionArtifact: this._buildArtifactScopeClarifySuggestion({
          message: userMessage,
          candidates: discovery.candidates || [],
        }),
        hint: llmHint,
      };
    }
    requestContext.hasScopeBinding = false;
    executionContext.hasScopeBinding = false;
    requestContext._scopeDiscoveryHint = llmHint;
    executionContext._scopeDiscoveryHint = llmHint;
    return { status: "none" };
  }

  async _discoverScopeBeforeContract({
    userMessage,
    requestContext,
    executionContext,
    policy,
    llmHistory,
  } = {}) {
    const alreadyScoped = this._resolveActiveEntityScope(requestContext, llmHistory);
    if (alreadyScoped) {
      return { status: "skipped", reason: "already_scoped" };
    }
    let hints = this._extractScopeDiscoveryHints(userMessage, requestContext);
    if (!hints.length) {
      const draftIntent = detectDraftIntent(userMessage, requestContext || {});
      if (draftIntent?.intent) {
        hints = await this._extractScopeDiscoveryHintsWithLLM(userMessage);
      }
    }
    if (!hints.length) {
      return { status: "skipped", reason: "no_hints" };
    }

    const defaultEntityTypes = ["client", "dossier", "lawsuit", "task", "session", "mission"];
    const found = [];
    const ambiguous = [];
    for (const hint of hints) {
      const candidateTypes = hint.hintedEntityType
        ? [hint.hintedEntityType]
        : defaultEntityTypes;
      for (const entityType of candidateTypes) {
        let resolution = null;
        try {
          resolution = await this.engine.resolveEntity(
            {
              entityType,
              identifier: hint.identifier,
              mode: hint.mode,
              scopeClientId:
                entityType === "dossier" && Number(requestContext?.clientId || 0) > 0
                  ? Number(requestContext.clientId)
                  : null,
            },
            policy,
          );
        } catch (_) {
          resolution = null;
        }
        if (resolution?.found && Number.isInteger(Number(resolution.entityId)) && Number(resolution.entityId) > 0) {
          found.push({
            entityType: String(resolution.entityType || entityType).toLowerCase(),
            entityId: Number(resolution.entityId),
            entityLabel: resolution.entityLabel || null,
          });
          continue;
        }
        if (String(resolution?.reason || "").toLowerCase() === "ambiguous") {
          ambiguous.push({
            entityType: String(entityType).toLowerCase(),
            candidates: Array.isArray(resolution?.candidates) ? resolution.candidates : [],
          });
        }
      }
    }

    const foundDeduped = [];
    const seen = new Set();
    for (const row of found) {
      const key = `${row.entityType}:${row.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      foundDeduped.push(row);
    }

    if (foundDeduped.length === 1) {
      return {
        status: "resolved",
        resolvedEntity: foundDeduped[0],
      };
    }
    if (foundDeduped.length > 1 || ambiguous.length > 0) {
      return {
        status: "ambiguous",
        suggestionArtifact: this._buildScopeDiscoverySuggestion({
          message: userMessage,
          found: foundDeduped,
          ambiguous,
        }),
      };
    }
    return { status: "skipped", reason: "unresolved" };
  }

  _deriveResolvedEntityFromAmbiguity(ambiguityResolution = null) {
    const resolvedScope =
      ambiguityResolution?.resolvedScope && typeof ambiguityResolution.resolvedScope === "object"
        ? ambiguityResolution.resolvedScope
        : null;
    if (resolvedScope) {
      try {
        const resolvedStorageScope = resolveStorageTarget({
          activeScope: resolvedScope,
          storageHint: StorageHint.INHERIT,
        });
        return {
          entityType: resolvedStorageScope.entityType,
          entityId: resolvedStorageScope.entityId,
        };
      } catch (_) {
        // fall through to metadata
      }
    }

    const meta = ambiguityResolution?.resolutionMeta || null;
    const metaType = String(meta?.entityType || "").toLowerCase();
    const metaId = Number(meta?.chosenId || 0);
    if (metaType && Number.isInteger(metaId) && metaId > 0) {
      return { entityType: metaType, entityId: metaId };
    }

    return null;
  }

  _pinEntityScopeBeforeContract({
    requestContext,
    executionContext,
    resolvedEntity,
    source = "resolved",
  } = {}) {
    const type = String(resolvedEntity?.entityType || "").toLowerCase();
    const id = Number(resolvedEntity?.entityId || 0);
    if (!type || !Number.isInteger(id) || id <= 0) return null;

    const scopeKey = this._scopeKeyForEntityType(type);
    if (scopeKey) {
      requestContext[scopeKey] = id;
      executionContext[scopeKey] = id;
    }

    requestContext.resolvedEntity = { type, id };
    executionContext.resolvedEntity = { type, id };

    updateChatOrchestratorState(this.engine, requestContext, {
      activeScope: {
        entityType: type,
        entityId: id,
        source,
        confidence: 1,
      },
    });
    if (this.helper?.scopeManager && typeof this.helper.scopeManager.applyEvent === "function") {
      this.helper.scopeManager.applyEvent(requestContext, {
        type: source === "explicit_selection" ? "ENTITY_SELECTED_EXPLICIT" : "READ_ENTITY_UNAMBIGUOUS",
        entityType: type,
        entityId: id,
        source: source === "explicit_selection" ? "explicit" : "resolved",
        resolutionPath: source === "explicit_selection" ? "explicit_selection" : "tool_single_entity",
      });
    }
    return { entityType: type, entityId: id };
  }

  async _proposeStoreDocumentDraftArtifact({
    documentArtifact,
    policy,
    executionContext,
    requestContext,
  }) {
    if (!documentArtifact || typeof documentArtifact !== "object") return null;
    const targetType = String(documentArtifact.entityType || "").toLowerCase();
    const targetId = Number(documentArtifact.entityId || 0);
    if (!targetType || !Number.isInteger(targetId) || targetId <= 0) return null;

    const mutationInput = {
      operations: [
        {
          op: "ATTACH_TO_ENTITY",
          entityType: targetType,
          payload: {
            target: { type: targetType, id: targetId },
            attachmentType: "doc_draft",
            payload: {
              title: documentArtifact.title || "Document Draft",
              content: String(documentArtifact.content || ""),
              metadata:
                documentArtifact.metadata &&
                typeof documentArtifact.metadata === "object" &&
                !Array.isArray(documentArtifact.metadata)
                  ? documentArtifact.metadata
                  : {},
              notes: "LLM-generated document draft",
            },
          },
          reason: "Store generated document draft as linked doc_draft artifact",
        },
      ],
      idempotencyKey: `store_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      origin: "chat",
      risk: "medium",
    };
    const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
    const v2Result = await this.engine.executeToolV2("universalMutation", mutationInput, executionPolicy, {
      ...executionContext,
      posture: "WORK",
      confirmed: true,
      sourceRoute: "/agent/chat",
    });
    const proposal = v2Result?.result || null;
    if (
      proposal &&
      proposal.proposalId &&
      proposal.requiresConfirmation === true &&
      typeof this.engine.storeProposal === "function"
    ) {
      this.engine.storeProposal(proposal, {
        sourceRoute: "/agent/chat",
        proposalKind: "entity_mutation",
        origin: "strong_mutation_intent",
        strongMutationIntent: true,
        explicitMutationCommand: false,
        requiresExtraConfirmation: false,
        riskLevel: "medium",
        conversationId: requestContext?.conversationId || null,
        sessionId: executionContext?.sessionId || null,
        userId: executionContext?.userId || null,
        tenantId: executionContext?.tenantId || null,
      });
      return {
        proposal,
        artifact: toProposalArtifact(proposal, executionContext?.sessionId || null),
      };
    }
    return null;
  }

  _buildOutputContractInvalidResult({
    parseError,
    loopResult,
    requestContext,
    userMessage,
    posture,
  }) {
    this.engine?.ledger?.record?.({
      type: "chat_output_contract_invalid",
      sourceRoute: "/agent/chat",
      errorCode: parseError?.code || "OUTPUT_CONTRACT_INVALID",
      messagePreview: String(loopResult?.finalMessage || "").slice(0, 160),
      parsePhase:
        parseError?.code === "OUTPUT_CONTRACT_INVALID_JSON" ? "json" : "schema",
      timestamp: new Date().toISOString(),
    });
    const finalMessage = "I could not produce a valid structured response for this request.";
    const errorArtifact = {
      type: "error",
      code: parseError?.code || "OUTPUT_CONTRACT_INVALID",
      message: "Invalid structured output contract returned by model.",
      details: Array.isArray(parseError?.details) ? parseError.details : undefined,
    };
    this.helper._recordTranscript({
      requestContext,
      userMessage,
      finalMessage,
      posture,
      toolExecutions: loopResult?.toolExecutions || [],
      artifactType: "error",
      artifact: errorArtifact,
    });
    return withStateOutput(
      {
        message: finalMessage,
        toolExecutions: loopResult?.toolExecutions || [],
        stepCommentaries: loopResult?.stepCommentaries || [],
        rounds: loopResult?.rounds || 0,
        outputArtifact: errorArtifact,
      },
      CHAT_STATES.FINAL,
    );
  }

  async _buildMutationProposalFromOutputContract({
    contract,
    policy,
    executionContext,
    requestContext,
  }) {
    const metadata =
      contract?.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
        ? contract.metadata
        : {};
    const operations = Array.isArray(metadata.operations) ? metadata.operations : null;
    if (!operations || operations.length === 0) {
      const err = new Error("Mutation outputs must include metadata.operations.");
      err.code = "MUTATION_OPERATIONS_REQUIRED_IN_METADATA";
      throw err;
    }

    const mutationInput = {
      operations,
      idempotencyKey:
        typeof metadata.idempotencyKey === "string" && metadata.idempotencyKey.trim()
          ? metadata.idempotencyKey.trim()
          : `mutation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      origin: "chat",
      risk: ["low", "medium", "high"].includes(String(metadata.risk || "").toLowerCase())
        ? String(metadata.risk).toLowerCase()
        : "medium",
    };

    const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
    const v2Result = await this.engine.executeToolV2("universalMutation", mutationInput, executionPolicy, {
      ...executionContext,
      posture: "WORK",
      confirmed: true,
      sourceRoute: "/agent/chat",
    });
    const proposal = v2Result?.result || null;
    if (proposal && proposal.type === "entity_creation_form") {
      return proposal;
    }
    if (
      proposal &&
      proposal.proposalId &&
      proposal.requiresConfirmation === true &&
      typeof this.engine.storeProposal === "function"
    ) {
      const normalizedRisk = String(mutationInput?.risk || "medium").toLowerCase();
      this.engine.storeProposal(proposal, {
        sourceRoute: "/agent/chat",
        proposalKind: "entity_mutation",
        origin: "strong_mutation_intent",
        strongMutationIntent: true,
        explicitMutationCommand: false,
        requiresExtraConfirmation: normalizedRisk === "high",
        riskLevel: normalizedRisk,
        conversationId: requestContext?.conversationId || null,
        sessionId: executionContext?.sessionId || null,
        userId: executionContext?.userId || null,
        tenantId: executionContext?.tenantId || null,
      });
    }
    return proposal;
  }

  async runChatTurn({
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
      const err = new Error("Message is required");
      err.status = 400;
      throw err;
    }

    const requestContext = this._buildRequestContext({
      context,
      sessionId,
      metadata,
      userId,
      tenantId,
    });
    this._traceExecutionStep(requestContext, "context_packet_built", {
      hasClientId: Number(requestContext?.clientId || 0) > 0,
      hasDossierId: Number(requestContext?.dossierId || 0) > 0,
      hasResolvedEntity:
        Boolean(requestContext?.resolvedEntity?.type) &&
        Number(requestContext?.resolvedEntity?.id || 0) > 0,
    });
    const policy = this.engine._resolvePolicy(agentVersion);
    const llmHistory =
      typeof this.engine.contextStore?.getContextForLLMInjection === "function"
        ? this.engine.contextStore.getContextForLLMInjection(requestContext)
        : {};
    let sessionState = getChatOrchestratorState(this.engine, requestContext);
    const turnCounter = Number(sessionState?.turnCounter || 0) + 1;
    sessionState = updateChatOrchestratorState(this.engine, requestContext, {
      turnCounter,
    });
    let state = selectInitialState({
      followUpIntent,
      sessionState,
      policy,
      requestContext,
    });
    const continuityBinding = bindLastResolvedEntityToRequestContext({
      userMessage,
      requestContext,
      lastResolvedEntity: sessionState?.lastResolvedEntity || null,
    });
    if (continuityBinding.applied && continuityBinding.boundEntity) {
      sessionState = updateChatOrchestratorState(this.engine, requestContext, {
        activeScope: {
          entityType: continuityBinding.boundEntity.type,
          entityId: continuityBinding.boundEntity.id,
          source: "scoped_entity_context",
          confidence: 0.95,
        },
      });
      this._traceExecutionStep(requestContext, "scoped_entity_context_bound", {
        entityType: continuityBinding.boundEntity.type,
        entityId: continuityBinding.boundEntity.id,
        reason: continuityBinding.reason,
      });
    } else {
      this._traceExecutionStep(requestContext, "scoped_entity_context_skipped", {
        reason: continuityBinding.reason,
      });
    }
    const pendingClarification = sessionState?.pendingClarification || null;
    const pendingArtifact = pendingClarification?.artifact || null;
    const pendingSuggestions = Array.isArray(pendingArtifact?.suggestions)
      ? pendingArtifact.suggestions
      : [];
    const pendingCandidateKeySet = new Set();
    for (const candidate of pendingSuggestions) {
      if (!candidate || typeof candidate !== "object") continue;
      Object.keys(candidate).forEach((key) => pendingCandidateKeySet.add(String(key)));
    }
    this._traceExecutionStep(requestContext, "clarification_gate_state", {
      selectedInitialState: state,
      hasPendingClarification: Boolean(pendingClarification),
      pendingClarificationType:
        String(pendingArtifact?.type || pendingClarification?.entityType || "none"),
      pendingCandidatesCount: pendingSuggestions.length,
      pendingCandidateKeysPresent: Array.from(pendingCandidateKeySet).sort(),
      branchTaken: state === CHAT_STATES.CLARIFY ? "CLARIFY" : "normal",
    });

    let resolvedSelection = this.helper._extractResolvedSelection(followUpIntent);
    if (state === CHAT_STATES.CLARIFY) {
      const pendingClarification = sessionState.pendingClarification || null;
      const pendingExpiresAt = pendingClarification?.expiresAt
        ? Date.parse(pendingClarification.expiresAt)
        : NaN;
      const ttlExpired =
        Number.isFinite(pendingExpiresAt) && pendingExpiresAt > 0
          ? Date.now() > pendingExpiresAt
          : pendingClarification?.createdAt
            ? Date.now() - Date.parse(pendingClarification.createdAt) > PENDING_CLARIFICATION_TTL_MS
            : false;
      const turnBudgetExceeded =
        Number.isFinite(Number(pendingClarification?.turnsRemaining))
          ? Number(pendingClarification.turnsRemaining) <= 0
          : false;
      const matcherResult = resolvedSelection
        ? {
            isAnswer: true,
            reason: "resolved_selection_follow_up_intent",
            resolved: {
              kind: "selection",
              entityType: resolvedSelection.entityType,
              entityId: resolvedSelection.entityId,
              label: resolvedSelection.label || null,
              scope: resolvedSelection.scope || {},
            },
          }
        : clarificationAnswerMatcher(pendingClarification, userMessage);
      const shouldClearForFreshTurn =
        !resolvedSelection && (ttlExpired || turnBudgetExceeded || !matcherResult.isAnswer);
      if (pendingClarification && shouldClearForFreshTurn) {
        const clearReason = ttlExpired
          ? "expired_ttl"
          : turnBudgetExceeded
            ? "expired_turn_budget"
            : matcherResult.reason || "not_a_clarification_answer";
        updateChatOrchestratorState(this.engine, requestContext, {
          pendingClarification: null,
          activeState: pendingClarification?.resumeState || CHAT_STATES.RETRIEVE,
        });
        this.engine?.ledger?.record?.({
          type: "clarify_cleared_new_intent",
          sourceRoute: "/agent/chat",
          reason: clearReason,
          hasPendingClarification: true,
          pendingClarificationType:
            String(pendingClarification?.artifact?.type || pendingClarification?.entityType || "unknown"),
          pendingCandidatesCount: Array.isArray(pendingClarification?.artifact?.suggestions)
            ? pendingClarification.artifact.suggestions.length
            : 0,
          turnCounter,
          timestamp: new Date().toISOString(),
        });
        this._traceExecutionStep(requestContext, "clarification_pending_cleared", {
          cleared: true,
          reason: clearReason,
          branchTaken: "normal",
        });
        state = pendingClarification?.resumeState || CHAT_STATES.RETRIEVE;
      }
      if (
        !resolvedSelection &&
        matcherResult.isAnswer &&
        matcherResult?.resolved?.kind === "selection"
      ) {
        const matched = matcherResult.resolved;
        resolvedSelection = {
          entityType: String(matched.entityType || "").toLowerCase(),
          entityId: Number(matched.entityId),
          label: String(matched.label || "").trim() || null,
          scope:
            matched.scope && typeof matched.scope === "object" && !Array.isArray(matched.scope)
              ? matched.scope
              : {},
        };
      }
      if (resolvedSelection) {
        Object.assign(requestContext, resolvedSelection.scope || {});
        updateChatOrchestratorState(this.engine, requestContext, {
          activeScope: {
            entityType: resolvedSelection.entityType,
            entityId: resolvedSelection.entityId,
            source: "explicit_selection",
            confidence: 1,
          },
          pendingClarification: null,
          activeState: pendingClarification?.resumeState || CHAT_STATES.RETRIEVE,
        });
        this._traceExecutionStep(requestContext, "clarification_pending_cleared", {
          cleared: true,
          reason: matcherResult?.reason || "resolved_selection",
          branchTaken: "CLARIFY",
        });
        state = pendingClarification?.resumeState || CHAT_STATES.RETRIEVE;
      } else if (pendingClarification?.artifact && !shouldClearForFreshTurn) {
        const decrementedTurns = Number.isFinite(Number(pendingClarification?.turnsRemaining))
          ? Math.max(0, Number(pendingClarification.turnsRemaining) - 1)
          : PENDING_CLARIFICATION_MAX_TURNS - 1;
        if (!ttlExpired && !turnBudgetExceeded) {
          updateChatOrchestratorState(this.engine, requestContext, {
            pendingClarification: {
              ...pendingClarification,
              turnsRemaining: decrementedTurns,
            },
            activeState: CHAT_STATES.CLARIFY,
          });
        }
        const finalMessage =
          String(pendingClarification.artifact.message || "").trim() ||
          "Please choose the exact record.";
        this.helper._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture: "ASSISTANT",
          toolExecutions: [],
          artifactType: "context_suggestion",
          artifact: pendingClarification.artifact,
        });
        this._traceExecutionStep(requestContext, "clarification_pending_replayed", {
          cleared: false,
          reason: matcherResult?.reason || "clarification_replay",
          turnsRemaining: decrementedTurns,
          branchTaken: "CLARIFY",
        });
        return withStateOutput(
          {
            message: finalMessage,
            ambiguityArtifact: pendingClarification.artifact,
            outputArtifact: pendingClarification.artifact,
            resolutionMeta: pendingClarification.resolutionMeta || null,
          },
          CHAT_STATES.FINAL,
        );
      }
    }

    if (state === CHAT_STATES.EXECUTE && sessionState.pendingProposal) {
      const pendingProposal = sessionState.pendingProposal;
      const finalMessage =
        "A change is ready to execute and still requires explicit confirmation. Use the confirmation action in the UI.";
      this.helper._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture: "WORK",
        toolExecutions: [],
        artifactType: "proposal",
        artifact: pendingProposal.artifact || null,
      });
      return withStateOutput(
        {
          message: finalMessage,
          outputArtifact: pendingProposal.artifact || null,
          mutationOutcome: {
            status: "PROPOSED",
            proposalId: pendingProposal.proposalId,
            safeMessage: finalMessage,
          },
        },
        CHAT_STATES.FINAL,
      );
    }

    const effectiveUserMessage = resolvedSelection
      ? `show ${resolvedSelection.entityType} ${resolvedSelection.label || resolvedSelection.entityId}`
      : userMessage;
    const posture = await this.helper._resolvePosture({
      message: effectiveUserMessage,
      context: requestContext,
      llmHistory,
    });
    this._traceExecutionStep(requestContext, "posture_determined", {
      posture,
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
    const draftIntent = detectDraftIntent(effectiveUserMessage, requestContext);

    if (resolvedSelection) {
      clearPendingClarificationState(this.engine, requestContext);
      requestContext.resolvedEntity = {
        type: resolvedSelection.entityType,
        id: resolvedSelection.entityId,
        label: resolvedSelection.label,
      };
      updateChatOrchestratorState(this.engine, requestContext, {
        activeScope: {
          entityType: resolvedSelection.entityType,
          entityId: resolvedSelection.entityId,
          source: "explicit_selection",
          confidence: 1,
        },
      });
      this._pinEntityScopeBeforeContract({
        requestContext,
        executionContext,
        resolvedEntity: {
          entityType: resolvedSelection.entityType,
          entityId: resolvedSelection.entityId,
        },
        source: "explicit_selection",
      });
      this._traceExecutionStep(requestContext, "scope_pinned_pre_llm", {
        source: "explicit_selection",
        entityType: resolvedSelection.entityType,
        entityId: resolvedSelection.entityId,
      });
    }

    const discoveredScope = await this._discoverScopeBeforeContract({
      userMessage: effectiveUserMessage,
      requestContext,
      executionContext,
      policy,
      llmHistory,
    });
    this._traceExecutionStep(requestContext, "scope_discovery_completed", {
      status: discoveredScope?.status || "skipped",
      reason: discoveredScope?.reason || null,
      entityType: discoveredScope?.resolvedEntity?.entityType || null,
      entityId: discoveredScope?.resolvedEntity?.entityId || null,
    });
    if (discoveredScope?.status === "resolved" && discoveredScope?.resolvedEntity) {
      this._pinEntityScopeBeforeContract({
        requestContext,
        executionContext,
        resolvedEntity: discoveredScope.resolvedEntity,
        source: "resolved",
      });
      this._traceExecutionStep(requestContext, "scope_pinned_pre_llm", {
        source: "scope_discovery",
        entityType: discoveredScope.resolvedEntity.entityType,
        entityId: discoveredScope.resolvedEntity.entityId,
      });
    } else if (discoveredScope?.status === "ambiguous" && discoveredScope?.suggestionArtifact) {
      const pendingClarification = {
        entityType: discoveredScope?.suggestionArtifact?.entityType || null,
        resumeState: state,
        artifact: discoveredScope.suggestionArtifact,
        resolutionMeta: {
          status: "ambiguous",
          entityType: discoveredScope?.suggestionArtifact?.entityType || null,
          candidatesCount: Array.isArray(discoveredScope?.suggestionArtifact?.suggestions)
            ? discoveredScope.suggestionArtifact.suggestions.length
            : 0,
          autoPicked: false,
          chosenId: null,
        },
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
        turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
      };
      updateChatOrchestratorState(this.engine, requestContext, {
        activeState: CHAT_STATES.CLARIFY,
        pendingClarification,
      });
      const finalMessage =
        String(discoveredScope.suggestionArtifact.message || "").trim() ||
        "I need one more detail to continue.";
      this.helper._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture,
        toolExecutions: [],
        artifactType: "context_suggestion",
        artifact: discoveredScope.suggestionArtifact,
      });
      return withStateOutput(
        {
          message: finalMessage,
          ambiguityArtifact: discoveredScope.suggestionArtifact,
          outputArtifact: discoveredScope.suggestionArtifact,
          resolutionMeta: pendingClarification.resolutionMeta,
        },
        CHAT_STATES.FINAL,
      );
    }

    const llmActiveScope =
      llmHistory?.conversationScope?.activeScope &&
      llmHistory.conversationScope.activeScope.entityType &&
      Number.isInteger(Number(llmHistory.conversationScope.activeScope.entityId)) &&
      Number(llmHistory.conversationScope.activeScope.entityId) > 0
        ? {
            entityType: String(llmHistory.conversationScope.activeScope.entityType).toLowerCase(),
            entityId: Number(llmHistory.conversationScope.activeScope.entityId),
          }
        : null;
    const governanceActiveScope =
      llmActiveScope || this._resolveActiveEntityScope(requestContext, llmHistory);
    const governanceExecutionContext = { ...executionContext };
    if (
      governanceActiveScope?.entityType &&
      Number.isInteger(Number(governanceActiveScope?.entityId)) &&
      Number(governanceActiveScope.entityId) > 0
    ) {
      const scopeKey = this._scopeKeyForEntityType(governanceActiveScope.entityType);
      if (scopeKey && !Number(requestContext?.[scopeKey] || 0)) {
        governanceExecutionContext[scopeKey] = Number(governanceActiveScope.entityId);
      }
      // Prefer active scope from UI/session context for mutation governance.
      governanceExecutionContext.resolvedEntity = {
        type: String(governanceActiveScope.entityType).toLowerCase(),
        id: Number(governanceActiveScope.entityId),
      };
    }

    const mutationGovernance = await evaluateMutationGovernance({
      userMessage: effectiveUserMessage,
      requestContext,
      executionContext: governanceExecutionContext,
      llmExtractor: this.helper?.mutationIntentExtractor,
    });
    this._traceExecutionStep(requestContext, "mutation_governance_evaluated", {
      intent: mutationGovernance?.intent || null,
      entityType: mutationGovernance?.entityType || null,
      entityTypeResolutionStatus: mutationGovernance?.entityTypeResolution?.status || null,
      entityTypeResolutionSource: mutationGovernance?.entityTypeResolution?.source || null,
      entityTypeResolutionCandidates: Array.isArray(mutationGovernance?.entityTypeResolution?.candidates)
        ? mutationGovernance.entityTypeResolution.candidates
        : [],
      confidence: Number.isFinite(Number(mutationGovernance?.confidence))
        ? Number(mutationGovernance.confidence)
        : null,
      missingRequiredFields: Array.isArray(mutationGovernance?.missingRequiredFields)
        ? mutationGovernance.missingRequiredFields
        : [],
      bypassReadResolution: Boolean(mutationGovernance?.shouldBypassReadResolution),
    });
    if (mutationGovernance?.shouldBypassReadResolution) {
      const operations = this._buildMutationOperationsFromGovernance(
        mutationGovernance,
        requestContext,
      );
      const missingRequiredFields = Array.isArray(mutationGovernance?.missingRequiredFields)
        ? mutationGovernance.missingRequiredFields.filter(Boolean)
        : [];
      if (missingRequiredFields.length > 0 || operations.length === 0) {
        const clarifyArtifact = this._buildMutationGovernanceClarificationArtifact({
          governance: mutationGovernance,
          userMessage: effectiveUserMessage,
        });
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.CLARIFY,
          pendingClarification: {
            entityType: mutationGovernance?.entityType || null,
            resumeState: state,
            artifact: clarifyArtifact,
            resolutionMeta: {
              status: "missing",
              entityType: mutationGovernance?.entityType || null,
              candidatesCount: 0,
              autoPicked: false,
              chosenId: null,
            },
            createdAt: nowIso(),
            expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
            turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
          },
        });
        const finalMessage =
          String(clarifyArtifact.message || "").trim() ||
          "I need a few required fields before preparing this mutation proposal.";
        this.helper._recordTranscript({
          requestContext,
          userMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "context_suggestion",
          artifact: clarifyArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: clarifyArtifact,
            ambiguityArtifact: clarifyArtifact,
            resolutionMeta: {
              mutationGovernance,
            },
          },
          CHAT_STATES.FINAL,
        );
      }

      const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
      const targetScopeBinding = this._buildScopeSnapshotForStorage({
        requestContext,
        activeScope,
      });
      const syntheticContract = {
        outputType: "mutation",
        title: "Mutation Proposal",
        content: `I prepared a ${mutationGovernance.intent} proposal for ${mutationGovernance.entityType}. Please review and confirm.`,
        metadata: {
          risk: "medium",
          operations,
          targetScope: targetScopeBinding,
          governance: {
            intent: mutationGovernance.intent,
            entityType: mutationGovernance.entityType,
            confidence: mutationGovernance.confidence,
            dedupeQuery: mutationGovernance.dedupeQuery || null,
          },
        },
      };
      let proposal = null;
      try {
        proposal = await this._buildMutationProposalFromOutputContract({
          contract: syntheticContract,
          policy,
          executionContext: {
            ...executionContext,
            userMessage: effectiveUserMessage,
          },
          requestContext,
        });
      } catch (error) {
        const errorArtifact = {
          type: "error",
          code: String(error?.code || "MUTATION_GOVERNANCE_PROPOSAL_FAILED"),
          message: String(error?.message || "Mutation governance could not build proposal."),
        };
        const finalMessage = "I could not prepare the requested mutation proposal.";
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "error",
          artifact: errorArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: errorArtifact,
            resolutionMeta: {
              mutationGovernance,
            },
          },
          CHAT_STATES.FINAL,
        );
      }
      if (proposal?.type === "entity_creation_form") {
        const finalMessage = "I need a few required identity fields before preparing this mutation.";
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "entity_creation_form",
          artifact: proposal,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: proposal,
            resolutionMeta: {
              mutationGovernance,
            },
          },
          CHAT_STATES.FINAL,
        );
      }
      if (proposal?.proposalId && proposal.requiresConfirmation === true) {
        const proposalArtifact = toProposalArtifact(proposal, executionContext?.sessionId || null);
        proposalArtifact.targetScope = targetScopeBinding;
        proposalArtifact.operations = operations;
        proposalArtifact.mutationGovernance = {
          intent: mutationGovernance.intent,
          entityType: mutationGovernance.entityType,
          confidence: mutationGovernance.confidence,
        };
        const pendingProposal = {
          proposalId: proposal.proposalId,
          summary: proposal.humanReadableSummary || null,
          riskLevel: proposal?.confirmation?.extraRiskAck === true ? "high" : "normal",
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          artifact: proposalArtifact,
        };
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.EXECUTE,
          pendingProposal,
          pendingClarification: null,
        });
        const finalMessage =
          syntheticContract.content ||
          "I prepared a mutation proposal. Please review and confirm before execution.";
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: [],
          artifactType: "proposal",
          artifact: proposalArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            outputArtifact: proposalArtifact,
            mutationOutcome: {
              status: "PROPOSED",
              proposalId: proposal.proposalId,
              proposalArtifact,
            },
            resolutionMeta: {
              outputContract: syntheticContract,
              routedOutputType: "mutation",
              mutationGovernance,
            },
          },
          CHAT_STATES.EXECUTE,
        );
      }
    }

    const shouldSkipAmbiguityForUnscopedDraft =
      Boolean(draftIntent?.intent) &&
      (!Array.isArray(draftIntent?.entityHints) || draftIntent.entityHints.length === 0) &&
      !this._resolveActiveEntityScope(requestContext, llmHistory);
    const ambiguityResolution = shouldSkipAmbiguityForUnscopedDraft
      ? { status: "skipped" }
      : await resolveChatAmbiguity({
          engine: this.engine,
          message: effectiveUserMessage,
          policy,
          executionContext,
          exposedTools: [],
        });
    const futureCreateHint =
      ambiguityResolution?.reason === "future_intent_create_candidate" &&
      ambiguityResolution?.mutationHint
        ? ambiguityResolution.mutationHint
        : null;
    this._traceExecutionStep(requestContext, "entity_resolution_completed", {
      status: ambiguityResolution?.status || "skipped",
      entityType: ambiguityResolution?.resolutionMeta?.entityType || null,
      chosenId: ambiguityResolution?.resolutionMeta?.chosenId || null,
      reason: ambiguityResolution?.reason || null,
      mutationHintEntityType: futureCreateHint?.entityType || null,
      mutationHintOperation: futureCreateHint?.operation || null,
    });
    if (ambiguityResolution?.status === "resolved" && ambiguityResolution?.resolvedScope) {
      Object.assign(requestContext, ambiguityResolution.resolvedScope);
      Object.assign(executionContext, ambiguityResolution.resolvedScope);
      const resolvedFromAmbiguity = this._deriveResolvedEntityFromAmbiguity(ambiguityResolution);
      if (resolvedFromAmbiguity) {
        this._pinEntityScopeBeforeContract({
          requestContext,
          executionContext,
          resolvedEntity: resolvedFromAmbiguity,
          source: "resolved",
        });
        this._traceExecutionStep(requestContext, "scope_pinned_pre_llm", {
          source: "resolved",
          entityType: resolvedFromAmbiguity.entityType,
          entityId: resolvedFromAmbiguity.entityId,
        });
      }
    }
    if (
      ["ambiguous", "missing", "not_found"].includes(String(ambiguityResolution?.status || "")) &&
      ambiguityResolution?.suggestionArtifact
    ) {
      const pendingClarification = {
        entityType: ambiguityResolution?.resolutionMeta?.entityType || null,
        resumeState: state,
        artifact: ambiguityResolution.suggestionArtifact,
        resolutionMeta: ambiguityResolution.resolutionMeta || null,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
        turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
      };
      updateChatOrchestratorState(this.engine, requestContext, {
        activeState: CHAT_STATES.CLARIFY,
        pendingClarification,
      });
      const finalMessage =
        String(ambiguityResolution.suggestionArtifact.message || "").trim() ||
        "I need one more detail to continue.";
      this.helper._recordTranscript({
        requestContext,
        userMessage,
        finalMessage,
        posture,
        toolExecutions: [],
        artifactType: "context_suggestion",
        artifact: ambiguityResolution.suggestionArtifact,
      });
      return withStateOutput(
        {
          message: finalMessage,
          ambiguityArtifact: ambiguityResolution.suggestionArtifact,
          outputArtifact: ambiguityResolution.suggestionArtifact,
          resolutionMeta: ambiguityResolution.resolutionMeta || null,
        },
        CHAT_STATES.FINAL,
      );
    }

    const documentFallback = this.helper._buildDocumentContextFallback({
      requestContext,
      userMessage: effectiveUserMessage,
      policyVersion: policy.version,
      posture,
    });
    if (documentFallback) {
      this.helper._recordTranscript({
        requestContext,
        userMessage: effectiveUserMessage,
        finalMessage: documentFallback.message,
        posture,
        toolExecutions: [],
      });
      return withStateOutput(
        {
          message: documentFallback.message,
          outputArtifact: {
            type: "chat",
            message: documentFallback.message,
          },
        },
        CHAT_STATES.FINAL,
      );
    }

    const deterministicReadResult = await this._tryRunDeterministicReadList({
      userMessage: effectiveUserMessage,
      requestContext,
      executionContext,
      llmHistory,
      policy,
      posture,
      state,
    });
    if (deterministicReadResult) {
      return deterministicReadResult;
    }

    const stateForTools = state === CHAT_STATES.RETRIEVE ? CHAT_STATES.RETRIEVE : CHAT_STATES.PLAN_DRAFT;
    const allExposedTools = this._buildExposedToolsForState(stateForTools, policy, executionContext);
    const exposedTools = this.helper._selectToolsForMessage(effectiveUserMessage, allExposedTools);
    const messages = this.helper._buildModelMessages({
      userMessage: effectiveUserMessage,
      llmHistory,
      posture,
      requestContext,
      exposedTools,
      draftIntent,
    });
    if (futureCreateHint) {
      messages.push({
        role: "system",
        content:
          `Routing hint: treat this as a create request for entity type "${futureCreateHint.entityType}". ` +
          "No scoped records were found for this type and the user phrasing is future-intent. " +
          "Prefer a mutation output contract with CREATE_ENTITY instead of read-resolution clarification.",
      });
    }

    const loopResult = await runChatToolLoop({
      helperService: this.helper,
      messages,
      exposedTools,
      policy,
      executionContext,
      signal,
    });
    this._traceExecutionStep(requestContext, "output_contract_generation_completed", {
      rounds: loopResult?.rounds || 0,
      toolCalls: Array.isArray(loopResult?.toolExecutions) ? loopResult.toolExecutions.length : 0,
    });
    const resolvedFromTools = inferLastResolvedFromToolExecutions(loopResult?.toolExecutions || []);
    if (resolvedFromTools) {
      updateChatOrchestratorState(this.engine, requestContext, {
        lastResolvedEntity: resolvedFromTools,
      });
      this._traceExecutionStep(requestContext, "scoped_entity_context_updated_from_tools", {
        entityType: resolvedFromTools.type,
        entityId: resolvedFromTools.id,
      });
    }
    const parsedContract = parseFinalOutputContract(loopResult.finalMessage);
    if (!parsedContract.ok) {
      return this._buildOutputContractInvalidResult({
        parseError: parsedContract.error,
        loopResult,
        requestContext,
        userMessage: effectiveUserMessage,
        posture,
      });
    }
    const contract = parsedContract.contract;
    const scopedForDraftRouting = this._resolveActiveEntityScope(requestContext, llmHistory);
    const routedOutputType =
      contract.outputType === "message" && draftIntent?.intent && scopedForDraftRouting
        ? "document"
        : contract.outputType;
    if (routedOutputType !== contract.outputType) {
      this._traceExecutionStep(requestContext, "output_type_adjusted", {
        from: contract.outputType,
        to: routedOutputType,
        reason: "draft_intent_with_scoped_context",
      });
    }
    this._traceExecutionStep(requestContext, "output_contract_parsed", {
      outputType: routedOutputType,
    });
    this.engine?.ledger?.record?.({
      type: "chat_output_contract_parsed",
      sourceRoute: "/agent/chat",
      outputType: routedOutputType,
      hasTitle: typeof contract.title === "string" && contract.title.trim().length > 0,
      contentLength: contract.content.length,
      metadataKeys: Object.keys(contract.metadata || {}),
      timestamp: new Date().toISOString(),
    });

    let finalMessage = contract.content;
    let outputArtifact = null;
    let mutationOutcome = null;
    let nextState = CHAT_STATES.FINAL;
    let routeAction = "message";

    if (routedOutputType === "message" || routedOutputType === "research") {
      finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
        finalMessage: contract.content,
        requestContext,
      });
      routeAction = routedOutputType === "research" ? "research_message" : "message";
      if (routedOutputType === "research" && contract.metadata && Object.keys(contract.metadata).length > 0) {
        outputArtifact = {
          type: "research_contract",
          title: contract.title || null,
          content: contract.content,
          metadata: contract.metadata,
        };
      }
    } else if (routedOutputType === "document") {
      routeAction = "document_tool";
      let activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
      const scopedDiscovery = await this._discoverArtifactScopeFromClient({
        userMessage: effectiveUserMessage,
        requestContext,
        executionContext,
        policy,
        llmHistory,
      });
      this._traceExecutionStep(requestContext, "artifact_scope_discovery_completed", {
        status: scopedDiscovery?.status || "skipped",
        reason: scopedDiscovery?.reason || null,
        entityType: scopedDiscovery?.resolvedEntity?.entityType || null,
        entityId: scopedDiscovery?.resolvedEntity?.entityId || null,
      });
      if (scopedDiscovery?.status === "resolved" && scopedDiscovery.resolvedEntity) {
        activeScope = {
          entityType: scopedDiscovery.resolvedEntity.entityType,
          entityId: scopedDiscovery.resolvedEntity.entityId,
        };
      } else if (
        scopedDiscovery?.status === "clarify" &&
        scopedDiscovery?.suggestionArtifact
      ) {
        const pendingClarification = {
          entityType: scopedDiscovery?.suggestionArtifact?.entityType || null,
          resumeState: state,
          artifact: scopedDiscovery.suggestionArtifact,
          resolutionMeta: {
            status: "ambiguous",
            entityType: scopedDiscovery?.suggestionArtifact?.entityType || null,
            candidatesCount: Array.isArray(scopedDiscovery?.suggestionArtifact?.suggestions)
              ? scopedDiscovery.suggestionArtifact.suggestions.length
              : 0,
            autoPicked: false,
            chosenId: null,
          },
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
          turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
        };
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.CLARIFY,
          pendingClarification,
        });
        const finalClarifyMessage =
          String(scopedDiscovery.suggestionArtifact.message || "").trim() ||
          "I need one more detail to continue.";
        this.helper._recordTranscript({
          requestContext,
          userMessage,
          finalMessage: finalClarifyMessage,
          posture,
          toolExecutions: loopResult.toolExecutions,
          artifactType: "context_suggestion",
          artifact: scopedDiscovery.suggestionArtifact,
        });
        return withStateOutput(
          {
            message: finalClarifyMessage,
            toolExecutions: loopResult.toolExecutions,
            stepCommentaries: loopResult.stepCommentaries,
            rounds: loopResult.rounds,
            ambiguityArtifact: scopedDiscovery.suggestionArtifact,
            outputArtifact: scopedDiscovery.suggestionArtifact,
            resolutionMeta: pendingClarification.resolutionMeta,
          },
          CHAT_STATES.FINAL,
        );
      }
      const documentContext = await buildDocumentContext({
        activeScope,
        readTool: async (toolName, params) => {
          if (!this.engine || typeof this.engine._callReadTool !== "function") return null;
          return this.engine._callReadTool(toolName, params, policy);
        },
      });
      const documentSafeContext = buildDocumentSafeContext(documentContext);
      this._traceExecutionStep(requestContext, "document_tool_called", {
        toolName: "planGeneratedDocument",
        hasActiveScope: Boolean(activeScope),
        hasClientDbId: Number(documentContext?.internal?.clientDbId || 0) > 0,
      });
      const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
      const docToolResult = await this.engine.executeToolV2(
        "planGeneratedDocument",
        {
          ...(contract.title ? { title: contract.title } : {}),
          content: contract.content,
          metadata: {
            ...(contract.metadata || {}),
            structuredContext: documentSafeContext,
          },
        },
        executionPolicy,
        {
          ...executionContext,
          confirmed: true,
          sourceRoute: "/agent/chat",
        },
      );
      const draftArtifactBase = docToolResult?.result && typeof docToolResult.result === "object"
        ? { ...docToolResult.result }
        : {
            type: "document_draft",
            title: contract.title || "Document Draft",
            content: contract.content,
            metadata: contract.metadata || {},
            entityType: null,
            entityId: null,
          };
      const groundedContract = {
        title:
          (typeof draftArtifactBase.title === "string" && draftArtifactBase.title.trim()) ||
          contract.title,
        content:
          (typeof draftArtifactBase.content === "string" && draftArtifactBase.content.trim()) ||
          contract.content,
        metadata: {
          ...(contract.metadata || {}),
          ...(draftArtifactBase?.metadata && typeof draftArtifactBase.metadata === "object"
            ? draftArtifactBase.metadata
            : {}),
        },
      };
      const previewArtifact = this._createPreviewArtifactFromDocumentContract({
        contract: groundedContract,
        activeScope,
        requestContext,
        executionContext,
        structuredContext: documentSafeContext,
      });
      if (previewArtifact?.type === "context_suggestion") {
        outputArtifact = previewArtifact;
        finalMessage =
          String(previewArtifact.message || "").trim() ||
          "I need the target record before I can prepare this stored document preview.";
        nextState = CHAT_STATES.CLARIFY;
        const pendingClarification = {
          entityType: "dossier",
          resumeState: state,
          artifact: previewArtifact,
          resolutionMeta: {
            status: "missing",
            entityType: "dossier",
            candidatesCount: 0,
            autoPicked: false,
            chosenId: null,
          },
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + PENDING_CLARIFICATION_TTL_MS).toISOString(),
          turnsRemaining: PENDING_CLARIFICATION_MAX_TURNS,
        };
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.CLARIFY,
          pendingClarification,
        });
        this._traceExecutionStep(requestContext, "artifact_preview_scope_missing", {
          outputType: "document",
          artifactType: previewArtifact.type || null,
          previewSource: "storage_scope_guard",
        });
      } else if (previewArtifact) {
        outputArtifact = previewArtifact;
        finalMessage =
          "I prepared a document preview. You can edit it and confirm to create a proposal for storing it in the selected record.";
        this._traceExecutionStep(requestContext, "artifact_preview_pipeline_triggered", {
          outputType: "document",
          artifactType: previewArtifact.type || null,
          entityType: previewArtifact?.targetEntity?.type || activeScope?.entityType || null,
          entityId: previewArtifact?.targetEntity?.id || activeScope?.entityId || null,
          previewSource: "planGeneratedDocument_grounded",
        });
      }
      if (!outputArtifact) {
        outputArtifact = {
          ...draftArtifactBase,
          ...(activeScope ? activeScope : {}),
        };
        finalMessage = groundedContract.content;
        this._traceExecutionStep(requestContext, "artifact_preview_pipeline_triggered", {
          outputType: "document",
          artifactType: outputArtifact?.type || null,
          entityType: outputArtifact?.entityType || null,
          entityId: outputArtifact?.entityId || null,
          previewSource: "planGeneratedDocument",
        });
      }
    } else if (routedOutputType === "mutation") {
      routeAction = "mutation_proposal";
      let proposal = null;
      try {
        proposal = await this._buildMutationProposalFromOutputContract({
          contract,
          policy,
          executionContext: {
            ...executionContext,
            userMessage: effectiveUserMessage,
          },
          requestContext,
        });
      } catch (error) {
        const errorArtifact = {
          type: "error",
          code: String(error?.code || "MUTATION_ROUTING_FAILED"),
          message: String(error?.message || "Mutation routing failed."),
        };
        finalMessage = "I could not prepare the requested change because the mutation contract was invalid.";
        outputArtifact = errorArtifact;
        this.engine?.ledger?.record?.({
          type: "chat_output_contract_routed",
          sourceRoute: "/agent/chat",
          outputType: routedOutputType,
          routeAction: "mutation_error",
          proposalCreated: false,
          timestamp: new Date().toISOString(),
        });
        this.helper._recordTranscript({
          requestContext,
          userMessage: effectiveUserMessage,
          finalMessage,
          posture,
          toolExecutions: loopResult.toolExecutions,
          artifactType: "error",
          artifact: errorArtifact,
        });
        return withStateOutput(
          {
            message: finalMessage,
            toolExecutions: loopResult.toolExecutions,
            stepCommentaries: loopResult.stepCommentaries,
            rounds: loopResult.rounds,
            outputArtifact: errorArtifact,
            resolutionMeta: { outputContract: contract },
          },
          CHAT_STATES.FINAL,
        );
      }

      if (proposal?.type === "entity_creation_form") {
        finalMessage = "I need a few required identity fields before preparing this mutation.";
        outputArtifact = proposal;
      } else if (proposal?.proposalId && proposal.requiresConfirmation === true) {
        const pendingProposal = {
          proposalId: proposal.proposalId,
          summary: proposal.humanReadableSummary || null,
          riskLevel: proposal?.confirmation?.extraRiskAck === true ? "high" : "normal",
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          artifact: toProposalArtifact(proposal, executionContext.sessionId),
        };
        nextState = CHAT_STATES.EXECUTE;
        mutationOutcome = {
          status: "PROPOSED",
          proposalId: proposal.proposalId,
          proposalArtifact: pendingProposal.artifact,
        };
        finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
          finalMessage: contract.content,
          requestContext,
        });
        outputArtifact = pendingProposal.artifact;
        updateChatOrchestratorState(this.engine, requestContext, {
          activeState: CHAT_STATES.EXECUTE,
          pendingProposal,
        });
      }
    } else {
      finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
        finalMessage: contract.content,
        requestContext,
      });
    }

    if (nextState !== CHAT_STATES.EXECUTE) {
      updateChatOrchestratorState(this.engine, requestContext, {
        activeState: stateForTools,
      });
    }
    this.engine?.ledger?.record?.({
      type: "chat_output_contract_routed",
      sourceRoute: "/agent/chat",
      outputType: routedOutputType,
      routeAction,
      proposalCreated: mutationOutcome?.status === "PROPOSED",
      timestamp: new Date().toISOString(),
    });

    this.helper._recordTranscript({
      requestContext,
      userMessage: effectiveUserMessage,
      finalMessage,
      posture,
      toolExecutions: loopResult.toolExecutions,
      artifactType:
        outputArtifact && String(outputArtifact.type || "").toLowerCase() === "proposal"
          ? "proposal"
          : outputArtifact && typeof outputArtifact === "object" && outputArtifact.type
            ? String(outputArtifact.type)
            : "chat",
      artifact: outputArtifact,
    });

    try {
      console.log(
        "[ChatOrchestrator][ArtifactOut]",
        JSON.stringify({
          state: nextState,
          outputType: routedOutputType,
          artifactType:
            outputArtifact && typeof outputArtifact === "object"
              ? outputArtifact.type || "object_without_type"
              : null,
          proposalId:
            outputArtifact?.proposalId ||
            outputArtifact?.proposals?.[0]?.proposalId ||
            mutationOutcome?.proposalId ||
            null,
          entityType: outputArtifact?.entityType || outputArtifact?.target?.type || null,
          entityId: outputArtifact?.entityId || outputArtifact?.target?.id || null,
          toolCalls: Array.isArray(loopResult.toolExecutions) ? loopResult.toolExecutions.length : 0,
        }),
      );
    } catch (_) {
      // Debug logging only
    }

    return withStateOutput(
      {
        message: finalMessage,
        toolExecutions: loopResult.toolExecutions,
        stepCommentaries: loopResult.stepCommentaries,
        rounds: loopResult.rounds,
        outputArtifact,
        mutationOutcome,
        availableTools: exposedTools.map((tool) => ({
          name: tool.name,
          category: tool.category,
        })),
        resolutionMeta: {
          outputContract: contract,
          routedOutputType,
        },
      },
      nextState,
    );
  }
}

module.exports = {
  ChatOrchestrator,
  CHAT_STATES,
};
