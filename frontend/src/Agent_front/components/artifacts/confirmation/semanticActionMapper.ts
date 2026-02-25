import {
  sanitizeConfirmationViewModel,
  validateConfirmationViewModelCopy,
} from "./confirmationCopyGuard";
import {
  assertNonGenericSemanticCopy,
  assertSemanticActionViewModel,
  SemanticMappingError,
} from "./semanticGuards";
import type {
  SemanticActionMappingInput,
  SemanticActionViewModel,
  SemanticImpactItem,
  SemanticToneVariant,
} from "./types";

const HUMAN_FIELD_LABELS: Record<string, string> = {
  clientId: "Assigned client",
  dossierId: "Linked dossier",
  lawsuitId: "Linked lawsuit",
  officerId: "Assigned lawyer",
  status: "Status",
  isPaid: "Payment status",
  isActive: "Active",
  lawsuitNumber: "Lawsuit number",
  missionNumber: "Mission number",
  dueDate: "Due date",
  startDate: "Start date",
  endDate: "End date",
  hearingDate: "Hearing date",
  amount: "Amount",
  title: "Title",
  description: "Description",
  type: "Type",
  priority: "Priority",
};

const SENSITIVE_KEYWORDS = [
  "deceased",
  "dead",
  "décédé",
  "décédée",
  "death",
  "passed away",
  "hospitalized",
  "hospitalised",
  "incarcerated",
  "imprisoned",
];

const BEREAVEMENT_KEYWORDS = ["deceased", "dead", "death", "passed away", "décédé", "décédée"];

const RELATION_FIELD_KEYS = new Set(["clientId", "dossierId", "lawsuitId", "officerId"]);
const SUBJECT_FALLBACK_LABELS: Record<string, string> = {
  client: "this client",
  dossier: "this dossier",
  lawsuit: "this lawsuit",
  task: "this task",
  personal_task: "this task",
  session: "this session",
  mission: "this mission",
  financial_entry: "this financial entry",
  document: "this document",
  note: "this note",
};

function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function humanFieldLabel(field: string): string {
  return HUMAN_FIELD_LABELS[field] || toTitleCase(field);
}

function reassignmentLabel(field: string): string {
  return humanFieldLabel(field).replace(/^(assigned|linked)\s+/i, "").trim().toLowerCase();
}

function formatFieldValue(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && field && field.toLowerCase().endsWith("id")) return `#${value}`;
  return toTitleCase(String(value));
}

function containsSensitiveContext(input: SemanticActionMappingInput): boolean {
  const utterance = `${input.context.userUtterance || ""} ${input.context.reasonHint || ""}`.toLowerCase();
  if (SENSITIVE_KEYWORDS.some((keyword) => utterance.includes(keyword))) return true;
  const statusTo = String(input.changes?.status?.to || "").toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => statusTo.includes(keyword));
}

function containsBereavementContext(input: SemanticActionMappingInput): boolean {
  const utterance = `${input.context.userUtterance || ""} ${input.context.reasonHint || ""}`.toLowerCase();
  if (BEREAVEMENT_KEYWORDS.some((keyword) => utterance.includes(keyword))) return true;
  const statusTo = String(input.changes?.status?.to || "").toLowerCase();
  return BEREAVEMENT_KEYWORDS.some((keyword) => statusTo.includes(keyword));
}

function classifyTone(input: SemanticActionMappingInput): SemanticToneVariant {
  const actionKind = String(input.context.actionKind || "").toLowerCase();
  if (actionKind === "delete" || input.context.reversible === false) return "destructive";
  if (containsSensitiveContext(input)) return "sensitive";
  if (
    input.context.requiresRiskAck ||
    input.context.riskLevel === "high" ||
    input.context.riskLevel === "medium" ||
    (input.context.affectedItems?.length || 0) > 0 ||
    actionKind === "workflow"
  ) {
    return "caution";
  }
  return "neutral";
}

