"use strict";

const { detectAmbiguity } = require("./ambiguity.detector");
const { buildClarificationResponse } = require("./clarification.builder");
const { decideClarificationAction } = require("./clarification.policy");
const { selectResponsePosture } = require("./response.posture");
const { detectWorkflowOpportunity } = require("./workflow.guide");
const PRONOUN_REFERENCE_MODES = new Set(["DRAFT"]);
const ENTITY_HINT_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "my",
  "our",
  "his",
  "her",
  "their",
  "this",
  "that",
  "same",
  "current",
  "client",
  "dossier",
  "case",
  "lawsuit",
  "matter",
  "document",
  "letter",
  "email",
  "summary",
  "status",
  "divorce",
  "something",
  "someone",
  "quelqu",
  "الملف",
  "القضية",
  "حالة",
]);

let _agentDocumentsService;
try {
  _agentDocumentsService = require("../../services/agentDocuments.service");
} catch (_e) {
  _agentDocumentsService = null;
}

function createUxRuntime() {
  return {
    evaluatePreLoop(params = {}) {
      try {
        return evaluatePreLoop(params);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown ux error");
        console.warn(`[agent.ux] pre-loop evaluation skipped: ${message}`);
        return { handled: false };
      }
    },
  };
}

function evaluatePreLoop({
  input,
  session,
  retrievalContext,
  activeEntities,
  pendingAction,
} = {}) {
  if (!input || !session) {
    return { handled: false };
  }

  if (pendingAction || (session.state && session.state.pendingAction)) {
    return {
      handled: false,
      action: "proceed",
      metadata: {
        uxDecision: {
          action: "proceed",
          posture: "confirmation",
          ambiguityKind: "none",
          ambiguityConfidence: "low",
          workflowType: "none",
          reason: "Pending action exists; UX preflight bypassed.",
        },
      },
    };
  }

  const inputMetadata =
    input && typeof input.metadata === "object" && input.metadata !== null
      ? input.metadata
      : null;
  const regenerateDraftRequested =
    inputMetadata &&
    inputMetadata.regenerateDraft === true &&
    typeof inputMetadata.draftSnapshot === "object" &&
    inputMetadata.draftSnapshot !== null;
  if (regenerateDraftRequested) {
    return {
      handled: false,
      action: "proceed",
      metadata: {
        uxDecision: {
          action: "proceed",
          posture: "drafting",
          ambiguityKind: "none",
          ambiguityConfidence: "low",
          workflowType: "none",
          reason: "Draft regeneration request bypasses ambiguity preflight.",
        },
      },
    };
  }

  // If session has attached documents, skip ambiguity detection — references like
  // "this file", "this image" clearly point to the attachment, not a DB entity.
  try {
    if (_agentDocumentsService && typeof _agentDocumentsService.buildAgentDocumentContext === "function") {
      const sessionId = String((input && input.sessionId) || (session && session.id) || "").trim();
      const docContext = _agentDocumentsService.buildAgentDocumentContext(sessionId);
      if (docContext && docContext.totalDocuments > 0) {
        return { handled: false, action: "proceed", metadata: { uxDecision: { action: "proceed", reason: "Session has attached documents; ambiguity bypass." } } };
      }
    }
  } catch (_e) {
    // Non-critical: fall through to normal ambiguity detection
  }

  const ambiguityResult = detectAmbiguity({
    input,
    session,
    retrievalContext,
    activeEntities,
  });

  const clarificationDecision = decideClarificationAction({
    ambiguityResult,
    turnType: "NEW",
    mode: input.mode,
    pendingAction: null,
    session,
  });

  if (clarificationDecision.action === "ask" || clarificationDecision.action === "offer_choices") {
    if (shouldDeferPronounClarificationToLoop({ input, session, ambiguityResult })) {
      const posture = selectResponsePosture({
        ambiguityResult,
        workflowOpportunity: null,
        turnType: "NEW",
        mode: input.mode,
        researchMode: false,
      });
      return {
        handled: false,
        action: "proceed",
        metadata: {
          uxDecision: {
            action: "proceed_with_recent_entity_hint",
            posture,
            ambiguityKind: ambiguityResult.kind,
            ambiguityConfidence: ambiguityResult.confidence,
            workflowType: "none",
            reason:
              "Unclear pronoun reference deferred because a recent explicit entity mention exists in session context.",
          },
        },
      };
    }

    // In READ_ONLY mode, defer ambiguity resolution to tool-first grounding
    const normalizedMode = String(input.mode || "").trim().toUpperCase();
    if (normalizedMode === "READ_ONLY") {
      const posture = selectResponsePosture({
        ambiguityResult,
        workflowOpportunity: null,
        turnType: "NEW",
        mode: input.mode,
        researchMode: false,
      });
      return {
        handled: false,
        action: "proceed",
        metadata: {
          uxDecision: {
            action: "proceed_with_ambiguity",
            posture,
            ambiguityKind: ambiguityResult.kind,
            ambiguityConfidence: ambiguityResult.confidence,
            ambiguityCandidates: Array.isArray(ambiguityResult.candidates)
              ? ambiguityResult.candidates.slice(0, 12)
              : [],
            workflowType: "none",
            reason: "READ_ONLY ambiguity deferred to tool-first grounding.",
          },
        },
      };
    }

    const responseText = buildClarificationResponse({
      ambiguityResult,
      candidates: ambiguityResult.candidates,
      session,
    });
    persistClarificationFingerprint(session, input, ambiguityResult, clarificationDecision.reason);

    const posture = selectResponsePosture({
      ambiguityResult,
      workflowOpportunity: null,
      turnType: "NEW",
      mode: input.mode,
      researchMode: false,
    });

    return {
      handled: true,
      action: clarificationDecision.action,
      responseText,
      metadata: {
        uxDecision: {
          action: clarificationDecision.action,
          posture,
          ambiguityKind: ambiguityResult.kind,
          ambiguityConfidence: ambiguityResult.confidence,
          workflowType: "none",
          reason: clarificationDecision.reason,
        },
      },
    };
  }

  const workflowOpportunity = detectWorkflowOpportunity({
    input,
    session,
    activeEntities,
    turnType: "NEW",
  });

  if (workflowOpportunity.detected) {
    console.info(
      "[AGENT_UX_WORKFLOW_GUIDANCE_TRIGGERED]",
      JSON.stringify({
        sessionId: String((input && input.sessionId) || (session && session.id) || ""),
        turnId: String((input && input.turnId) || ""),
        workflowType: workflowOpportunity.workflowType,
        missingPieces: normalizeStringArray(workflowOpportunity.missingPieces),
        messagePreview: normalizeOptionalString(input && input.message).slice(0, 180),
      }),
    );
    const posture = selectResponsePosture({
      ambiguityResult,
      workflowOpportunity,
      turnType: "NEW",
      mode: input.mode,
      researchMode: false,
    });
    const responseText = buildWorkflowGuidanceResponse(workflowOpportunity);

    return {
      handled: true,
      action: "guided_workflow",
      responseText,
      metadata: {
        uxDecision: {
          action: "guided_workflow",
          posture,
          ambiguityKind: ambiguityResult.kind,
          ambiguityConfidence: ambiguityResult.confidence,
          workflowType: workflowOpportunity.workflowType,
          reason: "Workflow request is underspecified and needs guided next-step inputs.",
        },
      },
    };
  }

  const posture = selectResponsePosture({
    ambiguityResult,
    workflowOpportunity,
    turnType: "NEW",
    mode: input.mode,
    researchMode: false,
  });

  return {
    handled: false,
    action: "proceed",
    metadata: {
      uxDecision: {
        action: "proceed",
        posture,
        ambiguityKind: ambiguityResult.kind,
        ambiguityConfidence: ambiguityResult.confidence,
        workflowType: workflowOpportunity.workflowType,
        reason: clarificationDecision.reason,
      },
    },
  };
}

