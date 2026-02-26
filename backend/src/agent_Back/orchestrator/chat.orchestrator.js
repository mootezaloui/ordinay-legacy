"use strict";

const documentGenerationPreviewService = require("../../services/documentGeneration/documentGenerationPreview.service");
const { ChatAgentService } = require("../chat/chat.agent.service");
const { resolveChatAmbiguity } = require("../chat/chat.ambiguity.resolver");
const { filterToolsForState } = require("../chat/chat.tool.exposure");
const { detectDraftIntent } = require("../intent.classifier");
const { toProposalArtifact } = require("../proposals/proposalArtifact");
const { CHAT_STATES, selectInitialState } = require("./chat.state.machine");
const { parseFinalOutputContract } = require("./output.contract");
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
    }

    const ambiguityResolution = await resolveChatAmbiguity({
      engine: this.engine,
      message: effectiveUserMessage,
      policy,
      executionContext,
      exposedTools: [],
    });
    if (ambiguityResolution?.status === "resolved" && ambiguityResolution?.resolvedScope) {
      Object.assign(requestContext, ambiguityResolution.resolvedScope);
      Object.assign(executionContext, ambiguityResolution.resolvedScope);
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
    this.engine?.ledger?.record?.({
      type: "chat_output_contract_parsed",
      sourceRoute: "/agent/chat",
      outputType: contract.outputType,
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

    if (contract.outputType === "message" || contract.outputType === "research") {
      finalMessage = this.helper._enforceExecutionLockedNoAdvisoryFallback({
        finalMessage: contract.content,
        requestContext,
      });
      routeAction = contract.outputType === "research" ? "research_message" : "message";
      if (contract.outputType === "research" && contract.metadata && Object.keys(contract.metadata).length > 0) {
        outputArtifact = {
          type: "research_contract",
          title: contract.title || null,
          content: contract.content,
          metadata: contract.metadata,
        };
      }
    } else if (contract.outputType === "document") {
      routeAction = "document_tool";
      const activeScope = this._resolveActiveEntityScope(requestContext, llmHistory);
      if (activeScope) {
        const previewArtifact = this._createPreviewArtifactFromDocumentContract({
          contract,
          activeScope,
          requestContext,
          executionContext,
        });
        if (previewArtifact) {
          outputArtifact = previewArtifact;
          finalMessage =
            "I prepared a document preview. You can edit it and confirm to create a proposal for storing it in the selected record.";
        }
      }
      if (!outputArtifact) {
        const executionPolicy = this._resolveOutputContractExecutionPolicy(policy);
        const docToolResult = await this.engine.executeToolV2(
          "planGeneratedDocument",
          {
            ...(contract.title ? { title: contract.title } : {}),
            content: contract.content,
            metadata: contract.metadata || {},
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
        outputArtifact = {
          ...draftArtifactBase,
          ...(activeScope ? activeScope : {}),
        };
        finalMessage = contract.content;
      }
    } else if (contract.outputType === "mutation") {
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
          outputType: contract.outputType,
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
      outputType: contract.outputType,
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
          outputType: contract.outputType,
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
