"use strict";

const {
  interpret: postReadInterpret,
} = require("../../../interpreters/post-read.interpreter");
const {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
} = require("../../../utils/entityDisplay");
const { READ_INTENTS } = require("../../../intent.classifier");
const { ENTITY_PLURALS } = require("./read.constants");

function _resolveReadEntityType(intent) {
  const map = {
    [READ_INTENTS.WEB_SEARCH]: "web_search",
    [READ_INTENTS.DEEP_SEARCH]: "deep_search",
    [READ_INTENTS.LIST_CLIENTS]: "client",
    [READ_INTENTS.READ_CLIENT]: "client",
    [READ_INTENTS.EXPLAIN_CLIENT_STATE]: "client",
    [READ_INTENTS.SUMMARIZE_CLIENT]: "client",
    [READ_INTENTS.LIST_DOSSIERS]: "dossier",
    [READ_INTENTS.READ_DOSSIER]: "dossier",
    [READ_INTENTS.EXPLAIN_DOSSIER_STATE]: "dossier",
    [READ_INTENTS.SUMMARIZE_DOSSIER]: "dossier",
    [READ_INTENTS.LIST_LAWSUITS]: "lawsuit",
    [READ_INTENTS.READ_LAWSUIT]: "lawsuit",
    [READ_INTENTS.EXPLAIN_LAWSUIT_STATE]: "lawsuit",
    [READ_INTENTS.SUMMARIZE_LAWSUIT]: "lawsuit",
    [READ_INTENTS.LIST_TASKS]: "task",
    [READ_INTENTS.LIST_OVERDUE_TASKS]: "task",
    [READ_INTENTS.READ_TASK]: "task",
    [READ_INTENTS.EXPLAIN_TASK_STATE]: "task",
    [READ_INTENTS.SUMMARIZE_TASK]: "task",
    [READ_INTENTS.LIST_PERSONAL_TASKS]: "personal_task",
    [READ_INTENTS.READ_PERSONAL_TASK]: "personal_task",
    [READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE]: "personal_task",
    [READ_INTENTS.SUMMARIZE_PERSONAL_TASK]: "personal_task",
    [READ_INTENTS.LIST_SESSIONS]: "session",
    [READ_INTENTS.LIST_UPCOMING_SESSIONS]: "session",
    [READ_INTENTS.READ_SESSION]: "session",
    [READ_INTENTS.EXPLAIN_SESSION_STATE]: "session",
    [READ_INTENTS.SUMMARIZE_SESSION]: "session",
    [READ_INTENTS.LIST_MISSIONS]: "mission",
    [READ_INTENTS.READ_MISSION]: "mission",
    [READ_INTENTS.EXPLAIN_MISSION_STATE]: "mission",
    [READ_INTENTS.SUMMARIZE_MISSION]: "mission",
    [READ_INTENTS.LIST_OFFICERS]: "officer",
    [READ_INTENTS.READ_OFFICER]: "officer",
    [READ_INTENTS.EXPLAIN_OFFICER_STATE]: "officer",
    [READ_INTENTS.SUMMARIZE_OFFICER]: "officer",
    [READ_INTENTS.LIST_FINANCIAL_ENTRIES]: "financial_entry",
    [READ_INTENTS.READ_FINANCIAL_ENTRY]: "financial_entry",
    [READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE]: "financial_entry",
    [READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY]: "financial_entry",
    [READ_INTENTS.LIST_NOTIFICATIONS]: "notification",
    [READ_INTENTS.READ_NOTIFICATION]: "notification",
    [READ_INTENTS.EXPLAIN_NOTIFICATION_STATE]: "notification",
    [READ_INTENTS.SUMMARIZE_NOTIFICATION]: "notification",
    [READ_INTENTS.LIST_HISTORY_EVENTS]: "history_event",
    [READ_INTENTS.READ_HISTORY_EVENT]: "history_event",
    [READ_INTENTS.LIST_DOCUMENTS]: "document",
    [READ_INTENTS.READ_DOCUMENT]: "document",
    [READ_INTENTS.EXPLAIN_HISTORY_STATE]: "history_event",
    [READ_INTENTS.SUMMARIZE_HISTORY]: "history_event",
    [READ_INTENTS.SUMMARIZE_DOCUMENT]: "document",
  };

  return map[intent] || "unknown";
}

