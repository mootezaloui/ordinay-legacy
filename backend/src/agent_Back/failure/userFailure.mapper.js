"use strict";

const { generateToolCallingTurn } = require("../llm/llm.client");
const { parseJsonResponse } = require("../llm/llm.validation");

function normalizeCode(error) {
  const explicit = String(error?.code || "").trim();
  if (explicit) return explicit.toUpperCase();
  const status = Number(error?.status || 0);
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "INTERNAL_ERROR";
  return "UNKNOWN_ERROR";
}

function normalizeTargetType(value) {
  const raw = String(value || "entity")
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .trim();
  return raw || "entity";
}

function singularize(label) {
  if (!label) return "entity";
  if (label.endsWith("ies")) return `${label.slice(0, -3)}y`;
  if (label.endsWith("s")) return label.slice(0, -1);
  return label;
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
  const targetType = normalizeTargetType(context?.targetType);
  const targetTypeSingular = singularize(targetType);
  const targetId = Number.isFinite(Number(context?.targetId))
    ? Number(context.targetId)
    : null;
  const reference = String(context?.reference || "").trim() || null;
  const intent = String(context?.intent || "").trim() || null;
  const pendingOperationId =
    String(context?.pendingOperationId || "").trim() || null;

  if (code === "TARGET_NOT_FOUND" || code === "TARGET_UNRESOLVED") {
    const hasReference = Boolean(reference);
    const describedTarget = hasReference
      ? `"${reference}"`
      : `that ${targetTypeSingular}`;
    return buildRecovery({
      message: `Sorry, I couldn't find ${describedTarget} in your workspace.`,
      whatHappened:
        "I looked for the target you referenced, but it isn't available in your current data.",
      canRetry: true,
      alternatives: [
        {
          label: `Use another ${targetTypeSingular}`,
          action: "verify_reference",
          prompt: `Show recent ${targetType} so I can pick one`,
        },
        {
          label: `Create this ${targetTypeSingular} first`,
          action: "create_target",
          prompt: `Create a new ${targetTypeSingular} with reference ${reference || "my reference"}`,
        },
        {
          label: "Continue without this target",
          action: "list_recent",
          prompt: `Generate a generic draft without linking it to a ${targetTypeSingular}`,
        },
      ],
      suggestedPrompts: [
        `Show recent ${targetType} so I can pick one`,
        `Create a new ${targetTypeSingular} with reference ${reference || "my reference"}`,
        `Generate a generic draft without linking it to a ${targetTypeSingular}`,
      ],
      context: { targetType, targetId, reference, intent, pendingOperationId },
      severity: "blocking",
    });
  }

  if (code === "MISSING_REQUIRED_FIELDS") {
    return buildRecovery({
      message: "I can do this, but I still need a few details first.",
      whatHappened:
        "Some required information was missing in the request.",
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
      message: "I can’t perform that action with your current access.",
      whatHappened:
        "This action needs permissions or confirmation that are not available right now.",
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
      message: "I couldn't reach one of the services needed to finish this.",
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
    message: "Sorry, I couldn't complete that request this time.",
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

function sanitizeRecoveryText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  const hasInternalLeak =
    /stack|trace|exception|sql|postgres|sqlite|token|schema|internal|timeouterror|node:|at\s+\w+/i.test(
      text,
    );
  if (hasInternalLeak) return fallback;
  return text.slice(0, 420);
}

function sanitizeAlternatives(alternatives, fallback) {
  if (!Array.isArray(alternatives) || alternatives.length === 0) return fallback;
  const cleaned = alternatives
    .map((entry) => {
      const label = sanitizeRecoveryText(entry?.label, "");
      const prompt = sanitizeRecoveryText(entry?.prompt, "");
      if (!label) return null;
      return {
        label,
        action: String(entry?.action || "suggested_action").slice(0, 64),
        ...(prompt ? { prompt } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 5);
  return cleaned.length > 0 ? cleaned : fallback;
}

function shouldUseLlmRewrite() {
  const override = String(process.env.USER_FAILURE_LLM_REWRITE || "").trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV !== "test";
}

async function rewriteRecoveryWithLlm({ code, recovery, context = {} }) {
  if (!shouldUseLlmRewrite()) return recovery;
  try {
    const assistant = await generateToolCallingTurn({
      tools: [],
      temperature: 0.2,
      maxTokens: 420,
      messages: [
        {
          role: "system",
          content:
            "Rewrite recovery responses for end users. Be warm, concise, and actionable. Never include internal codes, stack traces, policy internals, or system terms.",
        },
        {
          role: "user",
          content: [
            "Return strictly JSON with keys:",
            '{"message":"string","whatHappened":"string","alternatives":[{"label":"string","action":"string","prompt":"string"}],"suggestedPrompts":["string"]}',
            "Rules:",
            "- Keep message and whatHappened user-friendly and non-technical.",
            "- Mention the missing reference naturally when available.",
            "- Provide 2-4 alternatives and 1-4 suggested prompts.",
            "- Prefer question-like prompts users can click.",
            `Failure code: ${String(code || "UNKNOWN_ERROR")}`,
            `Context: ${JSON.stringify(context || {})}`,
            `Base recovery: ${JSON.stringify(recovery)}`,
          ].join("\n"),
        },
      ],
    });
    const parsed = parseJsonResponse(assistant?.content || "");
    if (!parsed || typeof parsed !== "object") return recovery;

    return {
      ...recovery,
      message: sanitizeRecoveryText(parsed.message, recovery.message),
      whatHappened: sanitizeRecoveryText(parsed.whatHappened, recovery.whatHappened),
      alternatives: sanitizeAlternatives(parsed.alternatives, recovery.alternatives),
      suggestedPrompts: Array.isArray(parsed.suggestedPrompts)
        ? parsed.suggestedPrompts
            .map((prompt) => sanitizeRecoveryText(prompt, ""))
            .filter(Boolean)
            .slice(0, 4)
        : recovery.suggestedPrompts,
    };
  } catch {
    return recovery;
  }
}

async function mapUserFailure(error, context = {}) {
  const code = normalizeCode(error);
  const deterministic = mapByCode({ code, error, context });
  const recovery = await rewriteRecoveryWithLlm({
    code,
    recovery: deterministic,
    context,
  });
  return {
    code,
    recovery,
    internalMessage: String(error?.message || "Unknown error"),
  };
}

module.exports = {
  mapUserFailure,
};
