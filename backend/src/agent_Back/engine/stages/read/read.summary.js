"use strict";

function buildSummaryHelpers({
  engine,
  policy,
  context,
  scope,
  now,
  getHintValue,
  aggregateFilters,
  ENTITY_LABELS,
  ENTITY_PLURALS,
  TASK_STATUSES,
  normalizeValue,
  formatCountMap,
  countBy,
  applyAggregateFilters,
  isFinancialOverdue,
  isMissionOverdue,
  isSessionOverdue,
}) {
  const buildSummarySection = (title, items) => {
    const cleanedItems = (items || []).filter(
      (item) => item && typeof item.value === "number",
    );
    if (cleanedItems.length === 0) return null;
    return { title, items: cleanedItems };
  };

  const buildClientDossierSummary = (summaryData) => {
    if (!summaryData) return null;
    const priorities = summaryData.priorities || {};
    const priorityItems = [
      { key: "urgent", label: "Urgent priority" },
      { key: "high", label: "High priority" },
      { key: "medium", label: "Medium priority" },
      { key: "low", label: "Low priority" },
    ]
      .map((entry) => ({
        label: entry.label,
        value: Number(priorities[entry.key] || 0),
      }))
      .filter((item) => item.value > 0);

    return buildSummarySection("Dossiers", [
      { label: "Total", value: Number(summaryData.total || 0) },
      { label: "Active", value: Number(summaryData.active || 0) },
      ...priorityItems,
    ]);
  };

  const buildDossierWorkSummary = (summaryData) => {
    if (!summaryData) return [];
    const taskSection = buildSummarySection("Tasks", [
      { label: "Total", value: Number(summaryData.tasks?.total || 0) },
      { label: "Active", value: Number(summaryData.tasks?.active || 0) },
      { label: "Overdue", value: Number(summaryData.tasks?.overdue || 0) },
    ]);
    const sessionSection = buildSummarySection("Sessions", [
      { label: "Total", value: Number(summaryData.sessions?.total || 0) },
    ]);
    return [taskSection, sessionSection].filter(Boolean);
  };

  const applyClientDossierSummary = (state, summaryData) => {
    if (!summaryData) return;
    state.childSummary = {
      ...(state.childSummary || {}),
      dossiers: {
        total: Number(summaryData.total || 0),
        active: Number(summaryData.active || 0),
        blocked: Number(summaryData.blocked || 0),
        priorities: summaryData.priorities || {},
      },
    };
    const section = buildClientDossierSummary(summaryData);
    if (section) {
      state.relatedSummary = state.relatedSummary
        ? [...state.relatedSummary, section]
        : [section];
    }
  };

  const applyDossierWorkSummary = (state, summaryData) => {
    if (!summaryData) return;
    state.childSummary = {
      ...(state.childSummary || {}),
      tasks: {
        total: Number(summaryData.tasks?.total || 0),
        active: Number(summaryData.tasks?.active || 0),
        overdue: Number(summaryData.tasks?.overdue || 0),
      },
      sessions: {
        total: Number(summaryData.sessions?.total || 0),
      },
    };
    const sections = buildDossierWorkSummary(summaryData);
    if (sections.length > 0) {
      state.relatedSummary = state.relatedSummary
        ? [...state.relatedSummary, ...sections]
        : sections;
    }
  };

  const buildResolutionError = (label, resolution, titleLabel) => {
    const errorTitle = titleLabel || `Read data — ${label} summary`;
    const errorDetails = [];
    if (resolution.reason === "ambiguous") {
      resolution.candidates?.forEach((c) =>
        errorDetails.push(`${c.name} (ID: ${c.id})`),
      );
    }
    return {
      title: errorTitle,
      summary: resolution.message,
      details: errorDetails,
    };
  };

  const resolveScopedEntityId = async (type, titleLabel) => {
    let resolvedId = null;
    const scopeMap = {
      client: context?.clientId,
      dossier: context?.dossierId,
      lawsuit: context?.lawsuitId,
      mission: context?.missionId,
      task: context?.taskId,
      personal_task: context?.personalTaskId,
    };

    if (scope === type && scopeMap[type]) {
      resolvedId = scopeMap[type];
    }

    if (!resolvedId) {
      const hintId = getHintValue("id", type);
      if (hintId) resolvedId = hintId;
    }

    if (!resolvedId) {
      const hintRef = getHintValue("reference", type);
      const hintName = getHintValue("name", type);
      if (hintRef || hintName) {
        const resolution = await engine._resolveEntity(
          {
            type,
            reference: hintRef || undefined,
            nameHint: hintName || undefined,
          },
          policy,
        );
        if (resolution.resolved) {
          resolvedId = resolution.entity.id;
        } else {
          return { error: buildResolutionError(type, resolution, titleLabel) };
        }
      }
    }

    return { id: resolvedId };
  };

  const buildAggregateSummary = async (entityType) => {
    const listConfig = {
      client: { tool: "listClients", key: "clients" },
      dossier: { tool: "listDossiers", key: "dossiers" },
      lawsuit: { tool: "listLawsuits", key: "lawsuits" },
      task: { tool: "listTasks", key: "tasks" },
      personal_task: { tool: "listPersonalTasks", key: "personalTasks" },
      session: { tool: "listSessions", key: "sessions" },
      mission: { tool: "listMissions", key: "missions" },
      notification: { tool: "listNotifications", key: "notifications" },
      history_event: { tool: "listHistoryEvents", key: "historyEvents" },
    };

    const config = listConfig[entityType];
    if (!config) return null;

    const params = { limit: 200 };

    if (entityType === "client") {
      if (aggregateFilters.status) params.status = aggregateFilters.status;
    }

    if (entityType === "dossier") {
      const scopeResolution = await resolveScopedEntityId(
        "client",
        "Read data — Dossier summary",
      );
      if (scopeResolution?.error) return { error: scopeResolution.error };
      if (scopeResolution.id) params.clientId = scopeResolution.id;
      if (aggregateFilters.status && aggregateFilters.status !== "active") {
        params.status = aggregateFilters.status;
      }
    }

    if (entityType === "lawsuit") {
      const scopeResolution = await resolveScopedEntityId(
        "dossier",
        "Read data — Lawsuit summary",
      );
      if (scopeResolution?.error) return { error: scopeResolution.error };
      if (scopeResolution.id) params.dossierId = scopeResolution.id;
      if (aggregateFilters.status && aggregateFilters.status !== "active") {
        params.status = aggregateFilters.status;
      }
    }

    if (entityType === "task") {
      const dossierResolution = await resolveScopedEntityId(
        "dossier",
        "Read data — Task summary",
      );
      if (dossierResolution?.error) return { error: dossierResolution.error };
      const lawsuitResolution = await resolveScopedEntityId(
        "lawsuit",
        "Read data — Task summary",
      );
      if (lawsuitResolution?.error) return { error: lawsuitResolution.error };
      if (dossierResolution.id) params.dossierId = dossierResolution.id;
      if (lawsuitResolution.id) params.lawsuitId = lawsuitResolution.id;

      if (
        !params.dossierId &&
        !params.lawsuitId &&
        (getHintValue("id", "client") || getHintValue("name", "client"))
      ) {
        return {
          error: {
            title: "Read data — Task summary",
            summary: "Tasks are linked to dossiers or cases.",
            details: ["Specify a dossier or case to summarize tasks."],
          },
        };
      }

      const status = normalizeValue(aggregateFilters.status);
      if (status && TASK_STATUSES.has(status)) params.status = status;
      if (aggregateFilters.priority) params.priority = aggregateFilters.priority;
    }

    if (entityType === "personal_task") {
      const status = normalizeValue(aggregateFilters.status);
      if (status && TASK_STATUSES.has(status)) params.status = status;
      if (aggregateFilters.priority) params.priority = aggregateFilters.priority;
    }

    if (entityType === "session") {
      const dossierResolution = await resolveScopedEntityId(
        "dossier",
        "Read data — Session summary",
      );
      if (dossierResolution?.error) return { error: dossierResolution.error };
      const lawsuitResolution = await resolveScopedEntityId(
        "lawsuit",
        "Read data — Session summary",
      );
      if (lawsuitResolution?.error) return { error: lawsuitResolution.error };
      if (dossierResolution.id) params.dossierId = dossierResolution.id;
      if (lawsuitResolution.id) params.lawsuitId = lawsuitResolution.id;

      if (
        !params.dossierId &&
        !params.lawsuitId &&
        (getHintValue("id", "client") || getHintValue("name", "client"))
      ) {
        return {
          error: {
            title: "Read data — Session summary",
            summary: "Sessions are linked to dossiers or cases.",
            details: ["Specify a dossier or case to summarize sessions."],
          },
        };
      }

      if (aggregateFilters.status) params.status = aggregateFilters.status;
      if (aggregateFilters.timeframe)
        params.timeframe = aggregateFilters.timeframe;
    }

    if (entityType === "mission") {
      const dossierResolution = await resolveScopedEntityId(
        "dossier",
        "Read data — Mission summary",
      );
      if (dossierResolution?.error) return { error: dossierResolution.error };
      const lawsuitResolution = await resolveScopedEntityId(
        "lawsuit",
        "Read data — Mission summary",
      );
      if (lawsuitResolution?.error) return { error: lawsuitResolution.error };
      if (dossierResolution.id) params.dossierId = dossierResolution.id;
      if (lawsuitResolution.id) params.lawsuitId = lawsuitResolution.id;

      if (
        !params.dossierId &&
        !params.lawsuitId &&
        (getHintValue("id", "client") || getHintValue("name", "client"))
      ) {
        return {
          error: {
            title: "Read data — Mission summary",
            summary: "Missions are linked to dossiers or cases.",
            details: ["Specify a dossier or case to summarize missions."],
          },
        };
      }

      if (aggregateFilters.status) params.status = aggregateFilters.status;
      if (aggregateFilters.priority) params.priority = aggregateFilters.priority;
    }

    if (entityType === "notification") {
      const scopeMap = {
        client: context?.clientId,
        dossier: context?.dossierId,
        lawsuit: context?.lawsuitId,
        session: context?.sessionId,
        task: context?.taskId,
        mission: context?.missionId,
        personal_task: context?.personalTaskId,
        financial_entry: context?.financialEntryId,
      };
      if (scope && scopeMap[scope]) {
        params.entityType = scope;
        params.entityId = scopeMap[scope];
      }
      if (aggregateFilters.status) params.status = aggregateFilters.status;
    }

    if (entityType === "history_event") {
      const scopeMap = {
        client: context?.clientId,
        dossier: context?.dossierId,
        lawsuit: context?.lawsuitId,
        session: context?.sessionId,
        task: context?.taskId,
        mission: context?.missionId,
        personal_task: context?.personalTaskId,
        financial_entry: context?.financialEntryId,
      };
      if (scope && scopeMap[scope]) {
        params.entityType = scope;
        params.entityId = scopeMap[scope];
      }
    }

    const result = await engine._callReadTool(config.tool, params, policy);
    let items = result?.[config.key] || [];
    items = applyAggregateFilters(items, entityType);

    const statusCounts = countBy(items, (item) => item.status);
    const priorityCounts = countBy(items, (item) => item.priority);
    const overdueCount = (() => {
      if (entityType === "task" || entityType === "personal_task") {
        return items.filter(
          (item) =>
            item.due_date &&
            !["done", "completed", "cancelled"].includes(
              String(item.status || "").toLowerCase(),
            ) &&
            new Date(item.due_date) < now,
        ).length;
      }
      if (entityType === "mission") {
        return items.filter((item) => isMissionOverdue(item)).length;
      }
      if (entityType === "session") {
        return items.filter((item) => isSessionOverdue(item)).length;
      }
      if (entityType === "financial_entry") {
        return items.filter((item) => isFinancialOverdue(item)).length;
      }
      return 0;
    })();

    const label = ENTITY_LABELS[entityType] || entityType;
    const labelText = String(label).replace(/_/g, " ");
    const titleLabel =
      labelText.charAt(0).toUpperCase() + labelText.slice(1);
    const plural = ENTITY_PLURALS[entityType] || `${labelText}s`;
    const summaryText =
      items.length > 0
        ? `${items.length} ${plural} in scope`
        : `No ${plural} found`;
    const summaryDetails = [];

    if (Object.keys(statusCounts).length > 0) {
      summaryDetails.push(`Status: ${formatCountMap(statusCounts)}`);
    }

    if (Object.keys(priorityCounts).length > 0) {
      summaryDetails.push(`Priority: ${formatCountMap(priorityCounts)}`);
    }

    if (overdueCount > 0) {
      const overdueLabel = `${overdueCount} overdue`;
      summaryDetails.push(overdueLabel);
    }

    const sampleLabels = items
      .slice(0, 3)
      .map((item) => {
        const label =
          item.name ||
          item.reference ||
          item.title ||
          item.session_type ||
          item.type ||
          item.id;
        return label ? String(label) : null;
      })
      .filter(Boolean);
    if (sampleLabels.length > 0) {
      summaryDetails.push(`Examples: ${sampleLabels.join(" | ")}`);
    }

    return {
      title: `Read data — ${titleLabel} summary`,
      summary: summaryText,
      details: summaryDetails,
      data: items,
      source: {
        sourceType: "system",
        reference: `tool:${config.tool}`,
        note: `${labelText} summary`,
      },
    };
  };

  const applyAggregateResult = (state, aggregateResult) => {
    if (!aggregateResult) return false;
    if (aggregateResult.error) {
      state.title = aggregateResult.error.title;
      state.summary = aggregateResult.error.summary;
      (aggregateResult.error.details || []).forEach((detail) =>
        state.details.push(detail),
      );
      return true;
    }
    state.title = aggregateResult.title;
    state.summary = aggregateResult.summary;
    (aggregateResult.details || []).forEach((detail) =>
      state.details.push(detail),
    );
    state.data = aggregateResult.data || null;
    if (aggregateResult.source) {
      state.sources.push(aggregateResult.source);
    }
    return true;
  };

  return {
    buildSummarySection,
    buildClientDossierSummary,
    buildDossierWorkSummary,
    applyClientDossierSummary,
    applyDossierWorkSummary,
    buildResolutionError,
    resolveScopedEntityId,
    buildAggregateSummary,
    applyAggregateResult,
  };
}

module.exports = {
  buildSummaryHelpers,
};
