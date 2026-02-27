"use strict";

const documentGenerationPreviewService = require("../../services/documentGeneration/documentGenerationPreview.service");
const operatorsService = require("../../services/operators.service");
const { ChatAgentService } = require("../chat/chat.agent.service");
const { resolveChatAmbiguity } = require("../chat/chat.ambiguity.resolver");
const { filterToolsForState } = require("../chat/chat.tool.exposure");
const { detectDraftIntent } = require("../intent.classifier");
const { toProposalArtifact } = require("../proposals/proposalArtifact");
const { CHAT_STATES, selectInitialState } = require("./chat.state.machine");
const { parseFinalOutputContract } = require("./output.contract");
const { parseJsonResponse } = require("../llm/llm.validation");
const {
  getChatOrchestratorState,
  updateChatOrchestratorState,
  clearPendingClarificationState,
} = require("./chat.session.state");
const { runChatToolLoop } = require("./chat.tool.loop");

function nowIso() {
  return new Date().toISOString();
}

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
    return {
      ...(context || {}),
      conversationId:
        context?.conversationId || context?.agentSessionId || sessionId || undefined,
      userId: context?.userId || userId || "default",
      tenantId: context?.tenantId || tenantId || null,
      requestMetadata:
        metadata && typeof metadata === "object" ? { ...metadata } : context?.requestMetadata,
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

  _createPreviewArtifactFromDocumentContract({
    contract,
    activeScope,
    requestContext,
    executionContext,
    structuredContext = null,
  }) {
    if (!activeScope?.entityType || !activeScope?.entityId) return null;
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
    const format =
      (typeof metadata.format === "string" && metadata.format.trim().toLowerCase()) ||
      "html";
    const templateKey =
      (typeof metadata.templateKey === "string" && metadata.templateKey.trim()) ||
      "llm.freeform.document";
    const schemaVersion =
      (typeof metadata.schemaVersion === "string" && metadata.schemaVersion.trim()) ||
      "v1";
    const previewHtml = `<div dir="${language === "ar" ? "rtl" : "ltr"}" style="white-space:pre-wrap;font-family:system-ui,sans-serif;">${escapeHtml(markdown)}</div>`;
    const plan = {
      target: { type: activeScope.entityType, id: Number(activeScope.entityId) },
      documentType,
      language,
      format,
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
    if (Number.isInteger(Number(requestContext?.dossierId)) && Number(requestContext.dossierId) > 0) {
      return { entityType: "dossier", entityId: Number(requestContext.dossierId) };
    }
    if (Number.isInteger(Number(requestContext?.clientId)) && Number(requestContext.clientId) > 0) {
      return { entityType: "client", entityId: Number(requestContext.clientId) };
    }
    return null;
  }

  async _safeReadTool(toolName, params, policy) {
    if (!this.engine || typeof this.engine._callReadTool !== "function") return null;
    try {
      const result = await this.engine._callReadTool(toolName, params, policy);
      return result && typeof result === "object" ? result : null;
    } catch (_) {
      return null;
    }
  }

  async _buildStructuredContextFromScope({ activeScope, policy }) {
    const context = {
      client: null,
      dossier: null,
      systemDate: new Date().toISOString().slice(0, 10),
      office: null,
    };

    try {
      const op = operatorsService.getCurrentOperator();
      context.office = {
        name: op?.name || null,
        title: op?.title || null,
        barNumber: op?.bar_number || op?.bar_id || null,
        officeName: op?.office_name || op?.office || null,
        officeAddress: op?.office_address || null,
        email: op?.email || null,
        phone: op?.phone || op?.mobile || null,
      };
    } catch (_) {
      context.office = null;
    }

    const type = String(activeScope?.entityType || "").toLowerCase();
    const id = Number(activeScope?.entityId || 0);
    if (!type || !Number.isInteger(id) || id <= 0) return context;

    if (type === "client") {
      const row = await this._safeReadTool("getClient", { clientId: id }, policy);
      const client = row?.client || null;
      if (client) {
        context.client = {
          id: Number(client.id) || id,
          fullName: client.name || null,
          name: client.name || null,
          email: client.email || null,
          phone: client.phone || client.alternate_phone || null,
          company: client.company || null,
        };
      }
      const dossiersResult = await this._safeReadTool("listDossiers", { clientId: id, limit: 10 }, policy);
      const dossiers = Array.isArray(dossiersResult?.dossiers) ? dossiersResult.dossiers : [];
      if (dossiers.length === 1) {
        const dossier = dossiers[0];
        context.dossier = {
          id: Number(dossier.id) || null,
          reference: dossier.reference || dossier.code || null,
          title: dossier.title || null,
          status: dossier.status || null,
          clientId: id,
        };
      }
      return context;
    }

    if (type === "dossier") {
      const row = await this._safeReadTool("getDossier", { dossierId: id }, policy);
      const dossier = row?.dossier || null;
      if (dossier) {
        context.dossier = {
          id: Number(dossier.id) || id,
          reference: dossier.reference || dossier.code || null,
          title: dossier.title || null,
          status: dossier.status || null,
          clientId: Number(dossier.client_id) || null,
        };
        if (Number(dossier.client_id) > 0) {
          const c = await this._safeReadTool("getClient", { clientId: Number(dossier.client_id) }, policy);
          const client = c?.client || null;
          if (client) {
            context.client = {
              id: Number(client.id) || Number(dossier.client_id),
              fullName: client.name || null,
              name: client.name || null,
              email: client.email || null,
              phone: client.phone || client.alternate_phone || null,
              company: client.company || null,
            };
          }
        }
      }
      return context;
    }

    return context;
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
    const meta = ambiguityResolution?.resolutionMeta || null;
    const metaType = String(meta?.entityType || "").toLowerCase();
    const metaId = Number(meta?.chosenId || 0);
    if (metaType && Number.isInteger(metaId) && metaId > 0) {
      return { entityType: metaType, entityId: metaId };
    }

    const resolvedScope =
      ambiguityResolution?.resolvedScope && typeof ambiguityResolution.resolvedScope === "object"
        ? ambiguityResolution.resolvedScope
        : null;
    if (!resolvedScope) return null;

    const scopeToType = {
      clientId: "client",
      dossierId: "dossier",
      lawsuitId: "lawsuit",
      taskId: "task",
      sessionId: "session",
      missionId: "mission",
      personalTaskId: "personal_task",
      financialEntryId: "financial_entry",
      notificationId: "notification",
      historyEventId: "history_event",
      officerId: "officer",
    };
    for (const [key, type] of Object.entries(scopeToType)) {
      const id = Number(resolvedScope?.[key] || 0);
      if (Number.isInteger(id) && id > 0) {
        return { entityType: type, entityId: id };
      }
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

    if (!requestContext.resolvedEntity) {
      requestContext.resolvedEntity = { type, id };
    }

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
    if (
      proposal &&
      proposal.proposalId &&
      proposal.requiresConfirmation === true &&
      typeof this.engine.storeProposal === "function"
    ) {
      this.engine.storeProposal(proposal, {
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
    const sessionState = getChatOrchestratorState(this.engine, requestContext);
    let state = selectInitialState({
      followUpIntent,
      sessionState,
      policy,
      requestContext,
    });

    const resolvedSelection = this.helper._extractResolvedSelection(followUpIntent);
    if (state === CHAT_STATES.CLARIFY) {
      const pendingClarification = sessionState.pendingClarification || null;
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
        state = pendingClarification?.resumeState || CHAT_STATES.RETRIEVE;
      } else if (pendingClarification?.artifact) {
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
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
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
    this._traceExecutionStep(requestContext, "entity_resolution_completed", {
      status: ambiguityResolution?.status || "skipped",
      entityType: ambiguityResolution?.resolutionMeta?.entityType || null,
      chosenId: ambiguityResolution?.resolutionMeta?.chosenId || null,
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
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
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
      const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
      const structuredContext = activeScope
        ? await this._buildStructuredContextFromScope({ activeScope, policy })
        : {
            client: null,
            dossier: null,
            systemDate: new Date().toISOString().slice(0, 10),
            office: null,
          };
      this._traceExecutionStep(requestContext, "document_tool_called", {
        toolName: "planGeneratedDocument",
        hasActiveScope: Boolean(activeScope),
      });
      const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
      const docToolResult = await this.engine.executeToolV2(
        "planGeneratedDocument",
        {
          ...(contract.title ? { title: contract.title } : {}),
          content: contract.content,
          metadata: {
            ...(contract.metadata || {}),
            structuredContext,
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
      if (activeScope) {
        const previewArtifact = this._createPreviewArtifactFromDocumentContract({
          contract: groundedContract,
          activeScope,
          requestContext,
          executionContext,
          structuredContext,
        });
        if (previewArtifact) {
          outputArtifact = previewArtifact;
          finalMessage =
            "I prepared a document preview. You can edit it and confirm to create a proposal for storing it in the selected record.";
          this._traceExecutionStep(requestContext, "artifact_preview_pipeline_triggered", {
            outputType: "document",
            artifactType: previewArtifact.type || null,
            entityType: activeScope.entityType,
            entityId: activeScope.entityId,
            previewSource: "planGeneratedDocument_grounded",
          });
        }
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
          executionContext,
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

      if (proposal?.proposalId && proposal.requiresConfirmation === true) {
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
