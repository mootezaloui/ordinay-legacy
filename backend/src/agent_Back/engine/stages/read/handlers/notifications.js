"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");

async function handleListNotifications(state) {
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
    let entityType = null;
    let entityId = null;
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
      entityType = scope;
      entityId = scopeMap[scope];
    }

    if (!entityType) {
      const hintTypes = [
        "client",
        "dossier",
        "lawsuit",
        "session",
        "task",
        "mission",
        "personal_task",
        "financial_entry",
      ];
      for (const hintType of hintTypes) {
        const hintId = getHintValue("id", hintType);
        const hintRef = getHintValue("reference", hintType);
        const hintName = getHintValue("name", hintType);
        if (hintId) {
          entityType = hintType;
          entityId = hintId;
          break;
        }
        if (hintRef || hintName) {
          const resolution = await this._resolveEntity(
            {
              type: hintType,
              reference: hintRef || undefined,
              nameHint: hintName || undefined,
            },
            policy,
          );
          if (resolution.resolved) {
            entityType = hintType;
            entityId = resolution.entity.id;
            break;
          } else if (resolution.reason === "ambiguous") {
            title = "Read data — Notifications";
            summary = resolution.message;
            resolution.candidates?.forEach((c) =>
              details.push(`${c.name || "Record"}`),
            );
            details.push("Please specify which record you mean.");
            break;
          } else if (resolution.reason === "not_found") {
            title = "Read data — Notifications";
            summary = resolution.message;
            details.push("Try listing records to see available items.");
            break;
          }
        }
      }
      if (summary) break;
    }

    const { notifications } = await this._callReadTool(
      "listNotifications",
      {
        limit: 50,
        status: filters?.status || null,
        severity: filters?.severity || null,
        entityType,
        entityId,
        query: filters?.query || null,
      },
      policy,
    );
    data = notifications;
    title = "Read data — Notifications";
    summary =
      notifications.length > 0
        ? `Found ${notifications.length} notification(s)`
        : "No notifications found";
    notifications.forEach((n) => {
      const type = n.template_key || n.type || "Notification";
      details.push(`${type} — ${n.status || "unread"}`);
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listNotifications",
      note: "Notification list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadNotification(state) {
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
    title = "Read data — Notification";

    if (hintId) {
      const result = await this._callReadTool(
        "getNotification",
        { notificationId: hintId },
        policy,
      );
      const notification = result?.notification;
      if (!notification) {
        summary = "No notification found for that identifier.";
        details.push("Try listing notifications to see available records.");
        break;
      }
      summary = `Notification: ${notification.template_key || notification.type || "Notification"}`;
      details.push(`Status: ${notification.status || "unread"}`);
      details.push(`Severity: ${notification.severity || "info"}`);
      details.push(`Entity: ${notification.entity_type || "N/A"}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getNotification",
        note: "Notification lookup",
      });
      data = notification;
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "listNotifications",
        { query: hintName, limit: 10 },
        policy,
      );
      const notifications = result?.notifications || [];
      if (notifications.length === 0) {
        summary = `No notification found for "${hintName}"`;
        details.push("Try listing all notifications with: show me my notifications");
      } else if (notifications.length === 1) {
        const notification = notifications[0];
        summary = `Notification: ${notification.template_key || notification.type || "Notification"}`;
        details.push(`Status: ${notification.status || "unread"}`);
        details.push(`Severity: ${notification.severity || "info"}`);
        details.push(`Entity: ${notification.entity_type || "N/A"}`);
        sources.push({
          sourceType: "system",
          reference: "tool:listNotifications",
          note: "Notification lookup",
        });
        data = notification;
      } else {
        summary = `Multiple notifications match "${hintName}"`;
        notifications.forEach((n) => {
          const label = n.template_key || n.type || "Notification";
          details.push(`${label} — ${n.status || "unread"}`);
        });
        details.push("Please specify which notification you mean.");
      }
      break;
    }

    summary = "Which notification?";
    details.push("Provide a notification title or type.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainNotification(state) {
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
    const hintId =
      getHintValue("id", "notification") || getHintValue("id");
    const hintName =
      getHintValue("name", "notification") || getHintValue("name");
    const scopedId = scope === "notification" ? context?.notificationId : null;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_NOTIFICATION && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("notification");
      if (applyAggregateResult(aggregateResult)) break;
    }

    let notification = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getNotification",
        { notificationId: targetId },
        policy,
      );
      notification = result?.notification || null;
    } else if (hintName) {
      const result = await this._callReadTool(
        "listNotifications",
        { query: hintName, limit: 10 },
        policy,
      );
      const notifications = result?.notifications || [];
      if (notifications.length === 1) {
        notification = notifications[0];
      } else if (notifications.length > 1) {
        title =
          intent === READ_INTENTS.EXPLAIN_NOTIFICATION_STATE
            ? "Read data — Notification reason"
            : "Read data — Notification summary";
        summary = `Multiple notifications match "${hintName}"`;
        notifications.forEach((n) => {
          const label = n.template_key || n.type || "Notification";
          details.push(`${label} — ${n.status || "unread"}`);
        });
        details.push("Please specify which notification you mean.");
        break;
      }
    }

    if (!notification) {
      summary = "Which notification?";
      details.push("Provide a notification title or type.");
      break;
    }

    const payload = parsePayload(notification.payload);
    const reason =
      payload.reason ||
      payload.message ||
      payload.body ||
      payload.description ||
      payload.title ||
      payload.subject ||
      notification.template_key ||
      notification.type ||
      "N/A";

    if (intent === READ_INTENTS.EXPLAIN_NOTIFICATION_STATE) {
      title = "Read data — Notification reason";
      summary = `Notification: ${notification.template_key || notification.type || "Notification"}`;
      details.push(`Status: ${notification.status || "unread"}`);
      details.push(`Severity: ${notification.severity || "info"}`);
      details.push(
        `Entity: ${notification.entity_type || "N/A"} ${notification.entity_id || ""}`.trim(),
      );
      details.push("Explanation:");
      details.push(`Reason: ${reason}`);
      sources.push({
        sourceType: "system",
        reference: "tool:getNotification",
        note: "Notification reason",
      });
      data = notification;
      break;
    }

    title = "Read data — Notification summary";
    summary = `Notification: ${notification.template_key || notification.type || "Notification"}`;
    details.push(`Status: ${notification.status || "unread"}`);
    details.push(`Severity: ${notification.severity || "info"}`);
    details.push(`Reason: ${reason}`);
    sources.push({
      sourceType: "system",
      reference: "tool:getNotification",
      note: "Notification summary",
    });
    data = notification;
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListNotifications,
  handleReadNotification,
  handleExplainNotification,
};
