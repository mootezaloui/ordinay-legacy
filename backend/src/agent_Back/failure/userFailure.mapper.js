"use strict";

function normalizeCode(error) {
  const explicit = String(error?.code || "").trim();
  if (explicit) return explicit.toUpperCase();
  const status = Number(error?.status || 0);
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "INTERNAL_ERROR";
  return "UNKNOWN_ERROR";
}

function buildRecovery({
  message,
  whatHappened,
  canRetry = true,
  alternatives = [],
  suggestedPrompts = [],
  context = null,
  severity = "blocking",
} = {}) {
  return {
    type: "recovery",
    message: String(message || "I could not complete that request right now."),
    whatHappened: String(
      whatHappened || "The request could not be completed with the current data.",
    ),
    canRetry: Boolean(canRetry),
    alternatives: Array.isArray(alternatives) ? alternatives : [],
    suggestedPrompts: Array.isArray(suggestedPrompts) ? suggestedPrompts : [],
    context: context && typeof context === "object" ? context : null,
    severity: ["blocking", "partial", "temporary"].includes(String(severity))
      ? severity
      : "blocking",
  };
}

function mapByCode({ code, error, context = {} } = {}) {
  const targetType = String(context?.targetType || "entity").toLowerCase();
  const targetId = Number.isFinite(Number(context?.targetId))
    ? Number(context.targetId)
    : null;
  const reference = String(context?.reference || "").trim() || null;
  const intent = String(context?.intent || "").trim() || null;

  if (code === "TARGET_NOT_FOUND" || code === "TARGET_UNRESOLVED") {
    return buildRecovery({
      message: `I could not find that ${targetType} in your workspace.`,
      whatHappened:
        "The target entity could not be resolved from the provided id or reference.",
      canRetry: true,
      alternatives: [
        {
          label: `Check ${targetType} reference`,
          action: "verify_reference",
          prompt: `Find ${targetType} by reference`,
        },
        {
          label: `List recent ${targetType}s`,
          action: "list_recent",
          prompt: `List recent ${targetType}s`,
        },
      ],
      suggestedPrompts: [
        `List recent ${targetType}s`,
        `Find ${targetType} by reference`,
      ],
      context: { targetType, targetId, reference, intent },
      severity: "blocking",
    });
  }

  if (code === "MISSING_REQUIRED_FIELDS") {
    return buildRecovery({
      message: "I need a few required details before I can complete that.",
      whatHappened:
        "Some mandatory fields were missing for this action.",
      canRetry: true,
      alternatives: [
        {
          label: "Provide missing details",
          action: "provide_fields",
          prompt: "Tell me which fields are required and I will provide them",
        },
      ],
      suggestedPrompts: [
        "Tell me exactly which required fields are missing",
      ],
      context: { intent },
      severity: "blocking",
    });
  }

  if (code === "PERMISSION_DENIED" || code === "ACCESS_DENIED") {
    return buildRecovery({
      message: "I cannot perform that action with current permissions.",
      whatHappened:
        "This request requires access or confirmation that is not currently available.",
      canRetry: false,
      alternatives: [
        {
          label: "Ask for read-only alternative",
          action: "fallback_read",
          prompt: "Give me a read-only alternative for this request",
        },
      ],
      suggestedPrompts: ["Give me a read-only alternative for this request"],
      context: { intent },
      severity: "blocking",
    });
  }

  if (
    code === "SEARCH_PROVIDER_UNAVAILABLE" ||
    code === "TIMEOUT" ||
    code === "NETWORK_ERROR"
  ) {
    return buildRecovery({
      message: "I could not reach an external service needed for that request.",
      whatHappened:
        "The provider was unavailable or timed out.",
      canRetry: true,
      alternatives: [
        {
          label: "Retry now",
          action: "retry",
          prompt: "Retry the same request",
        },
        {
          label: "Use local data only",
          action: "local_only",
          prompt: "Answer using only local workspace data",
        },
      ],
      suggestedPrompts: [
        "Retry the same request",
        "Answer using only local workspace data",
      ],
      context: { intent },
      severity: "temporary",
    });
  }

  const fallbackMessage =
    String(error?.message || "").trim() || "I could not complete that request.";
  return buildRecovery({
    message: "I could not complete that request.",
    whatHappened:
      fallbackMessage.length > 180
        ? "An internal error interrupted this turn."
        : "An internal issue interrupted this turn.",
    canRetry: true,
    alternatives: [
      {
        label: "Retry request",
        action: "retry",
        prompt: "Retry the same request",
      },
      {
        label: "Try a narrower request",
        action: "narrow_scope",
        prompt: "Try again with a narrower scope",
      },
    ],
    suggestedPrompts: [
      "Retry the same request",
      "Try again with a narrower scope",
    ],
    context: { intent },
    severity: "temporary",
  });
}

function mapUserFailure(error, context = {}) {
  const code = normalizeCode(error);
  const recovery = mapByCode({ code, error, context });
  return {
    code,
    recovery,
    internalMessage: String(error?.message || "Unknown error"),
  };
}

module.exports = {
  mapUserFailure,
};

