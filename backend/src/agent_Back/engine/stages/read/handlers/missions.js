"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");

async function handleListMissions(state) {
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
          title = "Read data — Missions";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name} (ID: ${c.id})`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Missions";
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
          title = "Read data — Missions";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name} (ID: ${c.id})`),
          );
          details.push("Please specify which case you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Missions";
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
      title = "Read data — Missions";
      summary = "Missions are linked to dossiers or cases.";
      details.push("Specify a dossier or case to list related missions.");
      break;
    }

    const { missions } = await this._callReadTool(
      "listMissions",
      {
        limit: 50,
        dossierId,
        lawsuitId,
        status: filters?.status || null,
        priority: filters?.priority || null,
        query: filters?.query || null,
      },
      policy,
    );
    data = missions;
    title = "Read data — Missions";
    summary =
      missions.length > 0
        ? `Found ${missions.length} mission(s)`
        : "No missions found";
    missions.forEach((m) => {
      const due = m.due_date ? ` due ${formatDate(m.due_date)}` : "";
      details.push(
        `${m.reference || "Mission"} — ${m.title || "Untitled"} (${m.status || "planned"})${due}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listMissions",
      note: "Mission list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadMission(state) {
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
    const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    title = "Read data — Mission";

    if (hintId) {
      const result = await this._callReadTool(
        "getMission",
        { missionId: hintId },
        policy,
      );
      const mission = result?.mission;
      if (!mission) {
        summary = `No mission found for ID ${hintId}`;
        details.push("Try listing missions to see available records.");
        break;
      }
      summary = `Mission: ${mission.reference || mission.title || hintId}`;
      details.push(`Title: ${mission.title || "Untitled"}`);
      details.push(`Status: ${mission.status || "planned"}`);
      details.push(`Due date: ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`);
      details.push(`Dossier ID: ${mission.dossier_id || "N/A"}`);
      details.push(`Lawsuit ID: ${mission.lawsuit_id || "N/A"}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getMission",
        note: "Mission lookup",
      });
      data = mission;
      await appendDocumentDetails("mission", mission);
      break;
    }

    if (hintRef || hintName) {
      const query = hintRef || hintName;
      const result = await this._callReadTool(
        "listMissions",
        { query, limit: 10 },
        policy,
      );
      const missions = result?.missions || [];
      if (missions.length === 0) {
        summary = `No mission found for "${query}"`;
        details.push("Try listing all missions with: show me my missions");
      } else if (missions.length === 1) {
        const mission = missions[0];
        summary = `Mission: ${mission.reference || mission.title || "Mission"}`;
        details.push(`Title: ${mission.title || "Untitled"}`);
        details.push(`Status: ${mission.status || "planned"}`);
        details.push(`Due date: ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`);
        details.push(`Dossier ID: ${mission.dossier_id || "N/A"}`);
        details.push(`Lawsuit ID: ${mission.lawsuit_id || "N/A"}`);
        sources.push({
          sourceType: "system",
          reference: "tool:listMissions",
          note: "Mission lookup",
        });
        data = mission;
        await appendDocumentDetails("mission", mission);
      } else {
        summary = `Multiple missions match "${query}"`;
        missions.forEach((m) =>
          details.push(
            `${m.reference || "Mission"} — ${m.title || "Untitled"} (ID: ${m.id})`,
          ),
        );
        details.push("Please specify which mission you mean.");
      }
      break;
    }

    summary = "Which mission?";
    details.push("Provide a mission ID or reference.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainMission(state) {
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
    const hintId = getHintValue("id", "mission") || getHintValue("id");
    const hintRef = getHintValue("reference", "mission");
    const hintName = getHintValue("name", "mission") || getHintValue("name");
    const scopedId = scope === "mission" ? context?.missionId : null;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_MISSION && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("mission");
      if (applyAggregateResult(aggregateResult)) break;
    }

    let mission = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getMission",
        { missionId: targetId },
        policy,
      );
      mission = result?.mission || null;
    } else if (hintRef || hintName) {
      const query = hintRef || hintName;
      const result = await this._callReadTool(
        "listMissions",
        { query, limit: 10 },
        policy,
      );
      const missions = result?.missions || [];
      if (missions.length === 1) {
        mission = missions[0];
      } else if (missions.length > 1) {
        title =
          intent === READ_INTENTS.EXPLAIN_MISSION_STATE
            ? "Read data — Mission state"
            : "Read data — Mission summary";
        summary = `Multiple missions match "${query}"`;
        missions.forEach((m) =>
          details.push(
            `${m.reference || "Mission"} — ${m.title || "Untitled"} (ID: ${m.id})`,
          ),
        );
        details.push("Please specify which mission you mean.");
        break;
      }
    }

    if (!mission) {
      summary = "Which mission?";
      details.push("Provide a mission ID or reference.");
      break;
    }

    const overdue = isMissionOverdue(mission);
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "mission", entityId: mission.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];

    if (intent === READ_INTENTS.EXPLAIN_MISSION_STATE) {
      title = "Read data — Mission state";
      summary = `Mission: ${mission.reference || mission.title || "Mission"}`;
      details.push(`Status: ${mission.status || "planned"}`);
      details.push(`Priority: ${mission.priority || "medium"}`);
      details.push(`Due date: ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`);
      details.push(
        `Relationships: dossier ${mission.dossier_id || "N/A"}, case ${mission.lawsuit_id || "N/A"}`,
      );
      details.push(
        overdue ? "Blocking: mission overdue" : "Blocking: none detected",
      );
      details.push("Explanation:");
      details.push(
        mission.result
          ? `Progress: result recorded (${mission.result})`
          : "Progress: no result recorded",
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getMission",
        note: "Mission state",
      });
      data = mission;
      await appendDocumentDetails("mission", mission);
      break;
    }

    title = "Read data — Mission summary";
    summary = `Mission: ${mission.reference || mission.title || "Mission"}`;
    const recentActivity = historyEvents.map((event) => {
      const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
      return `${when} — ${event.action || "event"}`;
    });
    details.push(
      `Summary: status ${mission.status || "planned"}, due ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`,
    );
    details.push(`Result: ${mission.result || "not recorded"}`);
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(
      `Key dates/risks: ${mission.due_date ? formatDate(mission.due_date) : "no due date"}${overdue ? " (overdue)" : ""}`,
    );
    sources.push({
      sourceType: "system",
      reference: "tool:getMission",
      note: "Mission summary",
    });
    data = mission;
    await appendDocumentDetails("mission", mission);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListMissions,
  handleReadMission,
  handleExplainMission,
};
