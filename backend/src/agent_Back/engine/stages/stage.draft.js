"use strict";

const { INTENTS } = require("../../intents");
const {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
} = require("../../utils/entityDisplay");

/**
 * Execute a DRAFT intent (deterministic draft generation).
 * Bypasses LLM intent classification — goal-first orchestration.
 *
 * Flow:
 *   1. Resolve entity hints (reuses _resolveEntity from context.js)
 *   2. If entity ambiguous → return clarification
 *   3. If draftType missing → return clarification asking which document type
 *   4. Derive entityType for genericDraft from resolved entity or context
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
  const {
    intent,
    draftType,
    entityHints = [],
  } = draftIntent;
  let effectiveDraftType = draftType;
  if (!effectiveDraftType) {
    const m = String(message || "").toLowerCase();
    const invitationSignal = /\b(hearing|session|demand)\b/.test(m) || m.includes("mise en demeure");
    const emailSignal = /\b(response|reply)\b/.test(m);
    const noteSignal = /\bnote\b/.test(m);
    const inferred = [
      invitationSignal ? "INVITATION" : null,
      emailSignal ? "CLIENT_EMAIL" : null,
      noteSignal ? "INTERNAL_NOTE" : null,
    ].filter(Boolean);
    if (new Set(inferred).size === 1) [effectiveDraftType] = inferred;
  }

  // ── Step 1: Resolve entity hints ──────────────────────────────────
  let resolvedEntity = null;
  let resolvedEntityType = null;

  // Check context for pre-bound entity (work snapshot or active entity)
  const contextEntityType = context?.activeEntity?.type
    || context?.scope
    || null;
  const contextEntityId = context?.activeEntity?.id
    || context?.dossierId
    || context?.clientId
    || context?.sessionId
    || null;

  if (entityHints.length > 0) {
    for (const hint of entityHints) {
      const hintsToTry = hint?.type === "name"
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

            const clarificationType = hintToResolve?.entityType
              || hintToResolve?.type
              || hint?.entityType
              || hint?.type
              || "record";
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
    const compatible = _isEntityTypeCompatible(contextEntityType, effectiveDraftType);
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

    const availableTypes = ["Invitation", "Client Email", "Hearing Summary", "Internal Note"];

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
  if (!resolvedEntity) {
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
        summary: `Which ${_draftEntityLabel(effectiveDraftType)} should this ${_draftTypeLabel(effectiveDraftType)} be for?`,
        details: [
          "Please specify a client name, dossier reference, or session.",
        ],
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

  // ── Step 4: Derive tool params ────────────────────────────────────
  const entityType = _mapToToolEntityType(resolvedEntityType);
  const entityId = resolvedEntity.id;
  const purpose = _derivePurpose(message, effectiveDraftType);

  const toolParams = {
    entityType,
    entityId,
    draftType: effectiveDraftType,
    purpose,
    audience: _deriveAudience(effectiveDraftType),
    tone: "formal",
    language: "fr",
  };

  // ── Step 5: Execute genericDraft tool via registry ────────────────
  this.ledger.record({
    type: "draft_tool_invocation",
    toolName: "genericDraft",
    draftType: effectiveDraftType,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
  });

  try {
    const v2Result = await this.executeToolV2("genericDraft", toolParams, policy, {
      confirmed: true,
      planId: null,
      stepIndex: 0,
    });

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

function _mapToToolEntityType(resolvedType) {
  const map = {
    client: "client",
    dossier: "dossier",
    session: "session",
    task: "task",
    lawsuit: "dossier",
    mission: "dossier",
  };
  return map[resolvedType] || "dossier";
}

function _deriveAudience(draftType) {
  if (draftType === "CLIENT_EMAIL") return "client";
  if (draftType === "INVITATION") return "client";
  if (draftType === "INTERNAL_NOTE") return "internal";
  if (draftType === "HEARING_SUMMARY") return "internal";
  return "client";
}

function _derivePurpose(message, draftType) {
  // Extract purpose from common intent phrases with bounded capture length.
  const purposePatterns = [
    /(?:about|regarding|concerning|au sujet de)\s+(.{5,60}?)(?:[.!?]|$)/i,
    /(?:requesting|afin de)\s+(.{5,60}?)(?:[.!?]|$)/i,
    /\bto\s+(.{5,60}?)(?:[.!?]|$)/i,
    /\b(?:for|pour)\s+(.{5,60}?)(?:[.!?]|$)/i,
  ];
  for (const pattern of purposePatterns) {
    const purposeMatch = String(message || "").match(pattern);
    if (purposeMatch) return purposeMatch[1].trim();
  }

  // Default purpose by draft type
  if (draftType === "INVITATION") return "session invitation";
  if (draftType === "CLIENT_EMAIL") return "client communication";
  if (draftType === "HEARING_SUMMARY") return "hearing summary";
  if (draftType === "INTERNAL_NOTE") return "internal documentation";
  return "general correspondence";
}

function _draftTypeLabel(draftType) {
  if (draftType === "INVITATION") return "invitation";
  if (draftType === "CLIENT_EMAIL") return "email";
  if (draftType === "HEARING_SUMMARY") return "hearing summary";
  if (draftType === "INTERNAL_NOTE") return "note";
  return "draft";
}

function _draftEntityLabel(draftType) {
  if (draftType === "CLIENT_EMAIL") return "client";
  if (draftType === "INVITATION") return "session or dossier";
  if (draftType === "HEARING_SUMMARY") return "session";
  if (draftType === "INTERNAL_NOTE") return "dossier or client";
  return "entity";
}

module.exports = {
  _executeDraftIntent,
};
