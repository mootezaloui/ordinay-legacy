"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");

async function handleListTasks(state) {
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
          title = "Read data — Tasks";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name} (ID: ${c.id})`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Tasks";
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
          title = "Read data — Tasks";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name} (ID: ${c.id})`),
          );
          details.push("Please specify which case you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Tasks";
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
      title = "Read data — Tasks";
      summary = "Tasks are linked to dossiers or cases.";
      details.push("Specify a dossier or case to list related tasks.");
      break;
    }

    const statusFilter = normalizeValue(filters?.status);
    const statusParam =
      statusFilter && TASK_STATUSES.has(statusFilter) ? statusFilter : null;
    const { tasks } = await this._callReadTool(
      "listTasks",
      {
        limit: 50,
        dossierId,
        lawsuitId,
        status: statusParam,
        priority: filters?.priority || null,
        query: filters?.query || null,
      },
      policy,
    );
    let filteredTasks = tasks;
    if (filters?.activity === "active" && !statusParam) {
      filteredTasks = filteredTasks.filter(
        (task) =>
          !["done", "completed", "cancelled"].includes(
            String(task.status || "").toLowerCase(),
          ),
      );
    }
    if (filters?.overdue) {
      filteredTasks = filteredTasks.filter(
        (task) =>
          task.due_date &&
          !["done", "completed", "cancelled"].includes(
            String(task.status || "").toLowerCase(),
          ) &&
          new Date(task.due_date) < now,
      );
    }
    data = filteredTasks;
    title = "Read data — Tasks";
    summary =
      filteredTasks.length > 0
        ? `Found ${filteredTasks.length} task(s)`
        : "No tasks found";
    filteredTasks.forEach((t) => {
      const due = t.due_date ? ` due ${formatDate(t.due_date)}` : "";
      details.push(
        `${t.title} (ID: ${t.id}) — ${t.status || "todo"}${due}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listTasks",
      note: "Task list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleListOverdueTasks(state) {
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
          title = "Read data — Overdue tasks";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name} (ID: ${c.id})`),
          );
          details.push("Please specify which dossier you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Overdue tasks";
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
          title = "Read data — Overdue tasks";
          summary = resolution.message;
          resolution.candidates?.forEach((c) =>
            details.push(`${c.name} (ID: ${c.id})`),
          );
          details.push("Please specify which case you mean.");
          break;
        } else if (resolution.reason === "not_found") {
          title = "Read data — Overdue tasks";
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
      title = "Read data — Overdue tasks";
      summary = "Tasks are linked to dossiers or cases.";
      details.push("Specify a dossier or case to list related tasks.");
      break;
    }

    const { tasks } = await this._callReadTool(
      "listTasks",
      {
        limit: 100,
        dossierId,
        lawsuitId,
      },
      policy,
    );
    const overdue = tasks.filter(
      (task) =>
        task.due_date &&
        !["done", "cancelled"].includes(task.status) &&
        new Date(task.due_date) < now,
    );
    data = overdue;
    title = "Read data — Overdue tasks";
    summary =
      overdue.length > 0
        ? `⚠ ${overdue.length} overdue task(s)`
        : "No overdue tasks";
    overdue.forEach((t) => {
      details.push(
        `${t.title} (ID: ${t.id}) — ${t.status || "todo"} due ${formatDate(t.due_date)}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listTasks",
      note: "Overdue tasks from list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadTask(state) {
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
    title = "Read data — Task";

    if (hintId) {
      const result = await this._callReadTool(
        "getTask",
        { taskId: hintId },
        policy,
      );
      const task = result?.task;
      if (!task) {
        summary = `No task found for ID ${hintId}`;
        details.push("Try listing tasks to see available records.");
        break;
      }
      summary = `Task: ${task.title || hintId}`;
      details.push(`Status: ${task.status || "todo"}`);
      details.push(`Priority: ${task.priority || "medium"}`);
      details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
      details.push(`Dossier ID: ${task.dossier_id || "N/A"}`);
      details.push(`Lawsuit ID: ${task.lawsuit_id || "N/A"}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getTask",
        note: "Task lookup",
      });
      data = task;
      await appendDocumentDetails("task", task);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "listTasks",
        { query: hintName, limit: 10 },
        policy,
      );
      const tasks = result?.tasks || [];
      if (tasks.length === 0) {
        summary = `No task found for "${hintName}"`;
        details.push("Try listing all tasks with: show me my tasks");
      } else if (tasks.length === 1) {
        const task = tasks[0];
        summary = `Task: ${task.title || "Task"}`;
        details.push(`Status: ${task.status || "todo"}`);
        details.push(`Priority: ${task.priority || "medium"}`);
        details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
        details.push(`Dossier ID: ${task.dossier_id || "N/A"}`);
        details.push(`Lawsuit ID: ${task.lawsuit_id || "N/A"}`);
        sources.push({
          sourceType: "system",
          reference: "tool:listTasks",
          note: "Task lookup",
        });
        data = task;
        await appendDocumentDetails("task", task);
      } else {
        summary = `Multiple tasks match "${hintName}"`;
        tasks.forEach((t) =>
          details.push(`${t.title || "Task"} (ID: ${t.id}) — ${t.status || "todo"}`),
        );
        details.push("Please specify which task you mean.");
      }
      break;
    }

    summary = "Which task?";
    details.push("Provide a task ID or title.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainTask(state) {
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
    const scope = String(context?.scope || "").toLowerCase();
    const scopedId = scope === "task" ? context?.taskId : null;
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintName = entityHints.find((hint) => hint.type === "name")?.value;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_TASK && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("task");
      if (applyAggregateResult(aggregateResult)) break;
    }

    if (
      intent === READ_INTENTS.SUMMARIZE_TASK &&
      shouldAggregateSummary &&
      !targetId &&
      !hintName
    ) {
      const listResult = await this._callReadTool(
        "listTasks",
        { limit: 200 },
        policy,
      );
      const tasks = listResult?.tasks || [];
      const pending = tasks.filter(
        (task) =>
          !["done", "cancelled"].includes(
            String(task.status || "").toLowerCase(),
          ),
      );
      const overdue = pending.filter(
        (task) =>
          task.due_date && new Date(task.due_date) < now,
      );
      const byPriority = pending.reduce((acc, task) => {
        const key = String(task.priority || "medium").toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      title = "Read data — Task workload summary";
      summary =
        pending.length > 0
          ? `${pending.length} pending task(s)`
          : "No pending tasks";
      details.push(
        `Overdue: ${overdue.length}`,
      );
      details.push(
        `By priority: ${Object.entries(byPriority)
          .map(([key, count]) => `${key} ${count}`)
          .join(", ") || "N/A"}`,
      );
      details.push(
        `Total tasks in scope: ${tasks.length}`,
      );
      sources.push({
        sourceType: "system",
        reference: "tool:listTasks",
        note: "Pending workload summary",
      });
      data = tasks;
      break;
    }

    let task = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getTask",
        { taskId: targetId },
        policy,
      );
      task = result?.task || null;
    } else if (hintName) {
      const result = await this._callReadTool(
        "listTasks",
        { query: hintName, limit: 5 },
        policy,
      );
      const tasks = result?.tasks || [];
      if (tasks.length === 1) task = tasks[0];
      else if (tasks.length > 1) {
        summary = `Multiple tasks match "${hintName}"`;
        tasks.forEach((t) =>
          details.push(`${t.title || "Task"} (ID: ${t.id}) — ${t.status || "todo"}`),
        );
        details.push("Please specify which task you mean.");
        break;
      }
    }

    if (!task) {
      summary = "Which task?";
      details.push("Provide a task ID or title.");
      break;
    }

    const overdue =
      task.due_date &&
      !["done", "cancelled"].includes(task.status) &&
      new Date(task.due_date) < now;
    const blocked = String(task.status || "").toLowerCase() === "blocked";
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "task", entityId: task.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];

    if (intent === READ_INTENTS.EXPLAIN_TASK_STATE) {
      title = "Read data — Task state";
      summary = `${task.title || "Task"} (ID: ${task.id})`;
      details.push(`Status: ${task.status || "todo"} (priority ${task.priority || "medium"})`);
      details.push(
        `Relationships: dossier ${task.dossier_id || "N/A"}, lawsuit ${task.lawsuit_id || "N/A"}`,
      );
      details.push(
        blocked || overdue
          ? `Blocking: ${blocked ? "blocked" : ""}${blocked && overdue ? ", " : ""}${overdue ? "overdue" : ""}`
          : "Blocking: none detected",
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getTask",
        note: "Task state",
      });
      data = task;
      await appendDocumentDetails("task", task);
      break;
    }

    title = "Read data — Task summary";
    summary = `${task.title || "Task"} (ID: ${task.id})`;
    const recentActivity = historyEvents.map((event) => {
      const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
      return `${when} — ${event.action || "event"}`;
    });
    details.push(
      `Summary: status ${task.status || "todo"}, due ${task.due_date ? formatDate(task.due_date) : "N/A"}`,
    );
    details.push(
      `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
    );
    details.push(`Key dates/risks: ${overdue ? "task overdue" : "no overdue risk"}`);
    sources.push({
      sourceType: "system",
      reference: "tool:getTask",
      note: "Task summary",
    });
    data = task;
    await appendDocumentDetails("task", task);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListTasks,
  handleListOverdueTasks,
  handleReadTask,
  handleExplainTask,
};
