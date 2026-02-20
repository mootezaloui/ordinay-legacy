"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const {
  resolveEntityDisplayLabel,
} = require("../../../../utils/entityDisplay");

const CLOSED_WORK_STATUSES = [
  "done",
  "completed",
  "cancelled",
  "closed",
];

const DEADLINE_SOURCE_PRIORITY = {
  hearing: 0,
  session: 1,
  task: 2,
  dossier: 3,
};

function parseDeadlineTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

function buildDeadlineSourceLabel(sourceType, labelValue) {
  const typeLabel =
    sourceType === "task"
      ? "Task"
      : sourceType === "hearing"
        ? "Hearing"
        : sourceType === "session"
          ? "Session"
          : "Dossier";
  const cleanedLabel = String(labelValue || "").trim();
  return cleanedLabel ? `${typeLabel} (${cleanedLabel})` : typeLabel;
}

function compareDeadlineCandidatesAsc(a, b) {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  const rankA = DEADLINE_SOURCE_PRIORITY[a.sourceType] ?? 99;
  const rankB = DEADLINE_SOURCE_PRIORITY[b.sourceType] ?? 99;
  if (rankA !== rankB) return rankA - rankB;
  const idA = Number.isFinite(a.sourceId) ? a.sourceId : Number.MAX_SAFE_INTEGER;
  const idB = Number.isFinite(b.sourceId) ? b.sourceId : Number.MAX_SAFE_INTEGER;
  if (idA !== idB) return idA - idB;
  return String(a.sourceLabel || "").localeCompare(String(b.sourceLabel || ""));
}

async function resolveDossierDeadlineFromChildren({
  dossier,
  now,
  policy,
  callReadTool,
  baseTasks = null,
  baseSessions = null,
  baseLawsuits = null,
}) {
  const lawsuits = Array.isArray(baseLawsuits)
    ? baseLawsuits
    : (await callReadTool(
        "listLawsuits",
        { dossierId: dossier.id, limit: 200 },
        policy,
      ))?.lawsuits || [];

  const tasksById = new Map();
  const sessionsById = new Map();
  const registerTask = (task) => {
    if (!task) return;
    const key = task.id ?? `task:${task.title || ""}:${task.due_date || ""}`;
    tasksById.set(key, task);
  };
  const registerSession = (session) => {
    if (!session) return;
    const key =
      session.id ??
      `session:${session.title || ""}:${session.scheduled_at || session.session_date || ""}`;
    sessionsById.set(key, session);
  };

  const directTasks = Array.isArray(baseTasks)
    ? baseTasks
    : (await callReadTool(
        "listTasks",
        { dossierId: dossier.id, limit: 200 },
        policy,
      ))?.tasks || [];
  directTasks.forEach(registerTask);

  const directSessions = Array.isArray(baseSessions)
    ? baseSessions
    : (await callReadTool(
        "listSessions",
        { dossierId: dossier.id, limit: 200 },
        policy,
      ))?.sessions || [];
  directSessions.forEach(registerSession);

  for (const lawsuit of lawsuits) {
    const lawsuitId = Number(lawsuit?.id || 0);
    if (!lawsuitId) continue;

    const lawsuitTasksResult = await callReadTool(
      "listTasks",
      { lawsuitId, limit: 200 },
      policy,
    );
    (lawsuitTasksResult?.tasks || []).forEach(registerTask);

    const lawsuitSessionsResult = await callReadTool(
      "listSessions",
      { lawsuitId, limit: 200 },
      policy,
    );
    (lawsuitSessionsResult?.sessions || []).forEach(registerSession);
  }

  const candidates = [];
  const addCandidate = ({ dateValue, sourceType, sourceId, sourceLabel }) => {
    const timestamp = parseDeadlineTimestamp(dateValue);
    if (timestamp === null) return;
    candidates.push({
      timestamp,
      dateValue,
      sourceType,
      sourceId: Number(sourceId),
      sourceLabel,
    });
  };

  for (const task of tasksById.values()) {
    const status = String(task.status || "").toLowerCase();
    if (CLOSED_WORK_STATUSES.includes(status)) continue;
    if (!task.due_date) continue;
    addCandidate({
      dateValue: task.due_date,
      sourceType: "task",
      sourceId: task.id,
      sourceLabel: buildDeadlineSourceLabel("task", task.title),
    });
  }

  for (const session of sessionsById.values()) {
    const status = String(session.status || "").toLowerCase();
    if (CLOSED_WORK_STATUSES.includes(status)) continue;
    const sessionDate = session.scheduled_at || session.session_date;
    if (!sessionDate) continue;
    const sessionLabel = String(
      session.title || session.session_type || "",
    ).trim();
    const labelText = sessionLabel.toLowerCase();
    const isHearing =
      labelText.includes("hearing") ||
      labelText.includes("\u062c\u0644\u0633\u0629");
    const sourceType = isHearing ? "hearing" : "session";
    addCandidate({
      dateValue: sessionDate,
      sourceType,
      sourceId: session.id,
      sourceLabel: buildDeadlineSourceLabel(sourceType, sessionLabel),
    });
  }

  for (const lawsuit of lawsuits) {
    if (!lawsuit?.next_hearing) continue;
    const status = String(lawsuit.status || "").toLowerCase();
    if (CLOSED_WORK_STATUSES.includes(status)) continue;
    addCandidate({
      dateValue: lawsuit.next_hearing,
      sourceType: "hearing",
      sourceId: lawsuit.id,
      sourceLabel: buildDeadlineSourceLabel(
        "hearing",
        lawsuit.title || lawsuit.reference || lawsuit.lawsuit_number,
      ),
    });
  }

  const nowTimestamp =
    now instanceof Date && !Number.isNaN(now.getTime())
      ? now.getTime()
      : Date.now();
  const orderedAsc = candidates.slice().sort(compareDeadlineCandidatesAsc);
  const upcoming = orderedAsc.find((candidate) => candidate.timestamp >= nowTimestamp);
  if (upcoming) {
    return {
      status: "upcoming",
      timestamp: upcoming.timestamp,
      dateValue: upcoming.dateValue,
      sourceType: upcoming.sourceType,
      sourceLabel: upcoming.sourceLabel,
      hasChildDeadlines: true,
    };
  }

  if (orderedAsc.length > 0) {
    const overdueCandidate = orderedAsc[orderedAsc.length - 1];
    return {
      status: "overdue",
      timestamp: overdueCandidate.timestamp,
      dateValue: overdueCandidate.dateValue,
      sourceType: overdueCandidate.sourceType,
      sourceLabel: overdueCandidate.sourceLabel,
      hasChildDeadlines: true,
    };
  }

  const dossierDeadlineTimestamp = parseDeadlineTimestamp(dossier?.next_deadline);
  if (dossierDeadlineTimestamp !== null) {
    return {
      status: dossierDeadlineTimestamp < nowTimestamp ? "overdue" : "upcoming",
      timestamp: dossierDeadlineTimestamp,
      dateValue: dossier.next_deadline,
      sourceType: "dossier",
      sourceLabel: buildDeadlineSourceLabel("dossier", null),
      hasChildDeadlines: false,
    };
  }

  return {
    status: "none",
    timestamp: null,
    dateValue: null,
    sourceType: null,
    sourceLabel: null,
    hasChildDeadlines: false,
  };
}