function _resolveReadEntityId(entityType, entityData) {
  if (!entityType) return "Record";

  const fallback = formatEntityTypeLabel(entityType) || "Record";

  if (Array.isArray(entityData)) {
    if (entityData.length === 1 && entityData[0]) {
      return resolveEntityDisplayLabel(entityType, entityData[0], {
        fallback,
      });
    }
    return `list:${entityType}`;
  }

  if (entityData && typeof entityData === "object") {
    return resolveEntityDisplayLabel(entityType, entityData, { fallback });
  }

  return fallback;
}

function _inferReadOutcome({ data, summary, details, entityType }) {
  const summaryText = String(summary || "");
  const detailsText = Array.isArray(details) ? details.join(" ") : "";
  const combined = `${summaryText} ${detailsText}`.toLowerCase();
  const hasObjectData = Boolean(
    data && !Array.isArray(data) && typeof data === "object",
  );
  const hasArrayData = Array.isArray(data);

  if (entityType === "document") {
    if (
      combined.includes("ocr in progress") ||
      combined.includes("still being processed")
    ) {
      return "processing";
    }
    if (
      combined.includes("ocr") ||
      combined.includes("not readable") ||
      combined.includes("unreadable")
    ) {
      return "error";
    }
  }

  // Grounding rule: structured retrieved data takes precedence over text heuristics.
  // Prevents false "not found" outcomes when details include phrases such as "No data changes..."
  if (hasObjectData) return "success";
  if (hasArrayData) {
    if (data.length === 0) return "empty";
    const isAmbiguousSelection =
      combined.includes("multiple") &&
      (combined.includes("please specify") || combined.includes("which"));
    return isAmbiguousSelection ? "ambiguous" : "success";
  }

  if (combined.includes("multiple")) return "ambiguous";
  if (combined.includes("which") || combined.includes("provide"))
    return "incomplete";

  const explicitNotFoundPattern =
    /\bnot found\b|\bno [a-z\s]*found\b|\bcould not be located\b|\bno matching records?\b/i;
  if (explicitNotFoundPattern.test(`${summaryText} ${detailsText}`))
    return "not_found";

  if (combined.includes("error") || combined.includes("unable")) return "error";
  return "unknown";
}

function _buildReadMeta(entityType, entityData) {
  const meta = {
    entityType,
    count: 0,
    entityIds: [],
    singleId: null,
  };

  if (Array.isArray(entityData)) {
    meta.count = entityData.length;
    meta.entityIds = entityData
      .map((item) => item?.id)
      .filter((id) => id !== null && id !== undefined);
    if (meta.count === 1) {
      meta.singleId = entityData[0]?.id ?? meta.entityIds[0] ?? null;
    }
    return meta;
  }

  if (entityData && typeof entityData === "object") {
    meta.count = 1;
    meta.singleId = entityData.id ?? null;
    if (meta.singleId !== null && meta.singleId !== undefined) {
      meta.entityIds = [meta.singleId];
    }
  }

  return meta;
}

function _deriveContextPromotion(readMeta, readOutcome, context) {
  const source =
    (context && context._activeEntitySource) ||
    (context && context._followUpExecution ? "follow-up" : "user");

  if (!readMeta || !readMeta.entityType) {
    return { activeEntity: null };
  }

  if (!["success", "empty"].includes(readOutcome)) {
    return { activeEntity: null };
  }

  if (readMeta.count === 1 && readMeta.singleId) {
    return {
      activeEntity: {
        type: readMeta.entityType,
        id: readMeta.singleId,
        source,
      },
      pendingSelection: null,
    };
  }

  if (readMeta.count > 1) {
    return {
      activeEntity: null,
      pendingSelection: {
        entityType: readMeta.entityType,
        count: readMeta.count,
      },
    };
  }

  return { activeEntity: null };
}

