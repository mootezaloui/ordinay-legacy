"use strict";

function normalizeText(value) {
  return String(value || "").trim();
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function isQuestionLike(message) {
  const text = normalizeText(message);
  if (!text) return false;
  if (/[?]$/.test(text)) return true;
  return /\b(what should i do|what if|can i|could i|should i|how do i)\b/i.test(text);
}

function isStrongMutationIntent(message) {
  const text = lower(message);
  if (!text) return false;
  if (isQuestionLike(text)) return false;

  const strongPatterns = [
    /\bnot\s+my\s+client\s+anymore\b/,
    /\bno\s+longer\s+my\s+client\b/,
    /\bis\s+not\s+mine\s+anymore\b/,
    /\bremove\s+from\s+my\s+portfolio\b/,
    /\btransfer\b/,
    /\bdeactivate\b/,
    /\bmake\s+inactive\b/,
    /\bdelete\b/,
    /\bcancel\b/,
    /\bclose\b/,
    /\bmark\s+.+\s+as\s+/,
    /\b(?:isn['’]?t|is\s+not)\s+mine\b/,
    /\bownership\b.*\b(remove|transfer|change)\b/,
  ];
  return strongPatterns.some((pattern) => pattern.test(text));
}

function isWeakMutationIntent(message) {
  const text = lower(message);
  if (!text) return false;
  if (isQuestionLike(text)) return false;
  if (isStrongMutationIntent(text)) return true;
  return /\b(update|change|set|move|reschedule|rename|edit|modify|mark)\b/.test(text);
}

function hasResolvedEntity(mutationIntent) {
  return (
    mutationIntent &&
    Number.isInteger(Number(mutationIntent.entityId)) &&
    Number(mutationIntent.entityId) > 0
  );
}

function isEntityClarification(mutationIntent) {
  if (!mutationIntent) return false;
  if (String(mutationIntent.routeDecision || "").toLowerCase() !== "clarify") return false;
  const reason = String(mutationIntent.reasonCode || "").toLowerCase();
  if (reason.includes("entity_resolution")) return true;
  const missing = Array.isArray(mutationIntent.missing) ? mutationIntent.missing : [];
  return missing.includes("entityId");
}

function isConfirmationResumeMessage(message) {
  const text = lower(message);
  if (!text) return false;
  if (/^(yes|yeah|yep|ok|okay|confirm|proceed|go ahead|apply|do it)\b/.test(text)) return true;
  return /\b(can you do it|can you apply|please do it|please apply|do it please)\b/.test(text);
}

function _cleanName(value) {
  return String(value || "")
    .replace(/^[\s"'“”‘’`.,:;!?-]+|[\s"'“”‘’`.,:;!?-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function _extractClientNameForOwnershipLoss(message) {
  const text = normalizeText(message);
  if (!text) return null;
  const patterns = [
    /^(?:client\s+)?(.+?)\s+(?:is\s+not\s+my\s+client\s+anymore|isn['’]t\s+my\s+client\s+anymore|not\s+my\s+client\s+anymore|no\s+longer\s+my\s+client)\b/i,
    /^(?:client\s+)?(.+?)\s+(?:is\s+not\s+mine\s+anymore|isn['’]t\s+mine\s+anymore|no\s+longer\s+mine)\b/i,
    /^(?:i\s+have\s+transferr?ed|i\s+transferr?ed)\s+(?:the\s+)?client\s+(.+?)\s+to\b/i,
    /^(?:je\s+viens\s+de\s+perdre|j['’]ai\s+perdu)\s+(?:mon|ma)\s+client\s+(.+?)$/i,
    /^(?:client\s+)?(.+?)\s+(?:is\s+dead|passed\s+away|deceased)\b/i,
    /^(?:mon|ma)\s+client\s+(.+?)\s+(?:est\s+mort|d[eé]c[eé]d[eé])\b/i,
    /^(?:لقد\s+)?(?:فقدت|خسرت)\s+(?:موكلي|العميل)\s+(.+)$/u,
    /^(?:العميل|موكلي)\s+(.+?)\s+(?:لم\s+يعد\s+لي|ليس\s+لي\s+بعد\s+الآن)/u,
    /^(?:نقلت|حوّلت|حولت)\s+(?:العميل|موكلي)\s+(.+?)\s+إلى/u,
    /^(?:العميل|موكلي)\s+(.+?)\s+(?:توفي|متوفي|ميت)/u,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = _cleanName(match?.[1] || "");
    if (candidate) return candidate;
  }
  return null;
}

function normalizeMutationSemantics(message) {
  const text = normalizeText(message);
  const lowered = lower(message);
  const result = {
    sourceMessage: text,
    languageHint: /[\u0600-\u06FF]/u.test(text)
      ? "ar"
      : /\b(je|j['’]ai|mon client|ma cliente|perdu)\b/i.test(text)
        ? "fr"
        : "en",
    strongMutationIntent: false,
    weakMutationIntent: false,
    operationFamily: "NONE",
    capabilityRoute: "advisory",
    canonicalMessage: null,
    entityTypeHint: null,
    normalizedPayloadHint: null,
    normalizedIntentLabel: null,
  };

  if (!text || isQuestionLike(text)) {
    return { ...result, weakMutationIntent: false };
  }

  const clientName = _extractClientNameForOwnershipLoss(text);
  const ownershipLossPatterns = [
    /\bnot\s+my\s+client\s+anymore\b/i,
    /\bno\s+longer\s+my\s+client\b/i,
    /\bclient\b.*\b(?:is\s+not\s+mine\s+anymore|no\s+longer\s+mine)\b/i,
    /\b(?:i\s+have\s+transferr?ed|i\s+transferr?ed)\b.*\bclient\b/i,
    /\b(?:je\s+viens\s+de\s+perdre|j['’]ai\s+perdu)\b.*\bclient\b/i,
    /(?:فقدت|خسرت).*(?:موكلي|العميل)/u,
    /(?:لم\s+يعد\s+موكلي|موكلي\s+لم\s+يعد)/u,
    /(?:نقلت|حوّلت|حولت).*(?:موكلي|العميل)/u,
  ];
  const deathPatterns = [
    /\bclient\b.+\b(is\s+dead|passed\s+away|deceased)\b/i,
    /(?:موكلي|العميل).*(?:توفي|متوفي|ميت)/u,
    /\b(?:mon|ma)\s+client\b.+\b(?:est\s+mort|d[eé]c[eé]d[eé])\b/i,
  ];
  const transferPatterns = [
    /\btransfer(?:r?ed|ring)?\b.*\bclient\b.*\bto\b/i,
    /(?:نقلت|حوّلت|حولت).*(?:العميل|موكلي).*إلى/u,
    /\btransf[eé]r[eé]\b.*\bclient\b/i,
  ];

  const ownershipLoss = ownershipLossPatterns.some((p) => p.test(text));
  const deathLoss = deathPatterns.some((p) => p.test(text));
  const transfer = transferPatterns.some((p) => p.test(text));

  if (ownershipLoss || deathLoss || transfer) {
    const canonicalName = clientName || "this client";
    return {
      ...result,
      strongMutationIntent: true,
      weakMutationIntent: true,
      operationFamily: transfer ? "OWNERSHIP_LOSS" : deathLoss ? "CLIENT_DEATH_STATUS_CHANGE" : "OWNERSHIP_LOSS",
      capabilityRoute: "single_field_status_inactive",
      entityTypeHint: "client",
      normalizedPayloadHint: { field: "status", value: "inactive" },
      normalizedIntentLabel: transfer
        ? "client ownership transfer / portfolio removal"
        : deathLoss
          ? "client no longer active (death)"
          : "client ownership loss",
      canonicalMessage:
        canonicalName === "this client"
          ? "this client is not my client anymore"
          : `${canonicalName} is not my client anymore`,
    };
  }

  if (isStrongMutationIntent(text)) {
    return {
      ...result,
      strongMutationIntent: true,
      weakMutationIntent: true,
      operationFamily: lowered.includes("close") ? "STATUS_CLOSE" : "GENERIC_MUTATION",
      capabilityRoute: "single_field_or_detector",
    };
  }

  if (isWeakMutationIntent(text)) {
    return {
      ...result,
      weakMutationIntent: true,
      operationFamily: "GENERIC_MUTATION",
      capabilityRoute: "single_field_or_detector",
    };
  }

  return result;
}

function classifyCapabilitySupport({ semantic = null, mutationIntent = null } = {}) {
  const routeDecision = String(mutationIntent?.routeDecision || "").toLowerCase();
  const reasonCode = String(mutationIntent?.reasonCode || "").toLowerCase();

  if (semantic?.capabilityRoute === "single_field_status_inactive") {
    return { support: "single_field", route: "force_single_field" };
  }
  if (semantic?.operationFamily === "OWNERSHIP_TRANSFER") {
    return { support: "workflow", route: "workflow_required" };
  }
  if (routeDecision === "orchestrate") {
    return { support: "single_field", route: "detector_orchestrate" };
  }
  if (reasonCode === "operation_not_supported") {
    return { support: "workflow", route: "workflow_or_clarify" };
  }
  return { support: "unknown", route: "detector_default" };
}

function decideMutationMode({
  message,
  mutationIntent = null,
  candidateMutation = null,
  semantic = null,
} = {}) {
  const semanticNormalized = semantic || normalizeMutationSemantics(message);
  const strongMutationIntent = semanticNormalized.strongMutationIntent === true;
  const weakMutationIntent =
    !strongMutationIntent && (semanticNormalized.weakMutationIntent === true || isWeakMutationIntent(message));
  const entityResolved = hasResolvedEntity(mutationIntent);
  const capability = classifyCapabilitySupport({ semantic: semanticNormalized, mutationIntent });

  if (
    candidateMutation &&
    candidateMutation.detectorResult &&
    isConfirmationResumeMessage(message)
  ) {
    return {
      decision: "FORCE_MUTATION_PROPOSAL",
      mode: "execution",
      reason: "resume_candidate_mutation",
      strongMutationIntent: true,
      weakMutationIntent: false,
      entityResolved: true,
      resumeCandidateMutation: true,
      capability,
      semantic: semanticNormalized,
    };
  }

  if (strongMutationIntent) {
    if (entityResolved) {
      return {
        decision: "FORCE_MUTATION_PROPOSAL",
        mode: "execution",
        reason: "strong_mutation_resolved_entity",
        strongMutationIntent,
        weakMutationIntent: false,
        entityResolved,
        capability,
        semantic: semanticNormalized,
      };
    }
    return {
      decision: "CLARIFY_ENTITY",
      mode: "clarification",
      reason: "strong_mutation_unresolved_entity",
      strongMutationIntent,
      weakMutationIntent: false,
      entityResolved,
      capability,
      semantic: semanticNormalized,
    };
  }

  if (weakMutationIntent) {
    if (entityResolved) {
      return {
        decision: "MUTATION_CONFIRMATION_FLOW",
        mode: "execution",
        reason: "weak_mutation_resolved_entity",
        strongMutationIntent: false,
        weakMutationIntent,
        entityResolved,
        capability,
        semantic: semanticNormalized,
      };
    }
    return {
      decision: "CLARIFY_ENTITY",
      mode: "clarification",
      reason: "weak_mutation_unresolved_entity",
      strongMutationIntent: false,
      weakMutationIntent,
      entityResolved,
      capability,
      semantic: semanticNormalized,
    };
  }

  if (entityResolved) {
    return {
      decision: "INFORMATIONAL_ENTITY_RESPONSE",
      mode: "informational",
      reason: "no_mutation_entity_resolved",
      strongMutationIntent: false,
      weakMutationIntent: false,
      entityResolved,
      capability,
      semantic: semanticNormalized,
    };
  }

  return {
    decision: "ADVISORY_RESPONSE",
    mode: "informational",
    reason: "no_mutation_no_entity",
    strongMutationIntent: false,
    weakMutationIntent: false,
    entityResolved: false,
    capability,
    semantic: semanticNormalized,
  };
}

function resolveEntity({ resolveById, resolveFromContext, resolveByName } = {}) {
  return async function resolveEntityInner(input = {}) {
    const explicit = typeof resolveById === "function" ? await resolveById(input) : null;
    if (explicit && explicit.kind === "one") return { ...explicit, source: "explicit_id" };

    const contextResolved =
      typeof resolveFromContext === "function" ? await resolveFromContext(input) : null;
    if (contextResolved && contextResolved.kind === "one") {
      return { ...contextResolved, source: "last_active_context" };
    }

    const byName = typeof resolveByName === "function" ? await resolveByName(input) : null;
    if (byName && ["one", "many", "none"].includes(String(byName.kind || ""))) {
      return byName;
    }
    return { kind: "none" };
  };
}

module.exports = {
  isStrongMutationIntent,
  isWeakMutationIntent,
  isConfirmationResumeMessage,
  normalizeMutationSemantics,
  classifyCapabilitySupport,
  decideMutationMode,
  isEntityClarification,
  resolveEntity,
  _internal: {
    isQuestionLike,
    hasResolvedEntity,
  },
};
