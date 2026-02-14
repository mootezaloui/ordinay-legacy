"use strict";

const ANALYZE_DOSSIER_ENTITY_INTENT = "ANALYZE_ENTITY";

const CLOSED_STATUSES = new Set(["done", "completed", "cancelled", "closed"]);
const HOLD_STATUSES = new Set(["on_hold", "on hold", "hold", "paused"]);
const TYPE_ORDER = Object.freeze({
  task: 1,
  hearing: 2,
  session: 3,
  lawsuit: 4,
  financial_entry: 5,
});

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function daysDelta(dateValue, now) {
  const date = toDate(dateValue);
  if (!date) return null;
  const ms = date.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function isClosed(status) {
  return CLOSED_STATUSES.has(String(status || "").toLowerCase());
}

function isHearingLabel(label) {
  return /\bhearing\b/i.test(String(label || ""));
}

function resolveDossierId(snapshot, context) {
  const fromSnapshot =
    snapshot?.entityId || snapshot?.scope?.dossierId || snapshot?.parent?.id;
  if (fromSnapshot) return Number(fromSnapshot);
  if (context?.dossierId) return Number(context.dossierId);
  if (context?.activeEntity?.type === "dossier" && context?.activeEntity?.id) {
    return Number(context.activeEntity.id);
  }
  return null;
}

function hasChildScope(snapshot, childType) {
  const children = Array.isArray(snapshot?.scope?.childEntities)
    ? snapshot.scope.childEntities
    : [];
  const expected = String(childType || "").toLowerCase();
  return children.some((entry) => String(entry || "").toLowerCase() === expected);
}

function normalizePriority(value) {
  const priority = String(value || "").toLowerCase();
  if (!priority) return "medium";
  return priority;
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function computeUrgencyBoost(snapshot) {
  const urgency = String(snapshot?.aggregates?.workload?.urgency || "normal")
    .toLowerCase()
    .trim();
  if (urgency === "critical") return 15;
  if (urgency === "high") return 8;
  return 0;
}

function buildDeadlineRows(snapshot, now) {
  const rows = [];
  const deadline = snapshot?.aggregates?.deadline || null;
  const dueAt = toIso(deadline?.dateValue);
  const daysUntil = daysDelta(deadline?.dateValue, now);
  if (dueAt && daysUntil !== null) {
    rows.push({
      label: deadline?.sourceLabel || "Dossier deadline",
      dueAt,
      sourceType: "dossier",
      status: daysUntil < 0 ? "overdue" : "upcoming",
      daysUntil,
    });
  }
  return rows;
}

function buildTaskCandidate(task, now, urgencyBoost) {
  if (!task || isClosed(task.status)) return null;
  const due = task?.due_date || null;
  const daysUntil = daysDelta(due, now);
  let score = urgencyBoost + 10;
  const reasons = [];

  if (daysUntil !== null && daysUntil < 0) {
    score += 120 + Math.min(Math.abs(daysUntil), 14);
    reasons.push(`Task is overdue by ${Math.abs(daysUntil)} day(s).`);
  } else if (daysUntil !== null && daysUntil <= 1) {
    score += 90;
    reasons.push("Task deadline is within 24 hours.");
  } else if (daysUntil !== null && daysUntil <= 3) {
    score += 70;
    reasons.push("Task deadline is due within 3 days.");
  } else if (daysUntil !== null && daysUntil <= 7) {
    score += 50;
    reasons.push("Task deadline is due within 7 days.");
  } else {
    reasons.push("Task is active.");
  }

  const status = normalizeStatus(task.status);
  if (status === "blocked") {
    score += 15;
    reasons.push("Task is blocked.");
  }

  const priority = normalizePriority(task.priority);
  if (priority === "urgent") {
    score += 10;
    reasons.push("Task is marked urgent.");
  } else if (priority === "high") {
    score += 5;
    reasons.push("Task is marked high priority.");
  }

  return {
    itemType: "task",
    itemId: Number(task.id),
    label: String(task.title || `Task #${task.id}`),
    score: Math.max(0, Math.round(score)),
    reason: reasons.join(" "),
    dueAt: toIso(due),
    dueTimestamp: toDate(due)?.getTime() || Number.MAX_SAFE_INTEGER,
    status: String(task.status || "open"),
  };
}

function buildSessionCandidate(session, now, urgencyBoost) {
  if (!session || isClosed(session.status)) return null;
  const when = session?.scheduled_at || session?.session_date || null;
  const scheduleDate = toDate(when);
  if (!scheduleDate) return null;
  const daysUntil = daysDelta(scheduleDate.toISOString(), now);
  let score = urgencyBoost + 20;
  const reasons = [];
  const hearing = isHearingLabel(session?.title || session?.session_type);

  if (daysUntil !== null && daysUntil < 0) {
    score += 100 + Math.min(Math.abs(daysUntil), 14);
    reasons.push(`Scheduled date passed ${Math.abs(daysUntil)} day(s) ago.`);
  } else if (daysUntil !== null && daysUntil <= 1) {
    score += 85;
    reasons.push("Scheduled within 24 hours.");
  } else if (daysUntil !== null && daysUntil <= 3) {
    score += 65;
    reasons.push("Scheduled within 3 days.");
  } else if (daysUntil !== null && daysUntil <= 7) {
    score += 45;
    reasons.push("Scheduled within 7 days.");
  } else {
    reasons.push("Upcoming session in scope.");
  }

  if (hearing) {
    score += 15;
    reasons.push("Session is classified as a hearing.");
  }

  return {
    itemType: hearing ? "hearing" : "session",
    itemId: Number(session.id),
    label: String(session.title || session.session_type || `Session #${session.id}`),
    score: Math.max(0, Math.round(score)),
    reason: reasons.join(" "),
    dueAt: scheduleDate.toISOString(),
    dueTimestamp: scheduleDate.getTime(),
    status: String(session.status || "scheduled"),
  };
}

function buildLawsuitHearingCandidate(lawsuit, now, urgencyBoost) {
  if (!lawsuit || isClosed(lawsuit.status) || !lawsuit.next_hearing) return null;
  const hearingDate = toDate(lawsuit.next_hearing);
  if (!hearingDate) return null;
  const daysUntil = daysDelta(hearingDate.toISOString(), now);
  let score = urgencyBoost + 30;
  const reasons = [];

  if (daysUntil !== null && daysUntil < 0) {
    score += 100 + Math.min(Math.abs(daysUntil), 14);
    reasons.push(`Next hearing date passed ${Math.abs(daysUntil)} day(s) ago.`);
  } else if (daysUntil !== null && daysUntil <= 1) {
    score += 85;
    reasons.push("Next hearing is within 24 hours.");
  } else if (daysUntil !== null && daysUntil <= 3) {
    score += 65;
    reasons.push("Next hearing is within 3 days.");
  } else if (daysUntil !== null && daysUntil <= 7) {
    score += 45;
    reasons.push("Next hearing is within 7 days.");
  } else {
    reasons.push("Upcoming hearing in lawsuit scope.");
  }

  return {
    itemType: "hearing",
    itemId: Number(lawsuit.id),
    label: String(lawsuit.title || lawsuit.case_number || `Lawsuit #${lawsuit.id}`),
    score: Math.max(0, Math.round(score)),
    reason: reasons.join(" "),
    dueAt: hearingDate.toISOString(),
    dueTimestamp: hearingDate.getTime(),
    status: String(lawsuit.status || "active"),
  };
}

function buildFinancialCandidate(entry, now, urgencyBoost) {
  if (!entry) return null;
  const direction = String(entry.direction || "").toLowerCase();
  if (direction !== "receivable") return null;
  const paymentStatus = String(entry.payment_status || "").toLowerCase();
  const due = entry?.due_date || null;
  const daysUntil = daysDelta(due, now);
  const overdue =
    paymentStatus === "overdue" ||
    (daysUntil !== null && daysUntil < 0 && paymentStatus !== "paid");
  const unpaid = paymentStatus === "unpaid" || paymentStatus === "pending";
  if (!overdue && !unpaid) return null;

  let score = urgencyBoost + 20;
  const reasons = [];
  if (overdue) {
    score += 95 + (daysUntil !== null ? Math.min(Math.abs(daysUntil), 14) : 0);
    reasons.push("Receivable entry is overdue.");
  } else if (daysUntil !== null && daysUntil <= 3) {
    score += 65;
    reasons.push("Receivable due date is within 3 days.");
  } else {
    score += 35;
    reasons.push("Receivable is unpaid.");
  }

  return {
    itemType: "financial_entry",
    itemId: Number(entry.id),
    label: String(entry.title || entry.reference || `Financial entry #${entry.id}`),
    score: Math.max(0, Math.round(score)),
    reason: reasons.join(" "),
    dueAt: toIso(due),
    dueTimestamp: toDate(due)?.getTime() || Number.MAX_SAFE_INTEGER,
    status: String(entry.payment_status || "unpaid"),
  };
}

function sortCandidates(candidates) {
  const sorted = [...candidates];
  sorted.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.dueTimestamp !== b.dueTimestamp) return a.dueTimestamp - b.dueTimestamp;
    const aType = TYPE_ORDER[a.itemType] || 99;
    const bType = TYPE_ORDER[b.itemType] || 99;
    if (aType !== bType) return aType - bType;
    return a.itemId - b.itemId;
  });
  return sorted;
}