function formatResolvedNextDeadlineLine(resolvedDeadline, formatDate) {
  if (!resolvedDeadline || resolvedDeadline.status === "none") {
    return "Next deadline: not set";
  }
  const dateLabel = formatDate(resolvedDeadline.dateValue);
  const overdueSuffix = resolvedDeadline.status === "overdue" ? " (overdue)" : "";
  return `Next deadline: ${dateLabel} - ${resolvedDeadline.sourceLabel}${overdueSuffix}`;
}

function formatResolvedDeadlineRiskFragment(resolvedDeadline, formatDate) {
  if (!resolvedDeadline || resolvedDeadline.status === "none") return "no deadline";
  const dateLabel = formatDate(resolvedDeadline.dateValue);
  const overdueSuffix = resolvedDeadline.status === "overdue" ? " (overdue)" : "";
  return `next deadline ${dateLabel} - ${resolvedDeadline.sourceLabel}${overdueSuffix}`;
}

function applyResolvedDeadlineToDossier(dossier, resolvedDeadline) {
  if (!dossier || typeof dossier !== "object") return dossier;
  if (!resolvedDeadline || !resolvedDeadline.dateValue) return dossier;
  return {
    ...dossier,
    next_deadline: resolvedDeadline.dateValue,
    next_deadline_source: resolvedDeadline.sourceType,
  };
}

function isWorkSnapshotRefreshRequest(message) {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;
  if (/\b(refresh|reload)\b/i.test(normalized)) return true;
  return /\bupdate\b\s+(?:the\s+)?(?:snapshot|work\s+snapshot|dossier\s+snapshot|dossier|work\s+mode)\b/i.test(
    normalized,
  );
}

function isClosedWorkStatus(status) {
  return CLOSED_WORK_STATUSES.includes(String(status || "").toLowerCase());
}

function isHearingSession(session) {
  const labelText = String(
    session?.title || session?.session_type || "",
  ).toLowerCase();
  return labelText.includes("hearing") || labelText.includes("\u062c\u0644\u0633\u0629");
}

function toSnapshotDeadline(resolvedDeadline) {
  if (!resolvedDeadline || resolvedDeadline.status === "none") {
    return {
      status: "none",
      timestamp: null,
      dateValue: null,
      sourceType: null,
      sourceLabel: null,
      hasChildDeadlines: false,
    };
  }
  return {
    status: resolvedDeadline.status || "none",
    timestamp:
      typeof resolvedDeadline.timestamp === "number"
        ? resolvedDeadline.timestamp
        : parseDeadlineTimestamp(resolvedDeadline.dateValue),
    dateValue: resolvedDeadline.dateValue || null,
    sourceType: resolvedDeadline.sourceType || null,
    sourceLabel: resolvedDeadline.sourceLabel || null,
    hasChildDeadlines: Boolean(resolvedDeadline.hasChildDeadlines),
  };
}

