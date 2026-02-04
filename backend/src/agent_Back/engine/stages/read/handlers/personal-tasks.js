"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");

async function handleListPersonalTasks(state) {
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
    const statusFilter = normalizeValue(filters?.status);
    const statusParam =
      statusFilter && TASK_STATUSES.has(statusFilter) ? statusFilter : null;
    const { personalTasks } = await this._callReadTool(
      "listPersonalTasks",
      {
        limit: 50,
        status: statusParam,
        priority: filters?.priority || null,
        query: filters?.query || null,
      },
      policy,
    );
    let filteredTasks = personalTasks;
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
    title = "Read data — Personal tasks";
    summary =
      filteredTasks.length > 0
        ? `Found ${filteredTasks.length} personal task(s)`
        : "No personal tasks found";
    filteredTasks.forEach((t) => {
      const due = t.due_date ? ` due ${formatDate(t.due_date)}` : "";
      details.push(
        `${t.title || "Personal task"} (ID: ${t.id}) — ${t.status || "todo"}${due}`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listPersonalTasks",
      note: "Personal task list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadPersonalTask(state) {
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
    title = "Read data — Personal task";

    if (hintId) {
      const result = await this._callReadTool(
        "getPersonalTask",
        { personalTaskId: hintId },
        policy,
      );
      const task = result?.personalTask;
      if (!task) {
        summary = `No personal task found for ID ${hintId}`;
        details.push("Try listing personal tasks to see available records.");
        break;
      }
      summary = `Personal task: ${task.title || hintId}`;
      details.push(`Status: ${task.status || "todo"}`);
      details.push(`Priority: ${task.priority || "medium"}`);
      details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getPersonalTask",
        note: "Personal task lookup",
      });
      data = task;
      await appendDocumentDetails("personal_task", task);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "listPersonalTasks",
        { query: hintName, limit: 10 },
        policy,
      );
      const tasks = result?.personalTasks || [];
      if (tasks.length === 0) {
        summary = `No personal task found for "${hintName}"`;
        details.push("Try listing all personal tasks with: show me my personal tasks");
      } else if (tasks.length === 1) {
        const task = tasks[0];
        summary = `Personal task: ${task.title || "Personal task"}`;
        details.push(`Status: ${task.status || "todo"}`);
        details.push(`Priority: ${task.priority || "medium"}`);
        details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
        sources.push({
          sourceType: "system",
          reference: "tool:listPersonalTasks",
          note: "Personal task lookup",
        });
        data = task;
        await appendDocumentDetails("personal_task", task);
      } else {
        summary = `Multiple personal tasks match "${hintName}"`;
        tasks.forEach((t) =>
          details.push(`${t.title || "Personal task"} (ID: ${t.id}) — ${t.status || "todo"}`),
        );
        details.push("Please specify which personal task you mean.");
      }
      break;
    }

    summary = "Which personal task?";
    details.push("Provide a personal task ID or title.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainPersonalTask(state) {
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
    const targetId =
      hintId ||
      (String(context?.scope || "").toLowerCase() === "personal_task"
        ? context?.taskId
        : null);

    if (
      intent === READ_INTENTS.SUMMARIZE_PERSONAL_TASK &&
      shouldAggregateSummary
    ) {
      const aggregateResult = await buildAggregateSummary("personal_task");
      if (applyAggregateResult(aggregateResult)) break;
    }

    let task = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getPersonalTask",
        { personalTaskId: targetId },
        policy,
      );
      task = result?.personalTask || null;
    } else if (hintName) {
      const result = await this._callReadTool(
        "listPersonalTasks",
        { query: hintName, limit: 5 },
        policy,
      );
      const tasks = result?.personalTasks || [];
      if (tasks.length === 1) task = tasks[0];
      else if (tasks.length > 1) {
        summary = `Multiple personal tasks match "${hintName}"`;
        tasks.forEach((t) =>
          details.push(`${t.title || "Personal task"} (ID: ${t.id}) — ${t.status || "todo"}`),
        );
        details.push("Please specify which personal task you mean.");
        break;
      }
    }

    if (!task) {
      summary = "Which personal task?";
      details.push("Provide a personal task ID or title.");
      break;
    }

    const overdue =
      task.due_date &&
      !["done", "cancelled"].includes(task.status) &&
      new Date(task.due_date) < now;
    const historyResult = await this._callReadTool(
      "listHistoryEvents",
      { entityType: "personal_task", entityId: task.id, limit: 5 },
      policy,
    );
    const historyEvents = historyResult?.historyEvents || [];

    if (intent === READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE) {
      title = "Read data — Personal task state";
      summary = `${task.title || "Personal task"} (ID: ${task.id})`;
      details.push(`Status: ${task.status || "todo"} (priority ${task.priority || "medium"})`);
      details.push(overdue ? "Blocking: overdue" : "Blocking: none detected");
      sources.push({
        sourceType: "system",
        reference: "tool:getPersonalTask",
        note: "Personal task state",
      });
      data = task;
      await appendDocumentDetails("personal_task", task);
      break;
    }

    title = "Read data — Personal task summary";
    summary = `${task.title || "Personal task"} (ID: ${task.id})`;
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
      reference: "tool:getPersonalTask",
      note: "Personal task summary",
    });
    data = task;
    await appendDocumentDetails("personal_task", task);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListPersonalTasks,
  handleReadPersonalTask,
  handleExplainPersonalTask,
};
