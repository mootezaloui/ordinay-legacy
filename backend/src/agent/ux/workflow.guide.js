"use strict";

const WORKFLOW_TYPES = Object.freeze([
  "create_lawsuit",
  "draft_notice",
  "review_dossier",
  "generate_invoice",
  "prepare_hearing_summary",
]);

function detectWorkflowOpportunity({ input, session, activeEntities, turnType } = {}) {
  if (turnType === "CONFIRMATION" || turnType === "REJECTION") {
    return emptyWorkflow();
  }

  const message = normalizeText(input && input.message);
  if (!message) {
    return emptyWorkflow();
  }

  const entities = Array.isArray(activeEntities)
    ? activeEntities
    : Array.isArray(session && session.activeEntities)
      ? session.activeEntities
      : [];

  if (containsAny(message, ["lawsuit", "case", "file lawsuit", "قضية", "affaire"])) {
    return buildCreateLawsuitWorkflow(message, entities);
  }
  if (containsAny(message, ["notice", "notification", "formal notice", "اخطار", "mise en demeure"])) {
    return buildDraftNoticeWorkflow(message, entities);
  }
  if (containsAny(message, ["review dossier", "review file", "analyse dossier", "راجع الملف"])) {
    return buildReviewDossierWorkflow(message, entities);
  }
  if (containsAny(message, ["invoice", "bill", "facture", "فاتورة"])) {
    return buildGenerateInvoiceWorkflow(message, entities);
  }
  if (containsAny(message, ["hearing summary", "hearing prep", "audience", "ملخص جلسة"])) {
    return buildHearingSummaryWorkflow(message, entities);
  }

  return emptyWorkflow();
}

function buildCreateLawsuitWorkflow(message, entities) {
  const missingPieces = [];
  if (!hasClientReference(message, entities)) {
    missingPieces.push("client or represented party");
  }
  if (!containsAny(message, ["court", "jurisdiction", "tribunal", "محكمة"])) {
    missingPieces.push("court or jurisdiction");
  }
  if (!containsAny(message, ["claim", "subject", "objet", "موضوع", "facts", "cause"])) {
    missingPieces.push("claim objective or legal grounds");
  }

  return buildWorkflowResult("create_lawsuit", missingPieces, [
    "Specify the represented client.",
    "Specify the court or jurisdiction.",
    "Provide the claim objective and core facts.",
  ]);
}

function buildDraftNoticeWorkflow(message, entities) {
  const missingPieces = [];
  if (!hasClientReference(message, entities)) {
    missingPieces.push("recipient/client identity");
  }
  if (!containsAny(message, ["deadline", "due date", "before", "avant", "قبل"])) {
    missingPieces.push("deadline");
  }
  if (!containsAny(message, ["purpose", "payment", "breach", "demand", "purpose", "motif"])) {
    missingPieces.push("notice objective");
  }

  return buildWorkflowResult("draft_notice", missingPieces, [
    "Specify who receives the notice.",
    "Specify the deadline date.",
    "Specify the legal objective (payment, compliance, or warning).",
  ]);
}

function buildReviewDossierWorkflow(message, entities) {
  const missingPieces = [];
  if (!hasDossierReference(message, entities)) {
    missingPieces.push("dossier reference");
  }
  if (!containsAny(message, ["risk", "timeline", "strategy", "documents", "tasks", "priorities"])) {
    missingPieces.push("review focus dimensions");
  }

  return buildWorkflowResult("review_dossier", missingPieces, [
    "Specify which dossier should be reviewed.",
    "Choose review dimensions: risks, timeline, evidence, tasks, or strategy.",
  ]);
}

function buildGenerateInvoiceWorkflow(message, entities) {
  const missingPieces = [];
  if (!hasClientReference(message, entities) && !hasDossierReference(message, entities)) {
    missingPieces.push("billing target (client or dossier)");
  }
  if (!containsAny(message, ["period", "range", "from", "to", "date", "month", "week"])) {
    missingPieces.push("billing period");
  }
  if (!containsAny(message, ["line item", "hours", "rate", "fees", "tax", "items"])) {
    missingPieces.push("line-item scope");
  }

  return buildWorkflowResult("generate_invoice", missingPieces, [
    "Specify the client or dossier to bill.",
    "Specify the billing period.",
    "Specify billable items or fee basis.",
  ]);
}

function buildHearingSummaryWorkflow(message, entities) {
  const missingPieces = [];
  if (!containsAny(message, ["hearing", "session", "audience", "جلسة"])) {
    missingPieces.push("hearing reference");
  }
  if (!containsAny(message, ["date", "on", "le", "بتاريخ"])) {
    missingPieces.push("hearing date");
  }
  if (!hasDossierReference(message, entities) && !containsAny(message, ["case", "lawsuit", "affaire", "قضية"])) {
    missingPieces.push("related case/dossier");
  }

  return buildWorkflowResult("prepare_hearing_summary", missingPieces, [
    "Specify the hearing date/time.",
    "Specify the related dossier or lawsuit.",
    "Specify expected output focus (facts, decisions, next actions).",
  ]);
}

function buildWorkflowResult(workflowType, missingPieces, suggestedNextSteps) {
  const missing = normalizeStringArray(missingPieces);
  const steps = normalizeStringArray(suggestedNextSteps);
  if (missing.length === 0) {
    return emptyWorkflow();
  }
  return {
    detected: true,
    workflowType,
    missingPieces: missing,
    suggestedNextSteps: steps,
  };
}

function emptyWorkflow() {
  return {
    detected: false,
    workflowType: "none",
    missingPieces: [],
    suggestedNextSteps: [],
  };
}

function hasClientReference(message, entities) {
  if (containsAny(message, ["client", "customer", "party", "عميل"])) {
    return true;
  }
  return hasEntityType(entities, "client");
}

function hasDossierReference(message, entities) {
  if (containsAny(message, ["dossier", "file", "ملف"])) {
    return true;
  }
  return hasEntityType(entities, "dossier");
}

function hasEntityType(entities, type) {
  const rows = Array.isArray(entities) ? entities : [];
  const target = String(type || "").trim().toLowerCase();
  return rows.some((row) => normalizeText(row && row.type) === target);
}

function containsAny(message, keywords) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    return false;
  }
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      continue;
    }
    if (normalizedKeyword.includes(" ")) {
      if (normalizedMessage.includes(normalizedKeyword)) {
        return true;
      }
      continue;
    }
    if (normalizedMessage.split(" ").includes(normalizedKeyword)) {
      return true;
    }
  }
  return false;
}

function normalizeStringArray(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => String(row || "").trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  WORKFLOW_TYPES,
  detectWorkflowOpportunity,
};