function _buildReadInterpretationContext(
  baseContext,
  {
    entityType,
    entityData,
    readOutcome,
    readSummary,
    readDetails,
    readMeta,
    promotion,
    aggregateSummary,
    aggregateFilters,
  },
) {
  const groundedEntityRetrieved = Array.isArray(entityData)
    ? entityData.length > 0
    : Boolean(entityData && typeof entityData === "object");
  const normalizedReadOutcome =
    groundedEntityRetrieved &&
    ["not_found", "incomplete"].includes(
      String(readOutcome || "").toLowerCase(),
    )
      ? "success"
      : readOutcome;
  const context = {
    ...(baseContext || {}),
    _readOutcome: normalizedReadOutcome,
  };
  const workSnapshot =
    baseContext &&
    baseContext.workSnapshot &&
    typeof baseContext.workSnapshot === "object"
      ? baseContext.workSnapshot
      : null;
  const snapshotEntityType = String(
    workSnapshot?.entityType || "",
  ).toLowerCase();
  const snapshotEntityId =
    workSnapshot?.entityId ??
    workSnapshot?.scope?.dossierId ??
    workSnapshot?.parent?.id ??
    null;
  const readEntityId =
    readMeta?.singleId ??
    (!Array.isArray(entityData) && entityData && typeof entityData === "object"
      ? entityData.id
      : null);
  const snapshotAppliesToRead =
    snapshotEntityType === "dossier" &&
    entityType === "dossier" &&
    snapshotEntityId !== null &&
    snapshotEntityId !== undefined &&
    !["incomplete", "ambiguous", "not_found"].includes(
      String(readOutcome || "").toLowerCase(),
    ) &&
    (readEntityId === null ||
      readEntityId === undefined ||
      String(snapshotEntityId) === String(readEntityId));

  if (workSnapshot) {
    context.workSnapshot = workSnapshot;
  }
  context._readSummary = String(readSummary || "");
  context._readDetails = Array.isArray(readDetails) ? readDetails : [];

  if (entityData && !Array.isArray(entityData)) {
    if (entityType === "client") context.clientData = entityData;
    if (entityType === "dossier") context.dossierData = entityData;
    if (entityType === "lawsuit") context.lawsuitData = entityData;
    if (entityType === "task") context.taskData = entityData;
    if (entityType === "session") context.sessionData = entityData;
    if (entityType === "mission") context.missionData = entityData;
    if (entityType === "officer") context.officerData = entityData;
    if (entityType === "financial_entry")
      context.financialEntryData = entityData;
  }

  if (Array.isArray(entityData)) {
    if (entityType === "task") {
      context.tasks = entityData;
      context.overdueTasks = entityData.filter(
        (task) =>
          task.due_date &&
          !["done", "completed", "cancelled"].includes(
            String(task.status || "").toLowerCase(),
          ) &&
          new Date(task.due_date) < new Date(),
      );
    }
    if (entityType === "dossier") {
      context.dossiers = entityData;
    }
  }

  if (readMeta && typeof readMeta.count === "number") {
    context._resultCount = readMeta.count;
  }
  context._grounding = {
    source: "read_intent",
    entityType,
    entityRetrieved: groundedEntityRetrieved,
    resultCount:
      readMeta && typeof readMeta.count === "number" ? readMeta.count : null,
    readOutcome: normalizedReadOutcome,
    workMode: {
      dossier:
        (entityType === "dossier" &&
          !Array.isArray(entityData) &&
          groundedEntityRetrieved) ||
        snapshotAppliesToRead,
    },
  };
  context._dossierWorkMode = Boolean(context._grounding.workMode.dossier);
  context._workSnapshotActive = Boolean(snapshotAppliesToRead);
  if (snapshotAppliesToRead) {
    context._workSnapshotTimestamp = workSnapshot?.snapshotAt || null;
    context._workSnapshotStale = Boolean(workSnapshot?.meta?.stale);
    context._workSnapshotRefreshReason =
      workSnapshot?.meta?.refreshReason || null;
  }

  if (typeof aggregateSummary === "boolean") {
    context._aggregateSummary = aggregateSummary;
    if (!aggregateSummary) {
      context._aggregateFilters = null;
    }
  }
  if (aggregateFilters && typeof aggregateFilters === "object") {
    context._aggregateFilters = aggregateFilters;
  }

  if (promotion && promotion.activeEntity) {
    context.activeEntityType = promotion.activeEntity.type;
    context.activeEntityId = promotion.activeEntity.id;
    context.activeEntitySource = promotion.activeEntity.source;
    context.pendingSelection = null;
  } else if (promotion && promotion.pendingSelection) {
    context.pendingSelection = promotion.pendingSelection;
  }

  return context;
}