function normalizeRankedItems(candidates) {
  return candidates.slice(0, 3).map((candidate, index) => ({
    rank: index + 1,
    itemType: candidate.itemType,
    itemId: candidate.itemId,
    label: candidate.label,
    score: candidate.score,
    reason: candidate.reason,
    dueAt: candidate.dueAt || null,
    status: candidate.status,
  }));
}

function buildHelpActions(dossierId, hasHoldConflict) {
  const actions = [
    { action: "OPEN_TOP_TASK", intent: "READ_TASK", label: "Open top priority task" },
    {
      action: "LIST_OVERDUE_TASKS",
      intent: "LIST_OVERDUE_TASKS",
      label: "List overdue tasks in this dossier",
    },
    { action: "VIEW_CLIENT", intent: "READ_CLIENT", label: "Open related client" },
  ];
  if (hasHoldConflict) {
    actions.push({
      action: "PROPOSE_REACTIVATION",
      intent: "PROPOSE_ACTIONS",
      label: "Propose reactivation actions for this dossier",
    });
  }
  if (!dossierId) return actions;
  return actions;
}

async function safeReadList(engine, toolName, params, policy) {
  try {
    const result = await engine._callReadTool(toolName, params, policy);
    return result || {};
  } catch (err) {
    if (engine?.ledger && typeof engine.ledger.record === "function") {
      engine.ledger.record({
        type: "dossier_priorities_read_error",
        toolName,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
    return {};
  }
}

async function _executeDossierPrioritiesAnalysisIntent(
  analyzeIntent,
  message,
  context,
  policy,
  engineContext,
) {
  const now = new Date();
  const stored = this.contextStore?.get ? this.contextStore.get(context) : null;
  const snapshot = stored?.workSnapshot || context?.workSnapshot || null;
  const dossierId = resolveDossierId(snapshot, context);

  if (!snapshot || String(snapshot?.entityType || "").toLowerCase() !== "dossier" || !dossierId) {
    return {
      intent: ANALYZE_DOSSIER_ENTITY_INTENT,
      agentVersion: policy.version,
      reasoner: "analyze-gate",
      output: {
        type: "context_suggestion",
        message: "I need an active dossier snapshot before I can rank immediate priorities.",
        entityType: "dossier",
        reason: "missing_context",
        suggestions: [],
        timestamp: new Date().toISOString(),
        confidence: 0.8,
        source: "analyze-gate",
        allowManualInput: true,
        manualInputHint: "Open a dossier first, then ask for priorities.",
      },
      needsClarification: true,
      isAnalyzeIntent: true,
    };
  }

  const urgencyBoost = computeUrgencyBoost(snapshot);
  const parent = snapshot?.parent || {};
  const deadlineRows = buildDeadlineRows(snapshot, now);

  const listParams = { dossierId, limit: 200 };
  const tasks = hasChildScope(snapshot, "tasks")
    ? (await safeReadList(this, "listTasks", listParams, policy)).tasks || []
    : [];
  const sessions = hasChildScope(snapshot, "sessions")
    ? (await safeReadList(this, "listSessions", listParams, policy)).sessions || []
    : [];
  const lawsuits = hasChildScope(snapshot, "lawsuits")
    ? (await safeReadList(this, "listLawsuits", listParams, policy)).lawsuits || []
    : [];
  const financialEntries = hasChildScope(snapshot, "financial_entries")
    ? (await safeReadList(this, "listFinancialEntries", listParams, policy)).financialEntries || []
    : [];

  const candidates = [];
  for (const task of tasks) {
    const row = buildTaskCandidate(task, now, urgencyBoost);
    if (row) candidates.push(row);
  }
  for (const session of sessions) {
    const row = buildSessionCandidate(session, now, urgencyBoost);
    if (row) candidates.push(row);
  }
  for (const lawsuit of lawsuits) {
    const row = buildLawsuitHearingCandidate(lawsuit, now, urgencyBoost);
    if (row) candidates.push(row);
  }
  for (const entry of financialEntries) {
    const row = buildFinancialCandidate(entry, now, urgencyBoost);
    if (row) candidates.push(row);
  }

  const sorted = sortCandidates(candidates);
  const priorityRanking = normalizeRankedItems(sorted);

  const snapshotDeadlineDays = daysDelta(snapshot?.aggregates?.deadline?.dateValue, now);
  const onHold = HOLD_STATUSES.has(String(parent?.status || "").toLowerCase());
  const conflicts = [];
  if (onHold && snapshotDeadlineDays !== null && snapshotDeadlineDays <= 3) {
    conflicts.push({
      code: "HOLD_WITH_NEAR_DEADLINE",
      severity: "high",
      message: "Dossier is on hold while deadline is overdue or within 3 days.",
    });
  }

  const overdueByType = {
    tasks: Number(snapshot?.aggregates?.tasks?.overdue || 0),
    sessions: 0,
    hearings: 0,
    lawsuits: 0,
    financial_entries: Number(snapshot?.aggregates?.financial?.overdueReceivables || 0),
  };
  const overdueTotal =
    overdueByType.tasks +
    overdueByType.sessions +
    overdueByType.hearings +
    overdueByType.lawsuits +
    overdueByType.financial_entries;

  const top = priorityRanking[0] || null;
  const recommendation = top
    ? {
        action: "FOCUS_TOP_PRIORITY",
        targetType: top.itemType,
        targetId: top.itemId,
        reason: top.reason,
      }
    : {
        action: "REVIEW_DOSSIER_STATUS",
        targetType: "dossier",
        targetId: dossierId,
        reason: "No urgent scoped items detected; review dossier status and timeline.",
      };

  const counts = {};
  if (hasChildScope(snapshot, "tasks")) {
    counts.tasks = Number(snapshot?.aggregates?.tasks?.total || 0);
  }
  if (hasChildScope(snapshot, "sessions")) {
    counts.sessions = Number(snapshot?.aggregates?.sessions?.total || 0);
  }
  if (hasChildScope(snapshot, "hearings")) {
    counts.hearings = Number(snapshot?.aggregates?.hearings?.upcoming || 0);
  }
  if (hasChildScope(snapshot, "lawsuits")) {
    counts.lawsuits = Number(snapshot?.aggregates?.lawsuits?.total || 0);
  }
  if (hasChildScope(snapshot, "financial_entries")) {
    counts.financial_entries = Number(snapshot?.aggregates?.financial?.total || 0);
  }

  const output = {
    type: "dossier_priorities_analysis",
    dossier: {
      id: Number(parent.id || dossierId),
      reference: String(parent.reference || ""),
      title: String(parent.title || "Untitled"),
      status: String(parent.status || "open"),
      priority: String(parent.priority || "medium"),
    },
    counts,
    deadlines: deadlineRows,
    overdue: {
      total: overdueTotal,
      byType: overdueByType,
    },
    conflicts,
    priorityRanking,
    recommendation,
    can_help_with: buildHelpActions(dossierId, conflicts.length > 0),
    snapshot: {
      snapshotAt: toIso(snapshot?.snapshotAt) || new Date().toISOString(),
      scopeType: "dossier",
      scopeId: dossierId,
    },
    timestamp: new Date().toISOString(),
    source: "deterministic-analyze-gate",
    requires_validation: false,
  };

  this._validateContract("dossier_priorities_analysis", output, {
    intent: ANALYZE_DOSSIER_ENTITY_INTENT,
  });

  this.ledger.record({
    type: "dossier_priorities_analysis_generated",
    dossierId,
    rankedCount: priorityRanking.length,
    overdueTotal,
    conflicts: conflicts.length,
    timestamp: new Date().toISOString(),
  });

  return {
    intent: ANALYZE_DOSSIER_ENTITY_INTENT,
    agentVersion: policy.version,
    reasoner: "analyze-gate",
    output,
    isAnalyzeIntent: true,
  };
}

module.exports = {
  _executeDossierPrioritiesAnalysisIntent,
  ANALYZE_DOSSIER_ENTITY_INTENT,
};