function buildResolvedDeadlineFromSnapshot(snapshot) {
  const deadline = snapshot?.aggregates?.deadline || {};
  if (!deadline || deadline.status === "none") {
    return {
      status: "none",
      timestamp: null,
      dateValue: null,
      sourceType: null,
      sourceLabel: null,
      hasChildDeadlines: false,
    };
  }
  return {
    status: deadline.status || "none",
    timestamp:
      typeof deadline.timestamp === "number"
        ? deadline.timestamp
        : parseDeadlineTimestamp(deadline.dateValue),
    dateValue: deadline.dateValue || null,
    sourceType: deadline.sourceType || null,
    sourceLabel: deadline.sourceLabel || null,
    hasChildDeadlines: Boolean(deadline.hasChildDeadlines),
  };
}

function buildDossierViewFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (!snapshot.parent || typeof snapshot.parent !== "object") return null;
  return { ...snapshot.parent };
}

function buildWorkContextFromSnapshot(snapshot) {
  const taskSummary = snapshot?.aggregates?.tasks || {};
  const sessionSummary = snapshot?.aggregates?.sessions || {};
  const hearingSummary = snapshot?.aggregates?.hearings || {};
  const financialSummary = snapshot?.aggregates?.financial || {};
  const lawsuitSummary = snapshot?.aggregates?.lawsuits || {};
  const missionSummary = snapshot?.aggregates?.missions || {};
  const documentSummary = snapshot?.aggregates?.documents || {};
  const workloadSummary = snapshot?.aggregates?.workload || {};
  return {
    urgency: String(workloadSummary.urgency || "normal").toLowerCase(),
    totalTasks: Number(taskSummary.total || 0),
    activeTasks: Number(taskSummary.active || 0),
    overdueTasks: Number(taskSummary.overdue || 0),
    blockedTasks: Number(taskSummary.blocked || 0),
    totalSessions: Number(sessionSummary.total || 0),
    upcomingSessions: Number(sessionSummary.upcoming || 0),
    upcomingHearings: Number(hearingSummary.upcoming || 0),
    totalFinancialEntries: Number(financialSummary.total || 0),
    overdueReceivables: Number(financialSummary.overdueReceivables || 0),
    totalLawsuits: Number(lawsuitSummary.total || 0),
    totalMissions: Number(missionSummary.total || 0),
    totalDocuments: Number(documentSummary.total || 0),
  };
}

function applySnapshotWorkSummary(snapshot, applyDossierWorkSummary) {
  if (!snapshot || typeof applyDossierWorkSummary !== "function") return;
  const workContext = buildWorkContextFromSnapshot(snapshot);
  applyDossierWorkSummary({
    dossierId: Number(snapshot.entityId || snapshot.parent?.id || 0) || null,
    tasks: {
      total: workContext.totalTasks,
      active: workContext.activeTasks,
      overdue: workContext.overdueTasks,
    },
    sessions: {
      total: workContext.totalSessions,
    },
  });
}

function isDossierSnapshotComplete(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (!snapshot.parent || typeof snapshot.parent !== "object") return false;
  if (!snapshot.aggregates || typeof snapshot.aggregates !== "object")
    return false;
  if (!snapshot.aggregates.tasks || !snapshot.aggregates.sessions) return false;
  if (!snapshot.aggregates.deadline || !snapshot.aggregates.workload)
    return false;
  return true;
}

function normalizeSnapshotIdentity(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const dossierId =
    snapshot.entityId ?? snapshot.scope?.dossierId ?? snapshot.parent?.id ?? null;
  const reference = snapshot.parent?.reference
    ? String(snapshot.parent.reference).trim()
    : "";
  const title = snapshot.parent?.title ? String(snapshot.parent.title).trim() : "";
  return {
    dossierId: dossierId !== null && dossierId !== undefined ? Number(dossierId) : null,
    referenceLower: reference ? reference.toLowerCase() : "",
    titleLower: title ? title.toLowerCase() : "",
  };
}

function requestTargetsDifferentSnapshot(snapshot, request) {
  const identity = normalizeSnapshotIdentity(snapshot);
  if (!identity || !identity.dossierId) return false;

  if (request?.targetId && Number(request.targetId) !== identity.dossierId) {
    return true;
  }

  if (request?.hintRef) {
    const hintRefLower = String(request.hintRef).toLowerCase().trim();
    if (!identity.referenceLower || hintRefLower !== identity.referenceLower) {
      return true;
    }
  }

  if (request?.hintName) {
    const hintNameLower = String(request.hintName).toLowerCase().trim();
    const matchesTitle =
      identity.titleLower && hintNameLower === identity.titleLower;
    const matchesReference =
      identity.referenceLower && hintNameLower === identity.referenceLower;
    if (!matchesTitle && !matchesReference) {
      return true;
    }
  }

  return false;
}