function _buildReadExplanation({
  intent,
  entityType,
  entityData,
  summary,
  details,
  context,
  sources,
  readOutcome,
  relatedSummary,
}) {
  const stripGuidance = (text) => {
    if (!text) return text;
    return String(text)
      .replace(/\s*Please specify[^.]*\.?/gi, "")
      .replace(/\s*Try listing[^.]*\.?/gi, "")
      .replace(/\s*Please try again[^.]*\.?/gi, "")
      .replace(/\s*Select one[^.]*\.?/gi, "")
      .replace(/\s*Try asking[^.]*\.?/gi, "")
      .replace(/\s*Try your request again[^.]*\.?/gi, "")
      .trim();
  };

  const isGuidanceDetail = (detail) => {
    const trimmed = String(detail || "")
      .trim()
      .toLowerCase();
    return (
      trimmed.startsWith("please specify") ||
      trimmed.startsWith("try listing") ||
      trimmed.startsWith("please try again") ||
      trimmed.startsWith("select one") ||
      trimmed.startsWith("try asking") ||
      trimmed.startsWith("try your request again") ||
      trimmed.startsWith("assistant recommendation")
    );
  };

  const normalizeLabel = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isPlaceholderFragment = (fragment) => {
    if (!fragment) return true;
    const trimmed = String(fragment).trim();
    if (!trimmed) return true;
    const lower = trimmed.toLowerCase();
    if (/\bn\/a\b/.test(lower) || lower === "na" || lower === "n/a")
      return true;
    if (lower.startsWith("none") || lower.startsWith("no ")) return true;
    if (lower.includes("no data")) return true;
    if (lower.includes("no overdue risk")) return true;
    if (lower.includes("not available")) return true;
    if (lower.includes("none attached")) return true;
    if (lower.includes("none detected")) return true;
    return false;
  };

  const cleanDetailValue = (value) => {
    if (!value) return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const delimiter = raw.includes(" | ") ? " | " : ", ";
    const fragments = raw.split(/\s*(?:\||,|;)\s*/);
    const kept = fragments.filter(
      (fragment) => !isPlaceholderFragment(fragment),
    );
    return kept.length > 0 ? kept.join(delimiter) : "";
  };

  const cleanDetailLine = (detail) => {
    const trimmed = String(detail || "").trim();
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("explanation:") || lowered.startsWith("next steps"))
      return null;
    if (lowered.startsWith("support options:")) return null;
    if (isGuidanceDetail(trimmed)) return null;

    const colonMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      const label = colonMatch[1].trim();
      const cleanedValue = cleanDetailValue(colonMatch[2]);
      if (!cleanedValue) return null;
      return `${label}: ${cleanedValue}`;
    }

    const dashMatch = trimmed.match(/^(.+?)\s+—\s+(.+)$/);
    if (dashMatch) {
      const label = dashMatch[1].trim();
      const cleanedValue = cleanDetailValue(dashMatch[2]);
      if (!cleanedValue) return label || null;
      return `${label} — ${cleanedValue}`;
    }

    if (isPlaceholderFragment(trimmed)) return null;
    return trimmed;
  };

  const detailPriorityMap = {
    client: [
      "summary",
      "relationships",
      "workload",
      "key risks",
      "blocking",
      "status",
      "email",
      "phone",
      "company",
      "documents",
      "recent activity",
    ],
    dossier: [
      "summary",
      "status",
      "priority",
      "phase",
      "deadline",
      "next hearing",
      "client",
      "adversary",
      "court",
      "relationships",
      "documents",
      "recent activity",
    ],
    lawsuit: [
      "summary",
      "status",
      "next hearing",
      "phase",
      "court",
      "dossier",
      "relationships",
      "documents",
      "recent activity",
    ],
    task: [
      "summary",
      "status",
      "priority",
      "due date",
      "blocking",
      "relationships",
      "documents",
      "recent activity",
    ],
    personal_task: [
      "summary",
      "status",
      "priority",
      "due date",
      "blocking",
      "documents",
      "recent activity",
    ],
    session: [
      "summary",
      "status",
      "scheduled",
      "location",
      "participants",
      "relationships",
      "documents",
      "recent activity",
    ],
    mission: [
      "summary",
      "status",
      "priority",
      "due date",
      "relationships",
      "documents",
      "recent activity",
    ],
    officer: [
      "summary",
      "status",
      "agency",
      "location",
      "specialization",
      "registration",
      "documents",
    ],
    financial_entry: [
      "summary",
      "amount",
      "direction",
      "due date",
      "paid",
      "relationships",
      "documents",
      "recent activity",
    ],
    notification: ["summary", "status", "severity", "entity", "reason"],
    history_event: ["summary", "entity", "description", "created at"],
    document: [
      "summary",
      "document",
      "source",
      "text length",
      "linked to",
      "status",
    ],
  };

  const orderFactsByPriority = (facts, type) => {
    const priorities = detailPriorityMap[type] || [
      "summary",
      "status",
      "priority",
      "due date",
      "relationships",
      "documents",
    ];
    const priorityLookup = new Map(
      priorities.map((label, index) => [label, index]),
    );
    const withIndex = facts.map((fact, index) => {
      const labelMatch = fact.match(/^([^:]+):/);
      const dashMatch = fact.match(/^(.+?)\s+—\s+/);
      const label = normalizeLabel(
        labelMatch ? labelMatch[1] : dashMatch ? dashMatch[1] : "",
      );
      let weight = 50;
      for (const [key, rank] of priorityLookup.entries()) {
        if (label === key || label.startsWith(key) || label.includes(key)) {
          weight = rank;
          break;
        }
      }
      return { fact, index, weight };
    });
    return withIndex
      .sort((a, b) => a.weight - b.weight || a.index - b.index)
      .map((entry) => entry.fact);
  };

  const cleanedSummary =
    typeof summary === "string" && summary.trim() ? stripGuidance(summary) : "";

  const deriveSummaryFromData = () => {
    if (cleanedSummary) return cleanedSummary;
    const label = formatEntityTypeLabel(entityType) || entityType || "Record";
    if (Array.isArray(entityData)) {
      const plural = ENTITY_PLURALS?.[entityType] || `${label}s`;
      return entityData.length > 0
        ? `Found ${entityData.length} ${plural}`
        : `No ${plural} found`;
    }
    if (entityData && typeof entityData === "object") {
      const display = resolveEntityDisplayLabel(entityType, entityData, {
        fallback: label,
      });
      return display ? `${label}: ${display}` : label;
    }
    return "";
  };

  const factsSummary = deriveSummaryFromData();
  const rawDetails = Array.isArray(details) ? details : [];
  const cleanedDetails = rawDetails
    .map((detail) => cleanDetailLine(detail))
    .filter(Boolean);
  const prioritizedDetails = orderFactsByPriority(cleanedDetails, entityType);
  const factsDetails =
    Array.isArray(prioritizedDetails) && prioritizedDetails.length > 0
      ? prioritizedDetails
      : [
          factsSummary && String(factsSummary).trim().length > 0
            ? String(factsSummary).trim()
            : "No detailed data points are currently available.",
        ];

  const explanation = postReadInterpret(entityType, entityData || {}, context);
  const confidenceMap = {
    success: 1,
    empty: 0.7,
    not_found: 0.5,
    ambiguous: 0.4,
    incomplete: 0.4,
    error: 0.1,
    unknown: 0.6,
  };

  // ── Clean Contract: Detect Context Suggestions ──
  // If there are selection-category follow-ups, return context_suggestion output type
  const hasFollowUps =
    Array.isArray(explanation.followUps) && explanation.followUps.length > 0;
  const selectionFollowUps = hasFollowUps
    ? explanation.followUps.filter((f) => f.category === "selection")
    : [];
  const isContextSuggestion = selectionFollowUps.length > 0;

  if (isContextSuggestion) {
    // Return dedicated context_suggestion output using ONLY selection-category followUps
    return {
      type: "context_suggestion",
      message:
        factsSummary ||
        `I found ${selectionFollowUps.length} ${entityType}${selectionFollowUps.length === 1 ? "" : "s"} that might match your request:`,
      entityType,
      capability: "READ",
      reason:
        readOutcome === "ambiguous"
          ? "ambiguous_query"
          : readOutcome === "incomplete"
            ? "missing_context"
            : "multiple_matches",
      originalIntent: intent,
      suggestions: selectionFollowUps.map((followUp, idx) => {
        const clientName = _resolveSelectionClientName(followUp);
        return {
          id: `${followUp.entityType}-${followUp.entityId}`,
          entityType: followUp.entityType,
          entityId: followUp.entityId,
          label:
            followUp.label?.replace(/^Review\s+\w+\s+context:\s*/i, "") ||
            followUp.target?.label ||
            `${formatEntityTypeLabel(followUp.entityType)} #${followUp.entityId}`,
          subtitle: _buildSelectionSubtitle(followUp),
          metadata: {
            ..._parseMetadataFromReason(followUp.reason),
            ...(followUp?.scope?.clientId
              ? { clientId: Number(followUp.scope.clientId) }
              : {}),
            ...(clientName ? { clientName } : {}),
          },
          intent: followUp.intent,
          scope: followUp.scope,
        };
      }),
      timestamp: new Date().toISOString(),
      confidence: confidenceMap[readOutcome] ?? 0.6,
      source: "rule-based",
    };
  }

  // Standard explanation output (unchanged for non-suggestion cases)
  return {
    type: "explanation",
    entityId: _resolveReadEntityId(entityType, entityData),
    entityType,
    facts: {
      summary: factsSummary,
      details: factsDetails,
    },
    ...(relatedSummary ? { relatedSummary } : {}),
    interpretation: explanation.interpretation,
    navigation: explanation.navigation,
    followUps: explanation.followUps,
    timestamp: new Date().toISOString(),
    confidence: confidenceMap[readOutcome] ?? 0.6,
    sources: Array.isArray(sources) ? sources : [],
    status: "draft",
    source: "rule-based",
    requires_validation: true,
  };
}

