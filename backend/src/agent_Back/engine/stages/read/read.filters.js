"use strict";

function buildFilterHelpers({
  now,
  aggregateFilters,
  TASK_STATUSES,
  ACTIVE_CASE_STATUSES,
}) {
  const isFinancialOverdue = (entry) =>
    entry?.due_date &&
    !entry?.paid_at &&
    new Date(entry.due_date) < now;

  const isMissionOverdue = (mission) =>
    mission?.due_date &&
    !["done", "completed", "closed", "cancelled"].includes(
      String(mission.status || "").toLowerCase(),
    ) &&
    new Date(mission.due_date) < now;

  const isSessionOverdue = (session) =>
    session?.scheduled_at &&
    !["done", "completed", "closed", "cancelled"].includes(
      String(session.status || "").toLowerCase(),
    ) &&
    new Date(session.scheduled_at) < now;

  const normalizeValue = (value) =>
    value === null || value === undefined
      ? null
      : String(value).toLowerCase();

  const formatCountMap = (map) =>
    Object.entries(map)
      .map(([key, count]) => `${key} ${count}`)
      .join(", ");

  const countBy = (items, getKey) => {
    return (items || []).reduce((acc, item) => {
      const key = normalizeValue(getKey(item));
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  };

  const applyAggregateFilters = (items, entityType) => {
    if (!Array.isArray(items)) return [];
    let filtered = [...items];
    const status = normalizeValue(aggregateFilters.status);
    const priority = normalizeValue(aggregateFilters.priority);
    const activity = normalizeValue(aggregateFilters.activity);
    const overdue = Boolean(aggregateFilters.overdue);

    const isActiveTaskFilter =
      activity === "active" ||
      ["active", "open", "pending"].includes(status || "");

    if (entityType === "task" || entityType === "personal_task") {
      if (isActiveTaskFilter) {
        filtered = filtered.filter(
          (item) =>
            !["done", "completed", "cancelled"].includes(
              String(item.status || "").toLowerCase(),
            ),
        );
      } else if (status && TASK_STATUSES.has(status)) {
        filtered = filtered.filter(
          (item) => normalizeValue(item.status) === status,
        );
      } else if (status && !TASK_STATUSES.has(status)) {
        filtered = filtered.filter(
          (item) => normalizeValue(item.status) === status,
        );
      }
    } else if (status) {
      if (
        status === "active" &&
        (entityType === "dossier" || entityType === "lawsuit")
      ) {
        filtered = filtered.filter((item) =>
          ACTIVE_CASE_STATUSES.has(normalizeValue(item.status)),
        );
      } else {
        filtered = filtered.filter(
          (item) => normalizeValue(item.status) === status,
        );
      }
    }

    if (priority) {
      filtered = filtered.filter(
        (item) => normalizeValue(item.priority) === priority,
      );
    }

    if (overdue) {
      if (entityType === "task" || entityType === "personal_task") {
        filtered = filtered.filter(
          (item) =>
            item.due_date &&
            !["done", "completed", "cancelled"].includes(
              String(item.status || "").toLowerCase(),
            ) &&
            new Date(item.due_date) < now,
        );
      } else if (entityType === "mission") {
        filtered = filtered.filter((item) => isMissionOverdue(item));
      } else if (entityType === "session") {
        filtered = filtered.filter((item) => isSessionOverdue(item));
      } else if (entityType === "financial_entry") {
        filtered = filtered.filter((item) => isFinancialOverdue(item));
      }
    }

    return filtered;
  };

  return {
    isFinancialOverdue,
    isMissionOverdue,
    isSessionOverdue,
    normalizeValue,
    formatCountMap,
    countBy,
    applyAggregateFilters,
  };
}

module.exports = {
  buildFilterHelpers,
};