async function buildDossierWorkSnapshot({
  dossier,
  now,
  policy,
  callReadTool,
  safeReadSummaryTool,
  isFinancialOverdue,
  refreshReason = "entry",
}) {
  const tasksResult = await callReadTool(
    "listTasks",
    { dossierId: dossier.id, limit: 200 },
    policy,
  );
  const tasks = tasksResult?.tasks || [];

  const sessionsResult = await callReadTool(
    "listSessions",
    { dossierId: dossier.id, limit: 200 },
    policy,
  );
  const sessions = sessionsResult?.sessions || [];

  const missionsResult = await callReadTool(
    "listMissions",
    { dossierId: dossier.id, limit: 200 },
    policy,
  );
  const missions = missionsResult?.missions || [];

  const financialResult = await callReadTool(
    "listFinancialEntries",
    { dossierId: dossier.id, limit: 200 },
    policy,
  );
  const financialEntries = financialResult?.financialEntries || [];

  const lawsuitsResult = await callReadTool(
    "listLawsuits",
    { dossierId: dossier.id, limit: 200 },
    policy,
  );
  const lawsuits = lawsuitsResult?.lawsuits || [];

  const historyResult = await callReadTool(
    "listHistoryEvents",
    { entityType: "dossier", entityId: dossier.id, limit: 5 },
    policy,
  );
  const historyEvents = historyResult?.historyEvents || [];
  const documentResult = await callReadTool(
    "listDocuments",
    { dossierId: dossier.id, limit: 200 },
    policy,
  );
  const documents = documentResult?.documents || [];

  const resolvedDeadline = await resolveDossierDeadlineFromChildren({
    dossier,
    now,
    policy,
    callReadTool,
    baseTasks: tasks,
    baseSessions: sessions,
    baseLawsuits: lawsuits,
  });
  const dossierView = applyResolvedDeadlineToDossier(dossier, resolvedDeadline);

  const activeTasks = tasks.filter((task) => !isClosedWorkStatus(task.status));
  const overdueTasks = tasks.filter(
    (task) =>
      task.due_date &&
      !["done", "completed", "cancelled", "closed"].includes(
        String(task.status || "").toLowerCase(),
      ) &&
      new Date(task.due_date) < now,
  );
  const blockedTasks = tasks.filter(
    (task) => String(task.status || "").toLowerCase() === "blocked",
  );
  const upcomingSessions = sessions.filter((session) => {
    if (isClosedWorkStatus(session.status)) return false;
    const sessionDate = session.scheduled_at || session.session_date;
    if (!sessionDate) return false;
    const date = new Date(sessionDate);
    if (Number.isNaN(date.getTime())) return false;
    return date >= now;
  });
  const upcomingHearingSessions = upcomingSessions.filter((session) =>
    isHearingSession(session),
  );
  const upcomingLawsuitHearings = lawsuits.filter((lawsuit) => {
    if (isClosedWorkStatus(lawsuit.status)) return false;
    if (!lawsuit.next_hearing) return false;
    const hearingDate = new Date(lawsuit.next_hearing);
    if (Number.isNaN(hearingDate.getTime())) return false;
    return hearingDate >= now;
  });
  const overdueReceivables = financialEntries.filter(
    (entry) =>
      String(entry.direction || "").toLowerCase() === "receivable" &&
      isFinancialOverdue(entry),
  );
  const normalizedPriority = String(dossierView.priority || "").toLowerCase();
  const deadlineOverdue = resolvedDeadline.status === "overdue";
  let urgency = "normal";
  if (
    blockedTasks.length > 0 ||
    overdueTasks.length > 0 ||
    deadlineOverdue
  ) {
    urgency = "critical";
  } else if (
    normalizedPriority === "urgent" ||
    normalizedPriority === "high" ||
    (dossierView.next_deadline &&
      Math.ceil((new Date(dossierView.next_deadline) - now) / (1000 * 60 * 60 * 24)) <=
        7)
  ) {
    urgency = "high";
  }

  let clientLabel = "N/A";
  if (dossierView.client_id) {
    const clientResult = await safeReadSummaryTool("getClient", {
      clientId: dossierView.client_id,
    });
    clientLabel = clientResult?.client
      ? resolveEntityDisplayLabel("client", clientResult.client, {
          fallback: "Client",
        })
      : "Client";
  }

  const workSummaryResult = await safeReadSummaryTool("getDossierWorkSummary", {
    dossierId: dossierView.id,
  });
  const taskTotalsFromTool = Number(workSummaryResult?.tasks?.total || tasks.length);
  const taskActiveFromTool = Number(workSummaryResult?.tasks?.active || activeTasks.length);
  const taskOverdueFromTool = Number(
    workSummaryResult?.tasks?.overdue || overdueTasks.length,
  );
  const sessionTotalsFromTool = Number(
    workSummaryResult?.sessions?.total || sessions.length,
  );

  return {
    snapshotType: "dossier_work_snapshot",
    entityType: "dossier",
    entityId: Number(dossierView.id),
    snapshotAt: new Date().toISOString(),
    scope: {
      scopeType: "dossier",
      dossierId: Number(dossierView.id),
      childEntities: [
        "tasks",
        "sessions",
        "hearings",
        "lawsuits",
        "missions",
        "financial_entries",
        "documents",
        "history_events",
      ],
      fixed: true,
    },
    parent: {
      ...dossierView,
      clientLabel,
    },
    aggregates: {
      tasks: {
        total: taskTotalsFromTool,
        active: taskActiveFromTool,
        overdue: taskOverdueFromTool,
        blocked: blockedTasks.length,
      },
      sessions: {
        total: sessionTotalsFromTool,
        upcoming: upcomingSessions.length,
      },
      hearings: {
        upcoming:
          upcomingHearingSessions.length + upcomingLawsuitHearings.length,
      },
      lawsuits: {
        total: lawsuits.length,
      },
      missions: {
        total: missions.length,
      },
      documents: {
        total: documents.length,
      },
      financial: {
        total: financialEntries.length,
        overdueReceivables: overdueReceivables.length,
      },
      deadline: toSnapshotDeadline(resolvedDeadline),
      workload: {
        urgency,
        pressure:
          urgency === "critical" ||
          blockedTasks.length > 0 ||
          overdueTasks.length > 0 ||
          deadlineOverdue,
      },
    },
    history: {
      recent: historyEvents
        .slice(0, 5)
        .map((event) => ({
          created_at: event.created_at || null,
          action: event.action || "event",
        })),
    },
    meta: {
      refreshReason,
      stale: false,
    },
  };
}