function _extractReferenceFromEntityLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return null;
  const match = raw.match(/^([A-Z]{2,10}-\d{2,8}(?:-\d{1,8})?)/i);
  return match ? match[1] : null;
}

function _resolveSelectionClientName(followUp) {
  const target = followUp?.target || {};
  const parent = followUp?.parent || {};
  const candidates = [
    target.clientName,
    target.client_name,
    target.client?.name,
    followUp?.metadata?.clientName,
    followUp?.metadata?.client_name,
    parent.type === "client" ? parent.label : null,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text) return text;
  }
  return null;
}

function _buildSelectionSubtitle(followUp) {
  const target = followUp?.target || {};
  const reference =
    target.reference ||
    target.ref ||
    _extractReferenceFromEntityLabel(target.label || "");
  const clientName = _resolveSelectionClientName(followUp);
  const clientId =
    followUp?.scope?.clientId && Number.isFinite(Number(followUp.scope.clientId))
      ? Number(followUp.scope.clientId)
      : null;
  const bits = [];
  if (reference) bits.push(String(reference).trim());
  if (clientName) bits.push(`Client: ${clientName}`);
  else if (clientId) bits.push(`Client #${clientId}`);
  return bits.length > 0 ? bits.join(" | ") : null;
}

function _parseMetadataFromReason(reason) {
  // Parse reason string like "3 overdue invoice(s), 2 open task(s), 1 active dossier(s)"
  // into structured metadata: { overdueInvoices: 3, openTasks: 2, activeDossiers: 1 }
  const metadata = {};
  if (!reason || typeof reason !== "string") return metadata;

  const parts = reason.split(",").map((s) => s.trim());
  for (const part of parts) {
    const match = part.match(/^(\d+)\s+(.+?)(?:\(s\))?$/i);
    if (match) {
      const count = parseInt(match[1], 10);
      const label = match[2].trim();
      // Convert "overdue invoice" → "overdueInvoices", "open task" → "openTasks"
      const key = label.replace(/\s+/g, "_").toLowerCase();
      metadata[key] = count;
    }
  }
  return metadata;
}

module.exports = {
  _resolveReadEntityType,
  _resolveReadEntityId,
  _inferReadOutcome,
  _buildReadMeta,
  _deriveContextPromotion,
  _buildReadInterpretationContext,
  _buildReadExplanation,
  _parseMetadataFromReason,
};
