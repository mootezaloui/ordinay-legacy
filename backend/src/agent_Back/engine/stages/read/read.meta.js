"use strict";

const { interpret: postReadInterpret } = require("../../../interpreters/post-read.interpreter");
const {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
} = require("../../../utils/entityDisplay");
const { READ_INTENTS } = require("../../../intent.classifier");

function _resolveReadEntityType(intent) {
  const map = {
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
    [READ_INTENTS.EXPLAIN_HISTORY_STATE]: "history_event",
    [READ_INTENTS.SUMMARIZE_HISTORY]: "history_event",
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

function _inferReadOutcome({ data, summary, details }) {
  const combined = `${summary || ""} ${(details || []).join(" ")}`.toLowerCase();
  if (combined.includes("multiple")) return "ambiguous";
  if (combined.includes("which") || combined.includes("provide")) return "incomplete";
  if (combined.includes("no ") || combined.includes("not found")) return "not_found";
  if (combined.includes("error") || combined.includes("unable")) return "error";
  if (Array.isArray(data)) {
    return data.length === 0 ? "empty" : "success";
  }
  if (data && typeof data === "object") {
    return "success";
  }
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
    readMeta,
    promotion,
    aggregateSummary,
    aggregateFilters,
  },
) {
  const context = { ...(baseContext || {}), _readOutcome: readOutcome };

  if (entityData && !Array.isArray(entityData)) {
    if (entityType === "client") context.clientData = entityData;
    if (entityType === "dossier") context.dossierData = entityData;
    if (entityType === "lawsuit") context.lawsuitData = entityData;
    if (entityType === "task") context.taskData = entityData;
    if (entityType === "session") context.sessionData = entityData;
    if (entityType === "mission") context.missionData = entityData;
    if (entityType === "financial_entry") context.financialEntryData = entityData;
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
    const trimmed = String(detail || "").trim().toLowerCase();
    return (
      trimmed.startsWith("please specify") ||
      trimmed.startsWith("try listing") ||
      trimmed.startsWith("please try again") ||
      trimmed.startsWith("select one") ||
      trimmed.startsWith("try asking") ||
      trimmed.startsWith("try your request again")
    );
  };

  const cleanedSummary =
    typeof summary === "string" && summary.trim()
      ? stripGuidance(summary)
      : "";
  const factsSummary = cleanedSummary || `No ${entityType} data available.`;
  const rawDetails = Array.isArray(details) ? details : [];
  const factsDetails = rawDetails
    .map((detail) => String(detail || "").trim())
    .filter(
      (detail) =>
        detail &&
        !detail.toLowerCase().startsWith("explanation:") &&
        !detail.toLowerCase().startsWith("next steps") &&
        !isGuidanceDetail(detail),
    );

  if (factsDetails.length === 0) {
    if (/no\s+.+(found|available)/i.test(factsSummary)) {
      factsDetails.push("Scope returned zero records.");
    } else {
      factsDetails.push(factsSummary);
    }
  }

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

  return {
    type: "explanation",
    entityId: this._resolveReadEntityId(entityType, entityData),
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

module.exports = {
  _resolveReadEntityType,
  _resolveReadEntityId,
  _inferReadOutcome,
  _buildReadMeta,
  _deriveContextPromotion,
  _buildReadInterpretationContext,
  _buildReadExplanation,
};
