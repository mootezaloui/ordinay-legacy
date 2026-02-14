"use strict";

const { INTENTS } = require("../../intents");
const {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
} = require("../../utils/entityDisplay");
const {
  getContextSuggestions,
  formatSuggestionResponse,
} = require("./stage.contextSuggest");
const { buildDraftContext } = require("../draft.context.builder");

/**
 * Execute a DRAFT intent (deterministic draft generation).
 * Bypasses LLM intent classification — goal-first orchestration.
 *
 * Flow:
 *   1. Resolve entity hints (reuses _resolveEntity from context.js)
 *   2. If entity ambiguous → return clarification
 *   3. If draftType missing → return clarification asking which document type
 *   4. Build unified draft context
 *   5. Call genericDraft tool via executeToolV2 (firewall runs automatically)
 *   6. Validate output against draft schema
 *   7. Return standard response shape
 *
 * @param {Object} draftIntent - Detected DRAFT intent from detectDraftIntent()
 * @param {string} message - Original user message
 * @param {Object} context - Request context
 * @param {Object} policy - Current agent policy
 * @param {Object} engineContext - Engine context
 * @returns {Promise<Object>} Draft response
 * @private
 */
async function _executeDraftIntent(
  draftIntent,
  message,
  context,
  policy,
  engineContext,
) {
  const { intent, draftType, entityHints = [] } = draftIntent;
  const contextEntityType =
    context?.activeEntity?.type || context?.scope || null;
  const contextEntityId =
    context?.activeEntity?.id ||
    context?.dossierId ||
    context?.clientId ||
    context?.sessionId ||
    null;

  let effectiveDraftType = draftType || null;
  if (!effectiveDraftType) {
    return _buildDraftTypeSelectionResponse(
      intent,
      policy,
      message,
      null, // No silent inference - always prompt user
    );
  }

  // ── Step 1: Resolve entity hints ──────────────────────────────────
  let resolvedEntity = null;
  let resolvedEntityType = null;

  // Check context for pre-bound entity (work snapshot or active entity)
  // ── Extract resolved entity from context suggestion resolution ──
  if (context?._resolvedFromSuggestion && context?.resolvedEntity) {
    resolvedEntityType = context.resolvedEntity.type;
    const entityId = Number(context.resolvedEntity.id);

    console.log(
      `[Draft] Fetching resolved entity: ${resolvedEntityType}#${entityId}`,
    );

    // Fetch the actual entity data using the resolved ID
    try {
      const toolName = `get${resolvedEntityType.charAt(0).toUpperCase() + resolvedEntityType.slice(1)}`;
      const entityResult = await this._callReadTool(
        toolName,
        { [`${resolvedEntityType}Id`]: entityId },
        policy,
      );

      console.log(`[Draft] Entity fetch result:`, entityResult);

      if (entityResult?.[resolvedEntityType]) {
        resolvedEntity = entityResult[resolvedEntityType];
        console.log(
          `[Draft] Entity resolved successfully:`,
          resolvedEntity?.id,
        );
      }
    } catch (err) {
      console.error(
        `[Draft] Failed to fetch resolved entity ${resolvedEntityType}#${entityId}:`,
        err.message,
      );
    }

    // If entity fetch failed, return error
    if (!resolvedEntity) {
      return {
        intent,
        agentVersion: policy.version,
        reasoner: "draft-gate",
        output: {
          type: "error",
          message: `Could not find ${resolvedEntityType} with ID ${entityId}. The ${resolvedEntityType} may have been deleted or you may not have permission to access it.`,
          timestamp: new Date().toISOString(),
        },
        needsClarification: false,
        isDraftIntent: true,
      };
    }
  }

  if (entityHints.length > 0) {
    for (const hint of entityHints) {
      const hintsToTry =
        hint?.type === "name"
          ? [
              { type: "client", nameHint: hint.value },
              { type: "dossier", nameHint: hint.value },
              { type: "session", nameHint: hint.value },
            ]
          : [hint];

      for (const hintToResolve of hintsToTry) {
        try {
          const resolution = await this._resolveEntity(hintToResolve, policy);
          if (resolution.resolved) {
            resolvedEntity = resolution.entity;
            resolvedEntityType = resolution.type;
            break;
          }

          // Ambiguous → return clarification
          if (resolution.reason === "ambiguous") {
            this.ledger.record({
              type: "draft_clarification_required",
              reason: "ambiguous_entity",
              candidates: resolution.candidates,
              timestamp: new Date().toISOString(),
            });

            const clarificationType =
              hintToResolve?.entityType ||
              hintToResolve?.type ||
              hint?.entityType ||
              hint?.type ||
              "record";
            const candidateDetails = Array.isArray(resolution.candidates)
              ? resolution.candidates.map((c) =>
                  resolveEntityDisplayLabel(clarificationType, c, {
                    fallback: formatEntityTypeLabel(clarificationType),
                  }),
                )
              : [];

            return {
              intent,
              agentVersion: policy.version,
              reasoner: "draft-gate",
              output: {
                type: "explanation",
                entityId: "pending_clarification",
                entityType: "query",
                summary: resolution.message,
                details: candidateDetails,
                timestamp: new Date().toISOString(),
                confidence: 0,
                sources: [
                  {
                    sourceType: "context",
                    reference: "entity_resolution",
                    note: "Awaiting user clarification for draft",
                  },
                ],
                status: "pending_clarification",
                source: "draft-gate",
                requires_validation: false,
              },
              needsClarification: true,
              isDraftIntent: true,
            };
          }

          // Not found → continue to next adapted hint or next original hint
        } catch (err) {
          this.ledger.record({
            type: "draft_entity_resolution_error",
            hint: hintToResolve,
            error: err.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (resolvedEntity) break;
    }
  }

  // Fall back to context-bound entity if no hint resolved
  // Only accept context entity if its type is compatible with the requested draft type
  if (!resolvedEntity && contextEntityId && contextEntityType) {
    const compatible = _isEntityTypeCompatible(
      contextEntityType,
      effectiveDraftType,
    );
    if (compatible) {
      resolvedEntityType = contextEntityType;
      resolvedEntity = { id: contextEntityId };
    }
  }

  // ── Step 2: Clarification if draft type is missing ────────────────
  if (!effectiveDraftType) {
    this.ledger.record({
      type: "draft_clarification_required",
      reason: "missing_draft_type",
      timestamp: new Date().toISOString(),
    });

    const availableTypes = [
      "Invitation",
      "Client Email",
      "Hearing Summary",
      "Internal Note",
    ];

    return {
      intent,
      agentVersion: policy.version,
      reasoner: "draft-gate",
      output: {
        type: "explanation",
        entityId: "pending_clarification",
        entityType: "query",
        summary: "What type of document would you like me to draft?",
        details: availableTypes.map((t) => `• ${t}`),
        timestamp: new Date().toISOString(),
        confidence: 0,
        sources: [
          {
            sourceType: "context",
            reference: "draft_type_resolution",
            note: "Awaiting draft type selection",
          },
        ],
        status: "pending_clarification",
        source: "draft-gate",
        requires_validation: false,
      },
      needsClarification: true,
      isDraftIntent: true,
    };
  }

  // ── Step 3: Clarification if no entity resolved ───────────────────
  // Skip context suggestion if entity was just resolved from a previous suggestion
  if (!resolvedEntity && !context._resolvedFromSuggestion) {
    const missingEntities = hasHearingSignal
      ? ["session"]
      : _draftMissingEntities(effectiveDraftType);
    const primaryMissingEntity =
      missingEntities[0] || _draftEntityLabel(effectiveDraftType);
    const suggestions = await getContextSuggestions.call(
      this,
      intent,
      missingEntities,
      {
        userMessage: message,
        requestContext: context,
        policy,
      },
    );

    if (Array.isArray(suggestions) && suggestions.length > 0) {
      const suggestionEntityType = String(
        suggestions[0]?.entityType || primaryMissingEntity || "entity",
      ).toLowerCase();

      this.ledger.record({
        type: "draft_context_suggestions",
        reason: "missing_entity",
        draftType: effectiveDraftType,
        entityType: suggestionEntityType,
        suggestionCount: suggestions.length,
        timestamp: new Date().toISOString(),
      });

      // Helper to build scope object from entityType/entityId
      const buildScope = (entityType, entityId) => {
        const scope = {};
        if (entityType === "client") scope.clientId = Number(entityId);
        else if (entityType === "dossier") scope.dossierId = Number(entityId);
        else if (entityType === "lawsuit") scope.lawsuitId = Number(entityId);
        else if (entityType === "session") scope.sessionId = Number(entityId);
        else if (entityType === "task") scope.taskId = Number(entityId);
        return scope;
      };

      // Helper to extract metadata from signal string
      const parseSignalMetadata = (signal, extraMetadata) => {
        const metadata = {};
        if (signal) {
          const parts = String(signal)
            .split(",")
            .map((s) => s.trim());
          for (const part of parts) {
            const match = part.match(/^(\d+)\s+(.+?)(?:\(s\))?$/i);
            if (match) {
              const count = parseInt(match[1], 10);
              const label = match[2].trim().replace(/\s+/g, "_").toLowerCase();
              metadata[label] = count;
            }
          }
        }
        if (extraMetadata && typeof extraMetadata === "object") {
          return { ...metadata, ...extraMetadata };
        }
        return metadata;
      };

      console.log("[DEBUG] Creating context_suggestion with:", {
        intent,
        effectiveDraftType,
        message,
      });

      return {
        intent,
        agentVersion: policy.version,
        reasoner: "draft-gate",
        output: {
          type: "context_suggestion",
          message: `I found ${suggestions.length} ${suggestionEntityType}${suggestions.length === 1 ? "" : "s"} that might match your request:`,
          entityType: suggestionEntityType,
          capability: "DRAFT",
          reason: "missing_context",

          // Preserve original execution context
          originalIntent: intent,
          originalDraftType: effectiveDraftType,
          originalMessage: message,

          suggestions: suggestions.map((item) => ({
            id: `${item.entityType}-${item.entityId}`,
            entityType: item.entityType,
            entityId: item.entityId,
            label: item.label,
            subtitle: null,
            metadata: parseSignalMetadata(item.signal, item.metadata),

            // Resolution intent, not READ
            intent: "RESOLVE_CONTEXT_AND_CONTINUE",
            scope: buildScope(item.entityType, item.entityId),

            // Embedded resolution context
            resolveContext: {
              originalIntent: intent,
              originalDraftType: effectiveDraftType,
            },
          })),
          timestamp: new Date().toISOString(),
          confidence: 0.6,
          source: "draft-gate",

          // Manual override capability
          allowManualInput: true,
          manualInputHint: `If the correct ${suggestionEntityType} is not listed, you can type the name manually.`,
        },
        needsClarification: true,
        isDraftIntent: true,
      };
    }

    this.ledger.record({
      type: "draft_clarification_required",
      reason: "missing_entity",
      draftType: effectiveDraftType,
      timestamp: new Date().toISOString(),
    });

    return {
      intent,
      agentVersion: policy.version,
      reasoner: "draft-gate",
      output: {
        type: "explanation",
        entityId: "pending_clarification",
        entityType: "query",
        summary: `Which ${primaryMissingEntity} should this be for?`,
        details: [],
        timestamp: new Date().toISOString(),
        confidence: 0,
        sources: [
          {
            sourceType: "context",
            reference: "draft_entity_resolution",
            note: "Awaiting entity specification for draft",
          },
        ],
        status: "pending_clarification",
        source: "draft-gate",
        requires_validation: false,
      },
      needsClarification: true,
      isDraftIntent: true,
    };
  }

  const draftContextResult = await buildDraftContext.call(this, {
    entityType: resolvedEntityType,
    entityId: resolvedEntity.id,
    draftType: effectiveDraftType,
    originalMessage: message,
    policy,
  });

  if (!draftContextResult || draftContextResult.isComplete === false) {
    const ambiguities = Array.isArray(draftContextResult?.ambiguities)
      ? draftContextResult.ambiguities
      : [];
    const invoiceAmbiguity = ambiguities.find(
      (item) => item?.type === "invoice_selection",
    );

    if (invoiceAmbiguity && Array.isArray(invoiceAmbiguity.options)) {
      const clientId = draftContextResult?.context?.client?.id || null;
      return {
        intent,
        agentVersion: policy.version,
        reasoner: "draft-gate",
        output: {
          type: "context_suggestion",
          category: "invoice_selection",
          message:
            invoiceAmbiguity.message || "Which invoice should I reference?",
          entityType: "financial_entry",
          reason: "multiple_matches",
          originalIntent: intent,
          originalDraftType: effectiveDraftType,
          originalMessage: message,
          capability: "DRAFT",
          suggestions: invoiceAmbiguity.options.map((option) => ({
            id: `invoice-${option.invoiceId}`,
            entityType: "financial_entry",
            entityId: option.invoiceId,
            label: option.label || `Invoice #${option.invoiceId}`,
            subtitle: option.dueDate || null,
            metadata: {
              amount: option.amount ?? null,
              currency: option.currency || null,
              dueDate: option.dueDate || null,
              daysLate: option.daysLate ?? null,
              ...(clientId ? { clientId } : {}),
            },
            intent: "RESOLVE_CONTEXT_AND_CONTINUE",
            scope: {
              ...(clientId ? { clientId } : {}),
              financialEntryId: Number(option.invoiceId),
            },
            resolveContext: {
              originalIntent: intent,
              originalDraftType: effectiveDraftType,
            },
          })),
          timestamp: new Date().toISOString(),
          confidence: 0.6,
          source: "draft-gate",
          allowManualInput: false,
        },
        needsClarification: true,
        isDraftIntent: true,
      };
    }

    return {
      intent,
      agentVersion: policy.version,
      reasoner: "draft-gate",
      output: {
        type: "context_suggestion",
        category: "draft_ambiguity",
        originalIntent: intent,
        originalDraftType: effectiveDraftType,
        originalMessage: message,
        capability: "DRAFT",
        entityType: resolvedEntityType,
        entityId: resolvedEntity.id,
        ambiguities: ambiguities,
        timestamp: new Date().toISOString(),
        confidence: 0.6,
        source: "draft-gate",
        allowManualInput: false,
      },
      needsClarification: true,
      isDraftIntent: true,
    };
  }

  const toolParams = {
    draftType: effectiveDraftType,
    context: draftContextResult.context,
  };

  // ── Step 5: Execute genericDraft tool via registry ────────────────
  this.ledger.record({
    type: "draft_tool_invocation",
    toolName: "genericDraft",
    draftType: effectiveDraftType,
    entityType: draftContextResult.context?.entityType || resolvedEntityType,
    entityId: draftContextResult.context?.entityId || resolvedEntity.id,
    timestamp: new Date().toISOString(),
  });

  console.log(`[Draft] Calling genericDraft tool...`);

  try {
    const v2Result = await this.executeToolV2(
      "genericDraft",
      toolParams,
      policy,
      {
        confirmed: true,
        planId: null,
        stepIndex: 0,
      },
    );

    console.log(`[Draft] genericDraft returned:`, v2Result);

    const draftOutput = v2Result.result;

    // ── Step 6: Validate against draft schema ─────────────────────
    this._validateContract("draft", draftOutput, { intent });

    // ── Step 7: Return standard response ──────────────────────────
    return {
      intent,
      agentVersion: policy.version,
      reasoner: "draft-gate",
      output: draftOutput,
      isDraftIntent: true,
    };
  } catch (err) {
    console.error(`[Draft] Error during draft generation:`, err);
    this.ledger.record({
      type: "draft_intent_error",
      intent,
      draftType: effectiveDraftType,
      error: err.message,
      timestamp: new Date().toISOString(),
    });

    return {
      intent,
      agentVersion: policy.version,
      reasoner: "draft-gate",
      output: {
        type: "explanation",
        entityId: "draft_error",
        entityType: "query",
        summary: `Unable to generate draft: ${err.message}`,
        details: [
          "The draft could not be generated.",
          "Please try again or rephrase your request.",
        ],
        timestamp: new Date().toISOString(),
        confidence: 0,
        sources: [{ sourceType: "system", reference: "draft-gate" }],
        status: "error",
        source: "draft-gate",
        requires_validation: false,
      },
      isDraftIntent: true,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

const DRAFT_ENTITY_COMPAT = {
  INVITATION: ["session", "dossier", "lawsuit"],
  CLIENT_EMAIL: ["client", "dossier"],
  HEARING_SUMMARY: ["session"],
  INTERNAL_NOTE: ["dossier", "client", "task"],
};

function _isEntityTypeCompatible(entityType, draftType) {
  if (!draftType) return true;
  const allowed = DRAFT_ENTITY_COMPAT[draftType];
  if (!allowed) return true;
  return allowed.includes(entityType);
}

function _draftEntityLabel(draftType) {
  if (draftType === "CLIENT_EMAIL") return "client";
  if (draftType === "INVITATION") return "session or dossier";
  if (draftType === "HEARING_SUMMARY") return "session";
  if (draftType === "INTERNAL_NOTE") return "dossier or client";
  return "entity";
}

function _draftMissingEntities(draftType) {
  if (draftType === "CLIENT_EMAIL") return ["client"];
  if (draftType === "INVITATION") return ["session", "dossier"];
  if (draftType === "HEARING_SUMMARY") return ["session"];
  if (draftType === "INTERNAL_NOTE") return ["dossier", "client"];
  return ["entity"];
}

function _buildDraftTypeSelectionResponse(
  intent,
  policy,
  message,
  draftTypeResolution,
) {
  const options = Array.isArray(draftTypeResolution?.options)
    ? draftTypeResolution.options
    : [];
  const suggestions = options.map((option) => ({
    id: String(option),
    entityType: "draft_type",
    entityId: String(option),
    label: String(option),
    subtitle: null,
    metadata: {},
    intent: "RESOLVE_DRAFT_TYPE",
    scope: {},
    resolveContext: {
      originalIntent: intent,
      originalDraftType: null,
    },
  }));
  return {
    intent,
    agentVersion: policy.version,
    reasoner: "draft-gate",
    output: {
      type: "draft_type_selection",
      message: "Please choose the type of draft you want to generate:",
      entityType: "draft_type",
      reason: "ambiguous_query",
      originalIntent: intent,
      originalDraftType: null,
      originalMessage: message,
      suggestions,
      timestamp: new Date().toISOString(),
      source: "rule-based",
    },
    needsClarification: true,
    isDraftIntent: true,
  };
}

module.exports = {
  _executeDraftIntent,
};