function dedupeImpact(items: SemanticImpactItem[]): SemanticImpactItem[] {
  const seen = new Set<string>();
  const result: SemanticImpactItem[] = [];
  for (const item of items) {
    const key = `${item.kind}:${(item.title || "").toLowerCase()}:${item.detail.toLowerCase()}:${(item.before || "").toLowerCase()}:${(item.after || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildChangeImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const items: SemanticImpactItem[] = [];
  const changes = input.changes || {};
  for (const [field, diff] of Object.entries(changes)) {
    items.push({
      kind: "change",
      title: humanFieldLabel(field),
      before: formatFieldValue(diff.from, field),
      after: formatFieldValue(diff.to, field),
      detail: `${humanFieldLabel(field)} will change from ${formatFieldValue(diff.from, field)} to ${formatFieldValue(diff.to, field)}.`,
    });
  }
  return items;
}

function buildAffectedImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const affected = input.context.affectedItems || [];
  const subjectLabel = String(input.context.subjectLabel || "").trim().toLowerCase();
  const labels = affected
    .map((a) => String(a.label || "").trim())
    .filter(Boolean)
    .filter((label) => !(subjectLabel && label.toLowerCase() === subjectLabel));
  if (labels.length === 0) return [];
  return [
    {
      kind: "consequence",
      detail:
        labels.length === 1
          ? `Related information connected to ${labels[0]} will be updated as part of this change.`
          : `Related information connected to ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ` and ${labels.length - 3} more` : ""} will also be updated.`,
    },
  ];
}

function buildHintImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const actionKind = String(input.context.actionKind || "").toLowerCase();
  const hints = (input.context.impactHints || [])
    .map((h) => String(h || "").trim())
    .filter(Boolean);
  const items: SemanticImpactItem[] = [];

  for (const hint of hints.slice(0, 5)) {
    const lower = hint.toLowerCase();
    if (lower.includes("cannot be undone") || lower.includes("permanent")) {
      items.push({ kind: "warning", detail: "This is a permanent change and cannot be undone." });
      continue;
    }
    if (lower.includes("total")) {
      items.push({ kind: "consequence", detail: "Related totals will be recalculated." });
      continue;
    }
    if (lower.includes("active") && (lower.includes("client") || lower.includes("follow-up"))) {
      items.push({
        kind: "consequence",
        detail: "This person will no longer appear in active-client views and routine follow-up suggestions.",
      });
    }
  }

  if (actionKind === "delete") {
    items.push({ kind: "warning", detail: "This is a permanent change and cannot be undone." });
  }
  if (
    input.entityType === "client" &&
    containsBereavementContext(input) &&
    !input.changes?.status &&
    !items.some((item) => item.detail.toLowerCase().includes("active-client views"))
  ) {
    items.push({
      kind: "consequence",
      detail: "This person will no longer appear in active-client views and routine follow-up suggestions.",
    });
  }
  if (input.context.requiresRiskAck) {
    items.push({
      kind: "warning",
      detail: "This change has elevated impact and needs your confirmation.",
    });
  }

  return items;
}

function buildReversibilityImpact(input: SemanticActionMappingInput): SemanticImpactItem {
  if (input.context.reversible === false) {
    return { kind: "reversibility", detail: "Not reversible." };
  }
  if (input.context.reversible === true) {
    const actionKind = String(input.context.actionKind || "").toLowerCase();
    if (actionKind === "delete") return { kind: "reversibility", detail: "Not reversible." };
    if (input.entityType === "task" && String(input.changes?.status?.to || "").toLowerCase().includes("completed")) {
      return { kind: "reversibility", detail: "You can reopen the task later." };
    }
    return { kind: "reversibility", detail: "This can be changed later if entered in error." };
  }
  return { kind: "reversibility", detail: "If needed, this can be changed later." };
}

function requireSubjectLabel(input: SemanticActionMappingInput, actionKind: string): string {
  const subjectLabel = String(input.context.subjectLabel || "").trim();
  if (!subjectLabel) {
    throw new SemanticMappingError("Missing subject label for semantic confirmation.", {
      actionKind,
      entityType: input.entityType,
      detectedIntent: input.detectedIntent,
    });
  }
  return subjectLabel;
}

function subjectLabelOrSemanticFallback(
  input: SemanticActionMappingInput,
  actionKind: string,
): string {
  const subjectLabel = String(input.context.subjectLabel || "").trim();
  if (subjectLabel) return subjectLabel;

  const entityType = String(input.entityType || "").toLowerCase().trim();
  const fallback = SUBJECT_FALLBACK_LABELS[entityType];
  if (fallback) return fallback;

  const entityLabel = toTitleCase(entityType);
  if (entityLabel && entityLabel !== "Unknown Target") {
    return `this ${entityLabel.toLowerCase()}`;
  }

  return requireSubjectLabel(input, actionKind);
}

function requireEntityLabel(input: SemanticActionMappingInput, actionKind: string): string {
  const entityLabel = toTitleCase(String(input.entityType || ""));
  if (!entityLabel || entityLabel === "Unknown Target") {
    throw new SemanticMappingError("Missing entity type label for semantic confirmation.", {
      actionKind,
      entityType: input.entityType,
      detectedIntent: input.detectedIntent,
    });
  }
  return entityLabel;
}

function buildNarrative(
  input: SemanticActionMappingInput,
  toneVariant: SemanticToneVariant,
): Omit<SemanticActionViewModel, "impact" | "toneVariant" | "sections"> {
  const actionKind = String(input.context.actionKind || "").toLowerCase();
  const statusTo = String(input.changes?.status?.to || "").trim();
  const statusFrom = String(input.changes?.status?.from || "").trim();
  const changeKeys = Object.keys(input.changes || {});
  const pendingFieldNames = (input.context.pendingFieldNames || []).filter(Boolean);

  if (actionKind === "delete") {
    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    const isFinancial = input.entityType === "financial_entry";
    return {
      assistantMessage: isFinancial
        ? "I can delete that financial entry, but this is a permanent change."
        : `I can delete ${subject}, but this is a permanent change.`,
      headline: isFinancial ? "Delete Financial Entry Permanently" : `Delete ${subject} Permanently`,
      description: isFinancial
        ? "This removes the selected financial entry and updates totals that include it."
        : `This removes ${subject} and updates any places where it appears.`,
      confirmLabel: isFinancial ? "Delete Entry Permanently" : "Delete Permanently",
      cancelLabel: isFinancial ? "Keep Entry" : `Keep ${requireEntityLabel(input, actionKind)}`,
    };
  }

  if (actionKind === "update" && input.changes?.status) {
    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    const toLower = statusTo.toLowerCase();
    const fromLabel = statusFrom ? toTitleCase(statusFrom) : "Current";
    const toLabel = statusTo ? toTitleCase(statusTo) : "Updated";

    if (toLower === "deceased" || toLower === "dead") {
      return {
        assistantMessage: `I'm sorry. I can mark ${subject} as deceased so future follow-ups treat this correctly. Please confirm before I apply that change.`,
        headline: `Mark ${subject} as Deceased`,
        description: "You said this person has passed away. This updates the status so the assistant no longer treats them as an active client.",
        confirmLabel: "Mark as Deceased",
        cancelLabel: "Keep Current Status",
      };
    }

    if (input.entityType === "task" && (toLower === "completed" || toLower === "done")) {
      return {
        assistantMessage: `I can mark "${subject}" as completed.`,
        headline: `Mark "${subject}" as Completed`,
        description: "This closes the task and reflects that the work is finished.",
        confirmLabel: "Mark Task Complete",
        cancelLabel: "Leave as Open",
      };
    }

    const confirmLabel = statusTo ? `Set to ${toTitleCase(statusTo)}` : "Confirm Status Change";
    return {
      assistantMessage:
        toneVariant === "sensitive"
          ? `I can confirm the status change for ${subject}.`
          : `I can change the status for ${subject} from ${fromLabel} to ${toLabel}.`,
      headline: `Set Status for ${subject}`,
      description: `This updates the status from ${fromLabel} to ${toLabel}.`,
      confirmLabel,
      cancelLabel: "Keep Current Status",
    };
  }

  if (actionKind === "update" && changeKeys.length > 0) {
    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    const reassignKey = changeKeys.find((key) =>
      ["clientId", "dossierId", "lawsuitId", "officerId"].includes(key),
    );

    if (reassignKey) {
      const relationLabel = reassignmentLabel(reassignKey);
      return {
        assistantMessage: `I can change the ${relationLabel} for ${subject}. Please confirm before I continue.`,
        headline: `Reassign ${relationLabel} for ${subject}`,
        description: `This will change the ${relationLabel} linked to ${subject}.`,
        confirmLabel: "Confirm Reassignment",
        cancelLabel: "Keep Current Assignment",
      };
    }

    const singleField = changeKeys.length === 1 ? humanFieldLabel(changeKeys[0]) : null;
    const isSingleTitleLikeField = singleField && ["Title", "Description", "Amount", "Due date", "Priority", "Type"].includes(singleField);
    return {
      assistantMessage: isSingleTitleLikeField
        ? `I can revise the ${singleField.toLowerCase()} for ${subject}.`
        : `I can revise the requested information for ${subject}.`,
      headline: singleField
        ? `Revise ${singleField} for ${subject}`
        : `Revise Information for ${subject}`,
      description: singleField
        ? `This will change the ${singleField.toLowerCase()} for ${subject}.`
        : `This will change the selected information for ${subject}.`,
      confirmLabel: singleField ? `Confirm ${singleField} Change` : "Confirm Changes",
      cancelLabel: "Keep Current Information",
    };
  }

  if (actionKind === "update" && pendingFieldNames.length > 0) {
    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    const reassignKey = pendingFieldNames.find((key) => RELATION_FIELD_KEYS.has(key));
    if (reassignKey) {
      const relationLabel = reassignmentLabel(reassignKey);
      return {
        assistantMessage: `I can change the ${relationLabel} for ${subject}. Please confirm before I continue.`,
        headline: `Reassign ${relationLabel} for ${subject}`,
        description: `This will change the ${relationLabel} linked to ${subject}.`,
        confirmLabel: "Confirm Reassignment",
        cancelLabel: "Keep Current Assignment",
      };
    }

    const singleField = pendingFieldNames.length === 1 ? humanFieldLabel(pendingFieldNames[0]) : null;
    return {
      assistantMessage: singleField
        ? `I can revise the ${singleField.toLowerCase()} for ${subject}.`
        : `I can revise the requested information for ${subject}.`,
      headline: singleField
        ? `Revise ${singleField} for ${subject}`
        : `Revise Information for ${subject}`,
      description: singleField
        ? `This will update the ${singleField.toLowerCase()} for ${subject}.`
        : `This will update the selected information for ${subject}.`,
      confirmLabel: singleField ? `Confirm ${singleField} Change` : "Confirm Changes",
      cancelLabel: "Keep Current Information",
    };
  }

  if (actionKind === "update") {
    const subjectLabel = String(input.context.subjectLabel || "").trim();
    const entityType = String(input.entityType || "").toLowerCase().trim();
    const hasSemanticTarget = Boolean(subjectLabel) || Boolean(entityType && entityType !== "unknown_target");

    if (containsBereavementContext(input) && (entityType === "client" || subjectLabel)) {
      const subject = hasSemanticTarget
        ? subjectLabelOrSemanticFallback(input, actionKind)
        : "this client";
      return {
        assistantMessage: `I'm sorry. I can mark ${subject} as deceased so future follow-ups treat this correctly. Please confirm before I apply that change.`,
        headline: `Mark ${subject} as Deceased`,
        description:
          "You said this person has passed away. This updates the status so the assistant no longer treats them as an active client.",
        confirmLabel: "Mark as Deceased",
        cancelLabel: "Keep Current Status",
      };
    }

    if (!hasSemanticTarget) {
      return {
        assistantMessage: "I can revise the selected information.",
        headline: "Revise Selected Information",
        description: "This will revise the selected information.",
        confirmLabel: "Confirm Changes",
        cancelLabel: "Keep Current Information",
      };
    }

    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    return {
      assistantMessage: `I can revise the selected information for ${subject}.`,
      headline: `Revise Information for ${subject}`,
      description: `This will revise the selected information for ${subject}.`,
      confirmLabel: "Confirm Changes",
      cancelLabel: "Keep Current Information",
    };
  }

  if (actionKind === "workflow") {
    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    return {
      assistantMessage: `I can carry out the requested follow-up steps for ${subject}, including related cleanup.`,
      headline: `Complete Related Cleanup for ${subject}`,
      description: "This will carry out the requested cleanup and linked follow-up steps together.",
      confirmLabel: "Continue with Cleanup",
      cancelLabel: "Keep Everything As-Is",
    };
  }

  if (actionKind === "link") {
    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    return {
      assistantMessage: `I can change the connection for ${subject}.`,
      headline: `Relink ${subject}`,
      description: "This changes how the selected entries are linked.",
      confirmLabel: "Confirm Connection Change",
      cancelLabel: "Keep Current Link",
    };
  }

  if (actionKind === "attach") {
    const subject = subjectLabelOrSemanticFallback(input, actionKind);
    return {
      assistantMessage: `I can attach this document to ${subject}.`,
      headline: `Attach Document to ${subject}`,
      description: "This links the attachment so it appears in the right place.",
      confirmLabel: "Attach Document",
      cancelLabel: "Do Not Attach",
    };
  }

  if (actionKind === "create") {
    const entity = requireEntityLabel(input, actionKind);
    return {
      assistantMessage: `I can create a new ${entity.toLowerCase()} from this request.`,
      headline: `Create ${entity}`,
      description: `This will add a new ${entity.toLowerCase()} using the information shown below.`,
      confirmLabel: `Create ${entity}`,
      cancelLabel: "Do Not Create",
    };
  }

  throw new SemanticMappingError("Unsupported confirmation scenario for semantic mapping.", {
    actionKind,
    detectedIntent: input.detectedIntent,
    entityType: input.entityType,
  });
}

export function mapSemanticAction(input: SemanticActionMappingInput): SemanticActionViewModel {
  const toneVariant = classifyTone(input);
  const narrative = buildNarrative(input, toneVariant);
  const impact = dedupeImpact([
    ...buildChangeImpact(input),
    ...buildHintImpact(input),
    ...buildAffectedImpact(input),
    buildReversibilityImpact(input),
  ]);

  const viewModel = sanitizeConfirmationViewModel({
    ...narrative,
    impact,
    toneVariant,
    sections: {
      changesLabel: "What changes",
      consequencesLabel: "Consequences",
      warningsLabel: "Warnings",
      reversibilityLabel: "Can this be undone?",
    },
  });

  const validation = validateConfirmationViewModelCopy(viewModel);
  if (!validation.valid) {
    throw new SemanticMappingError("Semantic confirmation copy failed validation.", {
      offendingText: validation.offendingText,
      detectedIntent: input.detectedIntent,
      entityType: input.entityType,
    });
  }

  assertSemanticActionViewModel(viewModel);
  assertNonGenericSemanticCopy(viewModel);
  return viewModel;
}
