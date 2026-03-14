"use strict";

const { detectAmbiguity } = require("./ambiguity.detector");
const { buildClarificationResponse } = require("./clarification.builder");
const { decideClarificationAction } = require("./clarification.policy");
const { selectResponsePosture } = require("./response.posture");
const { detectWorkflowOpportunity } = require("./workflow.guide");

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

module.exports = {
  createUxRuntime,
  detectAmbiguity,
  decideClarificationAction,
  buildClarificationResponse,
  detectWorkflowOpportunity,
  selectResponsePosture,
};