async function handleListDossiers(state) {
  const {
    intent,
    message,
    context,
    policy,
    scope,
    entityHints,
    filters,
    aggregateFilters,
    shouldAggregateSummary,
    now,
    details,
    sources,
    ENTITY_LABELS,
    ENTITY_PLURALS,
    TASK_STATUSES,
    ACTIVE_CASE_STATUSES,
    formatDate,
    formatDateTime,
    parsePayload,
    getHintValue,
    resolveEntityQuery,
    getEntityQuery,
    resolveScopedEntityId,
    buildAggregateSummary,
    applyAggregateResult,
    applyAggregateFilters,
    normalizeValue,
    countBy,
    formatCountMap,
    isFinancialOverdue,
    isMissionOverdue,
    isSessionOverdue,
    appendDocumentDetails,
    safeReadSummaryTool,
    applyClientDossierSummary,
    applyDossierWorkSummary,
  } = state;
  let { data, title, summary } = state;

  do {
    let clientId = scope === "client" ? context?.clientId : null;
    if (!clientId) {
      const hintClientId = getHintValue("id", "client");
      if (hintClientId) clientId = hintClientId;
    }
    if (!clientId) {
      const hintClientName = getHintValue("name", "client");
      if (hintClientName) {
        const resolution = await this._resolveEntity(
          { type: "client", nameHint: hintClientName },
          policy,
        );
        if (resolution.resolved) {
          clientId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Dossiers";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Client"}`),
          );
          details.push("Please specify which client you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Dossiers";
          summary = resolution.message;
          details.push("Try listing clients to see available records.");
          break;
        }
      }
    }
    const { dossiers } = await this._callReadTool(
      "listDossiers",
      {
        limit: 50,
        clientId,
        status: filters?.status || null,
        query: filters?.query || null,
      },
      policy,
    );
    data = dossiers;
    title = "Read data — Dossiers";
    summary =
      dossiers.length > 0
        ? `Found ${dossiers.length} dossier(s)`
        : "No dossiers found";
    dossiers.forEach((d) => {
      details.push(
        `${d.reference || "Dossier"} — ${d.title || "Untitled"} (${d.status || "open"}, ${d.priority || "medium"})`,
      );
    });
    if (details.length === 0) {
      details.push("Dossier list is empty for the current scope.");
    }
    sources.push({
      sourceType: "system",
      reference: "tool:listDossiers",
      note: "Dossier list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadDossier(state) {
  const {
    message,
    context,
    policy,
    scope,
    entityHints,
    now,
    details,
    sources,
    formatDate,
    isFinancialOverdue,
    appendDocumentDetails,
    safeReadSummaryTool,
    applyDossierWorkSummary,
    workSnapshot,
    snapshotRefreshRequested,
    setWorkSnapshotEvent,
  } = state;
  let { data, title, summary } = state;
  const callReadTool = this._callReadTool.bind(this);

  do {
    const activeSnapshot =
      workSnapshot &&
      String(workSnapshot.entityType || "").toLowerCase() === "dossier"
        ? workSnapshot
        : null;
    const refreshRequested = Boolean(
      snapshotRefreshRequested || isWorkSnapshotRefreshRequest(message),
    );
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintRef = entityHints.find(
      (hint) => hint.type === "reference",
    )?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    const scopedId = scope === "dossier" ? context?.dossierId : null;
    const targetId = hintId || scopedId || null;
    title = "Read data — Dossier";

    if (
      activeSnapshot &&
      requestTargetsDifferentSnapshot(activeSnapshot, {
        targetId,
        hintRef,
        hintName,
      })
    ) {
      summary = "Scope change requires confirmation.";
      details.push(
        `Active Work Snapshot: ${resolveEntityDisplayLabel("dossier", activeSnapshot.parent || {}, { fallback: "Dossier" })}`,
      );
      details.push(
        "Scope stability is enforced in Dossier Work Mode. Confirm before switching to another dossier snapshot.",
      );
      applySnapshotWorkSummary(activeSnapshot, applyDossierWorkSummary);
      data = buildDossierViewFromSnapshot(activeSnapshot);
      break;
    }

    let snapshot = activeSnapshot;
    let refreshReason = null;

    if (!snapshot || refreshRequested || snapshot?.meta?.stale) {
      let dossier = null;
      let lookupSource = "tool:getDossier";

      if (hintId || scopedId || snapshot?.entityId) {
        const dossierId = hintId || scopedId || snapshot?.entityId;
        const result = await this._callReadTool("getDossier", { dossierId }, policy);
        dossier = result?.dossier || null;
      } else if (hintRef) {
        const result = await this._callReadTool(
          "getDossierByReference",
          { reference: hintRef },
          policy,
        );
        dossier = result?.dossier || null;
        lookupSource = "tool:getDossierByReference";
      } else if (hintName) {
        const result = await this._callReadTool(
          "listDossiers",
          { query: hintName, limit: 10 },
          policy,
        );
        const dossiers = result?.dossiers || [];
        if (dossiers.length === 0) {
          summary = `No dossier found for "${hintName}"`;
          details.push("Try listing all dossiers with: show me my dossiers");
          break;
        }
        if (dossiers.length > 1) {
          summary = `Multiple dossiers match "${hintName}"`;
          dossiers.forEach((d) =>
            details.push(`${d.reference || "Dossier"} — ${d.title || "Untitled"}`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        }
        dossier = dossiers[0];
        lookupSource = "tool:listDossiers";
      } else {
        summary = "Which dossier?";
        details.push("Provide a dossier reference or name.");
        break;
      }

      if (!dossier) {
        if (activeSnapshot) {
          summary = "I could not refresh the dossier snapshot right now.";
          details.push(
            "I will keep the previous dossier snapshot facts stable until refresh succeeds.",
          );
          details.push(
            "Please verify record availability and say \"refresh dossier\" again.",
          );
          applySnapshotWorkSummary(activeSnapshot, applyDossierWorkSummary);
          data = buildDossierViewFromSnapshot(activeSnapshot);
        } else {
          summary = "No dossier found for the provided identifier.";
          details.push("Try listing dossiers to see available records.");
        }
        break;
      }

      refreshReason = !activeSnapshot
        ? "entry"
        : refreshRequested
          ? "user_requested"
          : "mutation";

      snapshot = await buildDossierWorkSnapshot({
        dossier,
        now,
        policy,
        callReadTool,
        safeReadSummaryTool,
        isFinancialOverdue,
        refreshReason,
      });

      if (typeof setWorkSnapshotEvent === "function") {
        setWorkSnapshotEvent({
          action: activeSnapshot ? "refresh" : "set",
          reason: refreshReason,
          snapshot,
        });
      }

      sources.push({
        sourceType: "system",
        reference: lookupSource,
        note: activeSnapshot ? "Dossier snapshot refreshed" : "Dossier snapshot created",
      });
    } else {
      sources.push({
        sourceType: "context",
        reference: "work_snapshot:dossier",
        note: "Dossier snapshot reused",
      });
    }

    if (!isDossierSnapshotComplete(snapshot)) {
      summary = "Dossier Work Snapshot is incomplete.";
      details.push(
        "I will keep prior snapshot facts stable. Say \"refresh dossier\" to reload complete dossier context.",
      );
      applySnapshotWorkSummary(snapshot, applyDossierWorkSummary);
      data = buildDossierViewFromSnapshot(snapshot);
      break;
    }

    const dossierView = buildDossierViewFromSnapshot(snapshot);
    const resolvedDeadline = buildResolvedDeadlineFromSnapshot(snapshot);
    const workContext = buildWorkContextFromSnapshot(snapshot);
    const deadlineOverdue = resolvedDeadline.status === "overdue";

    applySnapshotWorkSummary(snapshot, applyDossierWorkSummary);

    summary = `Dossier Work Mode: ${resolveEntityDisplayLabel("dossier", dossierView, { fallback: "Dossier" })}`;
    if (refreshReason === "user_requested" || refreshReason === "mutation") {
      details.push("I've refreshed the dossier snapshot to reflect recent changes.");
    }
    details.push(`Snapshot timestamp: ${snapshot.snapshotAt}`);
    details.push(
      `Snapshot scope: dossier #${snapshot.entityId} (tasks, sessions, hearings, documents, deadline, workload fixed)`,
    );
    details.push(`Title: ${dossierView?.title || "Untitled"}`);
    details.push(`Status: ${dossierView?.status || "open"}`);
    details.push(`Priority: ${dossierView?.priority || "medium"}`);
    details.push(`Client: ${dossierView?.clientLabel || "N/A"}`);
    details.push(`Phase: ${dossierView?.phase || "not set"}`);
    details.push(formatResolvedNextDeadlineLine(resolvedDeadline, formatDate));
    details.push(`Urgency: ${workContext.urgency}`);
    details.push(
      `Workload: ${workContext.totalTasks} task(s), ${workContext.activeTasks} active, ${workContext.overdueTasks} overdue, ${workContext.totalSessions} session(s)`,
    );
    details.push(
      `Upcoming: ${workContext.upcomingSessions} upcoming session(s), ${workContext.upcomingHearings} upcoming hearing(s)`,
    );
    details.push(
      "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
    );
    data = dossierView;
    await appendDocumentDetails("dossier", dossierView);
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainDossier(state) {
  const {
    intent,
    message,
    context,
    policy,
    scope,
    entityHints,
    shouldAggregateSummary,
    now,
    details,
    sources,
    formatDate,
    formatDateTime,
    buildAggregateSummary,
    applyAggregateResult,
    isFinancialOverdue,
    appendDocumentDetails,
    safeReadSummaryTool,
    applyDossierWorkSummary,
    workSnapshot,
    snapshotRefreshRequested,
    setWorkSnapshotEvent,
  } = state;
  let { data, title, summary } = state;
  const callReadTool = this._callReadTool.bind(this);

  do {
    const activeSnapshot =
      workSnapshot &&
      String(workSnapshot.entityType || "").toLowerCase() === "dossier"
        ? workSnapshot
        : null;
    const refreshRequested = Boolean(
      snapshotRefreshRequested || isWorkSnapshotRefreshRequest(message),
    );
    const scopedId = scope === "dossier" ? context?.dossierId : null;
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintRef = entityHints.find(
      (hint) => hint.type === "reference",
    )?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_DOSSIER && shouldAggregateSummary) {
      if (activeSnapshot) {
        summary = "A broader scope was requested while Work Snapshot is active.";
        details.push(
          "Current dossier snapshot scope is fixed. Confirm before switching to aggregate dossier scope.",
        );
        applySnapshotWorkSummary(activeSnapshot, applyDossierWorkSummary);
        data = buildDossierViewFromSnapshot(activeSnapshot);
        break;
      }
      const aggregateResult = await buildAggregateSummary("dossier");
      if (applyAggregateResult(aggregateResult)) break;
    }

    if (
      activeSnapshot &&
      requestTargetsDifferentSnapshot(activeSnapshot, {
        targetId,
        hintRef,
        hintName,
      })
    ) {
      summary = "Scope change requires confirmation.";
      details.push(
        `Active Work Snapshot: ${resolveEntityDisplayLabel("dossier", activeSnapshot.parent || {}, { fallback: "Dossier" })}`,
      );
      details.push(
        "Scope stability is enforced in Dossier Work Mode. Confirm before switching to another dossier snapshot.",
      );
      applySnapshotWorkSummary(activeSnapshot, applyDossierWorkSummary);
      data = buildDossierViewFromSnapshot(activeSnapshot);
      break;
    }

    let snapshot = activeSnapshot;
    let refreshReason = null;

    if (!snapshot || refreshRequested || snapshot?.meta?.stale) {
      let dossier = null;
      let lookupSource = "tool:getDossier";

      if (hintId || scopedId || snapshot?.entityId) {
        const dossierId = hintId || scopedId || snapshot?.entityId;
        const result = await this._callReadTool("getDossier", { dossierId }, policy);
        dossier = result?.dossier || null;
      } else if (hintRef) {
        const result = await this._callReadTool(
          "getDossierByReference",
          { reference: hintRef },
          policy,
        );
        dossier = result?.dossier || null;
        lookupSource = "tool:getDossierByReference";
      } else if (hintName) {
        const result = await this._callReadTool(
          "listDossiers",
          { query: hintName, limit: 5 },
          policy,
        );
        const dossiers = result?.dossiers || [];
        if (dossiers.length === 0) {
          summary = `No dossier found for "${hintName}"`;
          details.push("Try listing all dossiers with: show me my dossiers");
          break;
        }
        if (dossiers.length > 1) {
          summary = `Multiple dossiers match "${hintName}"`;
          dossiers.forEach((d) =>
            details.push(`${d.reference || "Dossier"} — ${d.title || "Untitled"}`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        }
        dossier = dossiers[0];
        lookupSource = "tool:listDossiers";
      } else {
        summary = "Which dossier?";
        details.push("Provide a dossier reference or name.");
        break;
      }

      if (!dossier) {
        if (activeSnapshot) {
          summary = "I could not refresh the dossier snapshot right now.";
          details.push(
            "I will keep the previous dossier snapshot facts stable until refresh succeeds.",
          );
          details.push(
            "Please verify record availability and say \"refresh dossier\" again.",
          );
          applySnapshotWorkSummary(activeSnapshot, applyDossierWorkSummary);
          data = buildDossierViewFromSnapshot(activeSnapshot);
        } else {
          summary = "Which dossier?";
          details.push("Provide a dossier reference or name.");
        }
        break;
      }

      refreshReason = !activeSnapshot
        ? "entry"
        : refreshRequested
          ? "user_requested"
          : "mutation";

      snapshot = await buildDossierWorkSnapshot({
        dossier,
        now,
        policy,
        callReadTool,
        safeReadSummaryTool,
        isFinancialOverdue,
        refreshReason,
      });

      if (typeof setWorkSnapshotEvent === "function") {
        setWorkSnapshotEvent({
          action: activeSnapshot ? "refresh" : "set",
          reason: refreshReason,
          snapshot,
        });
      }

      sources.push({
        sourceType: "system",
        reference: lookupSource,
        note: activeSnapshot ? "Dossier snapshot refreshed" : "Dossier snapshot created",
      });
    } else {
      sources.push({
        sourceType: "context",
        reference: "work_snapshot:dossier",
        note: "Dossier snapshot reused",
      });
    }

    if (!isDossierSnapshotComplete(snapshot)) {
      summary = "Dossier Work Snapshot is incomplete.";
      details.push(
        "I will keep prior snapshot facts stable. Say \"refresh dossier\" to reload complete dossier context.",
      );
      applySnapshotWorkSummary(snapshot, applyDossierWorkSummary);
      data = buildDossierViewFromSnapshot(snapshot);
      break;
    }

    const dossierView = buildDossierViewFromSnapshot(snapshot);
    const resolvedDeadline = buildResolvedDeadlineFromSnapshot(snapshot);
    const workContext = buildWorkContextFromSnapshot(snapshot);
    const deadlineOverdue = resolvedDeadline.status === "overdue";
    const recentActivity = (snapshot?.history?.recent || []).map((event) => {
      const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
      return `${when} — ${event.action || "event"}`;
    });

    applySnapshotWorkSummary(snapshot, applyDossierWorkSummary);

    if (intent === READ_INTENTS.EXPLAIN_DOSSIER_STATE) {
      title = "Read data — Dossier state";
      summary = `Dossier Work Mode: ${dossierView.reference || "Dossier"} — ${dossierView.title || "Untitled"}`;
      if (refreshReason === "user_requested" || refreshReason === "mutation") {
        details.push("I've refreshed the dossier snapshot to reflect recent changes.");
      }
      details.push(`Snapshot timestamp: ${snapshot.snapshotAt}`);
      details.push(
        `Snapshot scope: dossier #${snapshot.entityId} (tasks, sessions, hearings, documents, deadline, workload fixed)`,
      );
      details.push(
        `Status: ${dossierView.status || "open"} (priority ${dossierView.priority || "medium"})`,
      );
      details.push(
        `Phase: ${dossierView.phase || "not set"} • Assignment: ${dossierView.assigned_lawyer || "unassigned"} • Urgency: ${workContext.urgency}`,
      );
      details.push(
      `Relationships: ${workContext.totalLawsuits} lawsuit(s), ${workContext.totalTasks} task(s), ${workContext.totalSessions} session(s), ${workContext.totalMissions} mission(s), ${workContext.totalFinancialEntries} financial entry(ies), ${workContext.totalDocuments} document(s)`,
      );
      details.push(
        workContext.blockedTasks > 0 ||
          workContext.overdueTasks > 0 ||
          deadlineOverdue ||
          workContext.overdueReceivables > 0
          ? `Blocking: ${workContext.blockedTasks} blocked task(s), ${workContext.overdueTasks} overdue task(s), ${workContext.overdueReceivables} overdue receivable(s), ${deadlineOverdue ? "deadline overdue" : "deadline ok"}`
          : "Blocking: none detected",
      );
      details.push(
        "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
      );
      sources.push({
        sourceType: "context",
        reference: "work_snapshot:dossier",
        note: "Dossier state from stable snapshot",
      });
      data = dossierView;
      await appendDocumentDetails("dossier", dossierView);
      break;
    }

    title = "Read data — Dossier summary";
    summary = `Dossier Work Mode: ${dossierView.reference || "Dossier"} — ${dossierView.title || "Untitled"}`;
    if (refreshReason === "user_requested" || refreshReason === "mutation") {
      details.push("I've refreshed the dossier snapshot to reflect recent changes.");
    }
    details.push(`Snapshot timestamp: ${snapshot.snapshotAt}`);
    details.push(
      `Snapshot scope: dossier #${snapshot.entityId} (tasks, sessions, hearings, documents, deadline, workload fixed)`,
    );
    details.push(
      `Summary: status ${dossierView.status || "open"}, ${workContext.totalTasks} task(s), ${workContext.totalSessions} session(s), ${workContext.totalFinancialEntries} financial entry(ies), ${workContext.totalDocuments} document(s)`,
    );
    details.push(
      `Phase: ${dossierView.phase || "not set"} • Assignment: ${dossierView.assigned_lawyer || "unassigned"} • Urgency: ${workContext.urgency}`,
    );
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(
      `Key dates/risks: ${formatResolvedDeadlineRiskFragment(resolvedDeadline, formatDate)}${
        workContext.overdueReceivables > 0
          ? `, ${workContext.overdueReceivables} overdue receivable(s)`
          : ""
      }`,
    );
    details.push(
      "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
    );
    sources.push({
      sourceType: "context",
      reference: "work_snapshot:dossier",
      note: "Dossier summary from stable snapshot",
    });
    data = dossierView;
    await appendDocumentDetails("dossier", dossierView);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListDossiers,
  handleReadDossier,
  handleExplainDossier,
};
