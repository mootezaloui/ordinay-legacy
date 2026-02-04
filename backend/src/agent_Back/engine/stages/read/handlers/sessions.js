"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const { resolveEntityDisplayLabel } = require("../../../../utils/entityDisplay");

async function handleListSessions(state) {
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
    const timeframe =
      filters?.timeframe ||
      (intent === READ_INTENTS.LIST_UPCOMING_SESSIONS ? "upcoming" : null);
    let dossierId = scope === "dossier" ? context?.dossierId : null;
    let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;

    if (!dossierId && !lawsuitId) {
      const hintDossierId = getHintValue("id", "dossier");
      const hintDossierRef = getHintValue("reference", "dossier");
      const hintDossierName = getHintValue("name", "dossier");
      if (hintDossierId) {
        dossierId = hintDossierId;
      } else if (hintDossierRef || hintDossierName) {
        const resolution = await this._resolveEntity(
          {
            type: "dossier",
            reference: hintDossierRef || undefined,
            nameHint: hintDossierName || undefined,
          },
          policy,
        );
        if (resolution.resolved) {
          dossierId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Sessions";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Dossier"}`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Sessions";
          summary = resolution.message;
          details.push("Try listing dossiers to see available records.");
          break;
        }
      }
    }

    if (!dossierId && !lawsuitId) {
      const hintLawsuitId = getHintValue("id", "lawsuit");
      const hintLawsuitRef = getHintValue("reference", "lawsuit");
      const hintLawsuitName = getHintValue("name", "lawsuit");
      if (hintLawsuitId) {
        lawsuitId = hintLawsuitId;
      } else if (hintLawsuitRef || hintLawsuitName) {
        const resolution = await this._resolveEntity(
          {
            type: "lawsuit",
            reference: hintLawsuitRef || undefined,
            nameHint: hintLawsuitName || undefined,
          },
          policy,
        );
        if (resolution.resolved) {
          lawsuitId = resolution.entity.id;
        } else if (resolution.reason === "ambiguous") {
          title = "Read data — Sessions";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name || "Case"}`),
          );
          details.push("Please specify which case you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Sessions";
          summary = resolution.message;
          details.push("Try listing cases to see available records.");
          break;
        }
      }
    }

    if (
      !dossierId &&
      !lawsuitId &&
      (getHintValue("id", "client") || getHintValue("name", "client"))
    ) {
      title = "Read data — Sessions";
      summary = "Sessions are linked to dossiers or cases.";
      details.push("Specify a dossier or case to list related sessions.");
      break;
    }

    const { sessions } = await this._callReadTool(
      "listSessions",
      {
        limit: 50,
        dossierId,
        lawsuitId,
        timeframe,
        status: filters?.status || null,
        query: filters?.query || null,
      },
      policy,
    );
    data = sessions;
    title = "Read data — Sessions";
    summary =
      sessions.length > 0
        ? `${sessions.length} session(s)${
            timeframe ? ` ${timeframe}` : ""
          }`
        : `No sessions${timeframe ? ` ${timeframe}` : ""} found`;
    sessions.forEach((s) => {
      const when = s.scheduled_at
        ? formatDateTime(s.scheduled_at)
        : "unscheduled";
      details.push(
        `${s.session_type || "session"} — ${s.title || "Untitled"} (${s.status || "scheduled"}) • ${when}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listSessions",
      note: "Session list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadSession(state) {
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
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    title = "Read data — Session";

    const appendParentLabels = async (session) => {
      if (session.dossier_id) {
        const dossierResult = await safeReadSummaryTool("getDossier", {
          dossierId: session.dossier_id,
        });
        const dossierLabel = dossierResult?.dossier
          ? resolveEntityDisplayLabel("dossier", dossierResult.dossier, {
              fallback: "Dossier",
            })
          : "Dossier";
        details.push(`Dossier: ${dossierLabel}`);
      } else {
        details.push("Dossier: N/A");
      }

      if (session.lawsuit_id) {
        const lawsuitResult = await safeReadSummaryTool("getLawsuit", {
          lawsuitId: session.lawsuit_id,
        });
        const lawsuitLabel = lawsuitResult?.lawsuit
          ? resolveEntityDisplayLabel("lawsuit", lawsuitResult.lawsuit, {
              fallback: "Lawsuit",
            })
          : "Lawsuit";
        details.push(`Lawsuit: ${lawsuitLabel}`);
      } else {
        details.push("Lawsuit: N/A");
      }
    };

    if (hintId) {
      const result = await this._callReadTool(
        "getSession",
        { sessionId: hintId },
        policy,
      );
      const session = result?.session;
      if (!session) {
        summary = "No session found for that identifier.";
        details.push("Try listing sessions to see available records.");
        break;
      }
      summary = `Session: ${resolveEntityDisplayLabel("session", session, { fallback: "Session" })}`;
      details.push(`Status: ${session.status || "scheduled"}`);
      details.push(
        `Scheduled: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
      );
      details.push(`Location: ${session.location || "N/A"}`);
      await appendParentLabels(session);
      sources.push({
        sourceType: "system",
        reference: "tool:getSession",
        note: "Session lookup",
      });
      data = session;
      await appendDocumentDetails("session", session);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "listSessions",
        { query: hintName, limit: 10 },
        policy,
      );
      const sessions = result?.sessions || [];
      if (sessions.length === 0) {
        summary = `No session found for "${hintName}"`;
        details.push("Try listing all sessions with: show me my sessions");
      } else if (sessions.length === 1) {
        const session = sessions[0];
        summary = `Session: ${resolveEntityDisplayLabel("session", session, { fallback: "Session" })}`;
        details.push(`Status: ${session.status || "scheduled"}`);
        details.push(
          `Scheduled: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
        );
        details.push(`Location: ${session.location || "N/A"}`);
        await appendParentLabels(session);
        sources.push({
          sourceType: "system",
          reference: "tool:listSessions",
          note: "Session lookup",
        });
        data = session;
        await appendDocumentDetails("session", session);
      } else {
        summary = `Multiple sessions match "${hintName}"`;
        sessions.forEach((s) =>
          details.push(
            `${s.title || s.session_type || "Session"} — ${s.status || "scheduled"}`,
          ),
        );
        details.push("Please specify which session you mean.");
      }
      break;
    }

    summary = "Which session?";
    details.push("Provide a session title.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainSession(state) {
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
    const hintId = getHintValue("id", "session") || getHintValue("id");
    const hintName = getHintValue("name", "session") || getHintValue("name");
    const scopedId = scope === "session" ? context?.sessionId : null;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_SESSION && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("session");
      if (applyAggregateResult(aggregateResult)) break;
    }

    let session = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getSession",
        { sessionId: targetId },
        policy,
      );
      session = result?.session || null;
    } else if (hintName) {
      const result = await this._callReadTool(
        "listSessions",
        { query: hintName, limit: 10 },
        policy,
      );
      const sessions = result?.sessions || [];
      if (sessions.length === 1) {
        session = sessions[0];
      } else if (sessions.length > 1) {
        title =
          intent === READ_INTENTS.EXPLAIN_SESSION_STATE
            ? "Read data — Session state"
            : "Read data — Session summary";
        summary = `Multiple sessions match "${hintName}"`;
        sessions.forEach((s) =>
          details.push(
            `${s.title || s.session_type || "Session"} — ${s.status || "scheduled"}`,
          ),
        );
        details.push("Please specify which session you mean.");
        break;
      }
    }

    if (!session) {
      summary = "Which session?";
      details.push("Provide a session title.");
      break;
    }

    const participants = Array.isArray(session.participants)
      ? session.participants
      : [];
    const overdue = isSessionOverdue(session);
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "session", entityId: session.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];

    if (intent === READ_INTENTS.EXPLAIN_SESSION_STATE) {
      title = "Read data — Session state";
      summary = `Session: ${resolveEntityDisplayLabel("session", session, { fallback: "Session" })}`;
      details.push(`Status: ${session.status || "scheduled"}`);
      details.push(
        `Scheduled: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
      );
      details.push(`Location: ${session.location || "N/A"}`);
      details.push(
        `Participants: ${participants.length > 0 ? participants.length : "N/A"}`,
      );
      if (session.outcome)
        details.push(`Outcome: ${session.outcome}`);
      details.push(
        `Relationships: ${session.dossier_id ? "linked dossier" : "dossier N/A"}, ${session.lawsuit_id ? "linked case" : "case N/A"}`,
      );
      details.push(
        overdue ? "Blocking: session date passed" : "Blocking: none detected",
      );
      const normalizedStatus = String(session.status || "scheduled").toLowerCase();
      let nextSteps = "No follow-up recorded yet.";
      if (normalizedStatus === "scheduled") {
        if (session.scheduled_at && new Date(session.scheduled_at) < now) {
          nextSteps = "Scheduled date has passed; outcome not recorded.";
        } else {
          nextSteps = "Session is upcoming; outcome not recorded.";
        }
      } else if (["completed", "done"].includes(normalizedStatus)) {
        nextSteps = session.outcome
          ? "Outcome recorded; follow-up items may exist."
          : "Outcome missing; follow-up items may exist.";
      } else if (normalizedStatus === "cancelled") {
        nextSteps = "Session cancelled; no outcome recorded.";
      }
      details.push("Explanation:");
      details.push(`Next steps (read-only): ${nextSteps}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getSession",
        note: "Session state",
      });
      data = session;
      await appendDocumentDetails("session", session);
      break;
    }

    title = "Read data — Session summary";
    summary = `Session: ${session.title || session.session_type || "Session"}`;
    const recentActivity = historyEvents.map((event) => {
      const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
      return `${when} — ${event.action || "event"}`;
    });
    details.push(
      `Summary: status ${session.status || "scheduled"}, scheduled ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
    );
    details.push(
      `Outcome: ${session.outcome || "not recorded"}`,
    );
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(
      `Key dates/risks: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "no schedule"}${overdue ? " (overdue)" : ""}`,
    );
    sources.push({
      sourceType: "system",
      reference: "tool:getSession",
      note: "Session summary",
    });
    data = session;
    await appendDocumentDetails("session", session);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListSessions,
  handleReadSession,
  handleExplainSession,
};
