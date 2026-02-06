"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const {
  resolveEntityDisplayLabel,
} = require("../../../../utils/entityDisplay");

function buildDossierAssistiveRecommendation({
  urgency,
  activeTasks,
  overdueTasks,
  totalTasks,
  totalSessions,
  blockedTasks = 0,
  deadlineOverdue = false,
}) {
  const normalizedUrgency = String(urgency || "").toLowerCase();
  if (
    normalizedUrgency === "critical" ||
    blockedTasks > 0 ||
    overdueTasks > 0 ||
    deadlineOverdue
  ) {
    const pressureSignals = [];
    if (blockedTasks > 0) pressureSignals.push(`${blockedTasks} blocked task(s)`);
    if (overdueTasks > 0) pressureSignals.push(`${overdueTasks} overdue task(s)`);
    if (deadlineOverdue) pressureSignals.push("an overdue deadline");
    const pressure =
      pressureSignals.length > 0
        ? pressureSignals.join(", ")
        : "active risk indicators";
    return `Assistant recommendation: This dossier is under active pressure (${pressure}). I can help draft immediate next steps if you want.`;
  }

  if (activeTasks > 0) {
    return `Assistant recommendation: This dossier has ${activeTasks} active task(s). I can help plan the next steps around the current workload if useful.`;
  }

  if (totalTasks > 0 || totalSessions > 0) {
    return "Assistant recommendation: Activity is ongoing without urgent blockers. I can draft a concise working summary to align next actions if helpful.";
  }

  return "Assistant recommendation: This dossier has no active workload yet. I can help draft a practical action plan when you want to start.";
}

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
  const classifyDossierUrgency = (dossier, workSummary) => {
    const taskStats = workSummary?.tasks || {};
    const overdueTasks = Number(taskStats.overdue || 0);
    const normalizedPriority = String(dossier?.priority || "").toLowerCase();
    const normalizedStatus = String(dossier?.status || "").toLowerCase();

    if (normalizedStatus === "blocked" || overdueTasks > 0) return "critical";

    if (dossier?.next_deadline) {
      const deadline = new Date(dossier.next_deadline);
      if (!Number.isNaN(deadline.getTime())) {
        const daysUntil = Math.ceil(
          (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysUntil <= 3) return "critical";
        if (daysUntil <= 7) return "high";
      }
    }

    if (normalizedPriority === "urgent" || normalizedPriority === "high")
      return "high";
    return "normal";
  };

  const enrichDossierWorkContext = async (dossier) => {
    const workResult = await safeReadSummaryTool("getDossierWorkSummary", {
      dossierId: dossier.id,
    });
    const workSummary = workResult || {
      dossierId: dossier.id,
      tasks: { total: 0, active: 0, overdue: 0 },
      sessions: { total: 0 },
    };
    applyDossierWorkSummary(workSummary);

    const urgency = classifyDossierUrgency(dossier, workSummary);
    return {
      workSummary,
      urgency,
      totalTasks: Number(workSummary.tasks?.total || 0),
      activeTasks: Number(workSummary.tasks?.active || 0),
      overdueTasks: Number(workSummary.tasks?.overdue || 0),
      totalSessions: Number(workSummary.sessions?.total || 0),
    };
  };
  const callReadTool = this._callReadTool.bind(this);

  do {
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintRef = entityHints.find(
      (hint) => hint.type === "reference",
    )?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    title = "Read data — Dossier";

    if (hintId) {
      const result = await this._callReadTool(
        "getDossier",
        { dossierId: hintId },
        policy,
      );
      const dossier = result?.dossier;
      if (!dossier) {
        summary = "No dossier found for that identifier.";
        details.push("Try listing dossiers to see available records.");
        break;
      }
      const resolvedDeadline = await resolveDossierDeadlineFromChildren({
        dossier,
        now,
        policy,
        callReadTool,
      });
      const dossierView = applyResolvedDeadlineToDossier(
        dossier,
        resolvedDeadline,
      );
      const workContext = await enrichDossierWorkContext(dossierView);
      summary = `Dossier Work Mode: ${resolveEntityDisplayLabel("dossier", dossierView, { fallback: "Dossier" })}`;
      details.push(`Title: ${dossierView.title || "Untitled"}`);
      details.push(`Status: ${dossierView.status || "open"}`);
      details.push(`Priority: ${dossierView.priority || "medium"}`);
      if (dossierView.client_id) {
        const clientResult = await safeReadSummaryTool("getClient", {
          clientId: dossierView.client_id,
        });
        const clientLabel = clientResult?.client
          ? resolveEntityDisplayLabel("client", clientResult.client, {
              fallback: "Client",
            })
          : "Client";
        details.push(`Client: ${clientLabel}`);
      } else {
        details.push("Client: N/A");
      }
      details.push(`Phase: ${dossierView.phase || "not set"}`);
      details.push(formatResolvedNextDeadlineLine(resolvedDeadline, formatDate));
      details.push(`Urgency: ${workContext.urgency}`);
      details.push(
        `Workload: ${workContext.totalTasks} task(s), ${workContext.activeTasks} active, ${workContext.overdueTasks} overdue, ${workContext.totalSessions} session(s)`,
      );
      details.push(
        "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
      );
      details.push(
        buildDossierAssistiveRecommendation({
          urgency: workContext.urgency,
          activeTasks: workContext.activeTasks,
          overdueTasks: workContext.overdueTasks,
          totalTasks: workContext.totalTasks,
          totalSessions: workContext.totalSessions,
        }),
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getDossier",
        note: "Dossier lookup",
      });
      data = dossierView;
      await appendDocumentDetails("dossier", dossierView);
      break;
    }

    if (hintRef) {
      const result = await this._callReadTool(
        "getDossierByReference",
        { reference: hintRef },
        policy,
      );
      const dossier = result?.dossier;
      if (!dossier) {
        summary = `No dossier found for reference "${hintRef}"`;
        details.push("Try listing all dossiers with: show me my dossiers");
        break;
      }
      const resolvedDeadline = await resolveDossierDeadlineFromChildren({
        dossier,
        now,
        policy,
        callReadTool,
      });
      const dossierView = applyResolvedDeadlineToDossier(
        dossier,
        resolvedDeadline,
      );
      const workContext = await enrichDossierWorkContext(dossierView);
      summary = `Dossier Work Mode: ${dossierView.reference || hintRef}`;
      details.push(`Title: ${dossierView.title || "Untitled"}`);
      details.push(`Status: ${dossierView.status || "open"}`);
      details.push(`Priority: ${dossierView.priority || "medium"}`);
      if (dossierView.client_id) {
        const clientResult = await safeReadSummaryTool("getClient", {
          clientId: dossierView.client_id,
        });
        const clientLabel = clientResult?.client
          ? resolveEntityDisplayLabel("client", clientResult.client, {
              fallback: "Client",
            })
          : "Client";
        details.push(`Client: ${clientLabel}`);
      } else {
        details.push("Client: N/A");
      }
      details.push(`Phase: ${dossierView.phase || "not set"}`);
      details.push(formatResolvedNextDeadlineLine(resolvedDeadline, formatDate));
      details.push(`Urgency: ${workContext.urgency}`);
      details.push(
        `Workload: ${workContext.totalTasks} task(s), ${workContext.activeTasks} active, ${workContext.overdueTasks} overdue, ${workContext.totalSessions} session(s)`,
      );
      details.push(
        "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
      );
      details.push(
        buildDossierAssistiveRecommendation({
          urgency: workContext.urgency,
          activeTasks: workContext.activeTasks,
          overdueTasks: workContext.overdueTasks,
          totalTasks: workContext.totalTasks,
          totalSessions: workContext.totalSessions,
        }),
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getDossierByReference",
        note: "Dossier lookup",
      });
      data = dossierView;
      await appendDocumentDetails("dossier", dossierView);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "listDossiers",
        { query: hintName, limit: 10 },
        policy,
      );
      const dossiers = result?.dossiers || [];
      if (dossiers.length === 0) {
        summary = `No dossier found for "${hintName}"`;
        details.push("Try listing all dossiers with: show me my dossiers");
      } else if (dossiers.length === 1) {
        const dossier = dossiers[0];
        const resolvedDeadline = await resolveDossierDeadlineFromChildren({
          dossier,
          now,
          policy,
          callReadTool,
        });
        const dossierView = applyResolvedDeadlineToDossier(
          dossier,
          resolvedDeadline,
        );
        const workContext = await enrichDossierWorkContext(dossierView);
        summary = `Dossier Work Mode: ${dossierView.reference || dossierView.title}`;
        details.push(`Title: ${dossierView.title || "Untitled"}`);
        details.push(`Status: ${dossierView.status || "open"}`);
        details.push(`Priority: ${dossierView.priority || "medium"}`);
        if (dossierView.client_id) {
          const clientResult = await safeReadSummaryTool("getClient", {
            clientId: dossierView.client_id,
          });
          const clientLabel = clientResult?.client
            ? resolveEntityDisplayLabel("client", clientResult.client, {
                fallback: "Client",
              })
            : "Client";
          details.push(`Client: ${clientLabel}`);
        } else {
          details.push("Client: N/A");
        }
        details.push(`Phase: ${dossierView.phase || "not set"}`);
        details.push(formatResolvedNextDeadlineLine(resolvedDeadline, formatDate));
        details.push(`Urgency: ${workContext.urgency}`);
        details.push(
          `Workload: ${workContext.totalTasks} task(s), ${workContext.activeTasks} active, ${workContext.overdueTasks} overdue, ${workContext.totalSessions} session(s)`,
        );
        details.push(
          "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
        );
        details.push(
          buildDossierAssistiveRecommendation({
            urgency: workContext.urgency,
            activeTasks: workContext.activeTasks,
            overdueTasks: workContext.overdueTasks,
            totalTasks: workContext.totalTasks,
            totalSessions: workContext.totalSessions,
          }),
        );
        sources.push({
          sourceType: "system",
          reference: "tool:listDossiers",
          note: "Dossier lookup",
        });
        data = dossierView;
        await appendDocumentDetails("dossier", dossierView);
      } else {
        summary = `Multiple dossiers match "${hintName}"`;
        dossiers.forEach((d) =>
          details.push(
            `${d.reference || "Dossier"} — ${d.title || "Untitled"}`,
          ),
        );
        details.push("Please specify which dossier you mean.");
      }
      break;
    }

    summary = "Which dossier?";
    details.push("Provide a dossier reference or name.");
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
  const callReadTool = this._callReadTool.bind(this);

  do {
    const scope = String(context?.scope || "").toLowerCase();
    const scopedId = scope === "dossier" ? context?.dossierId : null;
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintRef = entityHints.find(
      (hint) => hint.type === "reference",
    )?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_DOSSIER && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("dossier");
      if (applyAggregateResult(aggregateResult)) break;
    }

    const fetchDossierByRef = async (reference) => {
      const result = await this._callReadTool(
        "getDossierByReference",
        { reference },
        policy,
      );
      return result?.dossier || null;
    };

    let dossier = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getDossier",
        { dossierId: targetId },
        policy,
      );
      dossier = result?.dossier || null;
    } else if (hintRef) {
      dossier = await fetchDossierByRef(hintRef);
    } else if (hintName) {
      const result = await this._callReadTool(
        "listDossiers",
        { query: hintName, limit: 5 },
        policy,
      );
      const dossiers = result?.dossiers || [];
      if (dossiers.length === 1) dossier = dossiers[0];
      else if (dossiers.length > 1) {
        summary = `Multiple dossiers match "${hintName}"`;
        dossiers.forEach((d) =>
          details.push(
            `${d.reference || "Dossier"} — ${d.title || "Untitled"}`,
          ),
        );
        details.push("Please specify which dossier you mean.");
        break;
      }
    }

    if (!dossier) {
      summary = "Which dossier?";
      details.push("Provide a dossier reference or name.");
      break;
    }

    const tasksResult = await this._callReadTool(
      "listTasks",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const tasks = tasksResult?.tasks || [];
    const sessionsResult = await this._callReadTool(
      "listSessions",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const sessions = sessionsResult?.sessions || [];
    const missionsResult = await this._callReadTool(
      "listMissions",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const missions = missionsResult?.missions || [];
    const financialResult = await this._callReadTool(
      "listFinancialEntries",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const financialEntries = financialResult?.financialEntries || [];
    const lawsuitsResult = await this._callReadTool(
      "listLawsuits",
      { dossierId: dossier.id, limit: 200 },
      policy,
    );
    const lawsuits = lawsuitsResult?.lawsuits || [];
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
    const overdueTasks = tasks.filter(
      (task) =>
        task.due_date &&
        !["done", "cancelled"].includes(task.status) &&
        new Date(task.due_date) < now,
    );
    const activeTasks = tasks.filter((task) => {
      const status = String(task.status || "").toLowerCase();
      return !["done", "completed", "cancelled", "closed"].includes(status);
    });
    const blockedTasks = tasks.filter(
      (task) => String(task.status || "").toLowerCase() === "blocked",
    );
    const deadlineOverdue = resolvedDeadline.status === "overdue";
    const effectiveDeadline = dossierView.next_deadline;
    const overdueReceivables = financialEntries.filter(
      (entry) =>
        String(entry.direction || "").toLowerCase() === "receivable" &&
        isFinancialOverdue(entry),
    );
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "dossier", entityId: dossier.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];
    applyDossierWorkSummary({
      dossierId: dossier.id,
      tasks: {
        total: tasks.length,
        active: activeTasks.length,
        overdue: overdueTasks.length,
      },
      sessions: {
        total: sessions.length,
      },
    });
    const normalizedPriority = String(dossier.priority || "").toLowerCase();
    let urgency = "normal";
    if (blockedTasks.length > 0 || overdueTasks.length > 0 || deadlineOverdue) {
      urgency = "critical";
    } else if (
      normalizedPriority === "urgent" ||
      normalizedPriority === "high" ||
      (effectiveDeadline &&
        Math.ceil(
          (new Date(effectiveDeadline) - now) / (1000 * 60 * 60 * 24),
        ) <= 7)
    ) {
      urgency = "high";
    }

    if (intent === READ_INTENTS.EXPLAIN_DOSSIER_STATE) {
      title = "Read data — Dossier state";
      summary = `Dossier Work Mode: ${dossier.reference || "Dossier"} — ${dossier.title || "Untitled"}`;
      details.push(
        `Status: ${dossier.status || "open"} (priority ${dossier.priority || "medium"})`,
      );
      details.push(
        `Phase: ${dossier.phase || "not set"} • Assignment: ${dossier.assigned_lawyer || "unassigned"} • Urgency: ${urgency}`,
      );
      details.push(
        `Relationships: ${lawsuits.length} lawsuit(s), ${tasks.length} task(s), ${sessions.length} session(s), ${missions.length} mission(s), ${financialEntries.length} financial entry(ies)`,
      );
      details.push(
        blockedTasks.length > 0 ||
          overdueTasks.length > 0 ||
          deadlineOverdue ||
          overdueReceivables.length > 0
          ? `Blocking: ${blockedTasks.length} blocked task(s), ${overdueTasks.length} overdue task(s), ${overdueReceivables.length} overdue receivable(s), ${deadlineOverdue ? "deadline overdue" : "deadline ok"}`
          : "Blocking: none detected",
      );
      details.push(
        "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
      );
      details.push(
        buildDossierAssistiveRecommendation({
          urgency,
          activeTasks: activeTasks.length,
          overdueTasks: overdueTasks.length,
          totalTasks: tasks.length,
          totalSessions: sessions.length,
          blockedTasks: blockedTasks.length,
          deadlineOverdue,
        }),
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getDossier",
        note: "Dossier state",
      });
      data = dossierView;
      await appendDocumentDetails("dossier", dossierView);
      break;
    }

    title = "Read data — Dossier summary";
    summary = `Dossier Work Mode: ${dossier.reference || "Dossier"} — ${dossier.title || "Untitled"}`;
    const recentActivity = historyEvents.map((event) => {
      const when = event.created_at
        ? formatDateTime(event.created_at)
        : "unknown";
      return `${when} — ${event.action || "event"}`;
    });
    details.push(
      `Summary: status ${dossier.status || "open"}, ${tasks.length} task(s), ${sessions.length} session(s), ${financialEntries.length} financial entry(ies)`,
    );
    details.push(
      `Phase: ${dossier.phase || "not set"} • Assignment: ${dossier.assigned_lawyer || "unassigned"} • Urgency: ${urgency}`,
    );
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(
      `Key dates/risks: ${formatResolvedDeadlineRiskFragment(resolvedDeadline, formatDate)}${
        overdueReceivables.length > 0
          ? `, ${overdueReceivables.length} overdue receivable(s)`
          : ""
      }`,
    );
    details.push(
      "Execution policy: Read-only support mode. No data changes are performed without explicit confirmation.",
    );
    details.push(
      buildDossierAssistiveRecommendation({
        urgency,
        activeTasks: activeTasks.length,
        overdueTasks: overdueTasks.length,
        totalTasks: tasks.length,
        totalSessions: sessions.length,
        blockedTasks: blockedTasks.length,
        deadlineOverdue,
      }),
    );
    sources.push({
      sourceType: "system",
      reference: "tool:getDossier",
      note: "Dossier summary",
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