function buildWorkflowGuidanceResponse(workflowOpportunity) {
  const workflowType = normalizeOptionalString(workflowOpportunity.workflowType) || "workflow";
  const missing = normalizeStringArray(workflowOpportunity.missingPieces);
  const steps = normalizeStringArray(workflowOpportunity.suggestedNextSteps);

  const lines = [
    `To proceed with ${workflowType.replace(/_/g, " ")}, I still need:`,
  ];
  for (const piece of missing.slice(0, 5)) {
    lines.push(`- ${piece}`);
  }
  if (steps.length > 0) {
    lines.push("Suggested next steps:");
    for (const step of steps.slice(0, 4)) {
      lines.push(`- ${step}`);
    }
  }
  return lines.join("\n");
}

function persistClarificationFingerprint(session, input, ambiguityResult, reason) {
  if (!session || typeof session !== "object") {
    return;
  }
  const metadata = ensureRecord(session.metadata);
  const ux = ensureRecord(metadata.ux);
  ux.lastClarificationFingerprint = normalizeOptionalString(ambiguityResult.fingerprint);
  ux.lastClarificationKind = normalizeOptionalString(ambiguityResult.kind);
  ux.lastClarificationTurnId = normalizeOptionalString(input.turnId);
  ux.lastClarificationAt = new Date().toISOString();
  ux.lastClarificationReason = normalizeOptionalString(reason);
  metadata.ux = ux;
  session.metadata = metadata;
}

function ensureRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizeStringArray(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => String(row || "").trim())
    .filter(Boolean);
}

function shouldDeferPronounClarificationToLoop({ input, session, ambiguityResult } = {}) {
  const mode = String(input && input.mode ? input.mode : "").trim().toUpperCase();
  if (!PRONOUN_REFERENCE_MODES.has(mode)) {
    return false;
  }

  const ambiguity = ensureRecord(ambiguityResult);
  const kind = normalizeOptionalString(ambiguity.kind);
  if (kind !== "unclear_reference") {
    return false;
  }

  const candidates = Array.isArray(ambiguity.candidates) ? ambiguity.candidates : [];
  if (candidates.length > 0) {
    return false;
  }

  return hasRecentExplicitEntityMention(session);
}

function hasRecentExplicitEntityMention(session) {
  if (!session || !Array.isArray(session.turns) || session.turns.length === 0) {
    return false;
  }

  const recentUserMessages = session.turns
    .filter((turn) => turn && turn.role === "user")
    .slice(-3)
    .map((turn) => String(turn.message || ""))
    .filter(Boolean);

  if (recentUserMessages.length === 0) {
    return false;
  }

  const candidates = new Set();
  for (const message of recentUserMessages) {
    const normalized = normalizeOptionalString(message).toLowerCase();
    if (!normalized) {
      continue;
    }

    const regex = /\b(for|to|pour|client|dossier|case|lawsuit|affaire)\s+([\p{L}\p{N}'-]{2,})/giu;
    let match;
    while ((match = regex.exec(normalized)) !== null) {
      const token = normalizeOptionalString(match[2]).toLowerCase();
      if (!token || ENTITY_HINT_STOPWORDS.has(token)) {
        continue;
      }
      candidates.add(token);
    }
  }

  return candidates.size === 1;
}

module.exports = {
  createUxRuntime,
  detectAmbiguity,
  decideClarificationAction,
  buildClarificationResponse,
  detectWorkflowOpportunity,
  selectResponsePosture,
};
