/**
 * Notification grouping logic for scheduler
 * Groups similar notifications to reduce noise (e.g., "5 tasks due this week")
 */

import { resolveEntityId } from "./dedupe";

/**
 * Configuration for grouped notifications by category
 */
export const GROUP_CONFIG = {
  tasks: {
    dedupe: "TASKS_DUE_SOON",
    type: "task",
    title: "Tasks due soon",
    message: (count) => `${count} tasks due in the next 7 days`,
    link: "/tasks?filter=due_soon",
  },
  missions: {
    dedupe: "MISSIONS_DUE_SOON",
    type: "mission",
    title: "Missions due soon",
    message: (count) => `${count} missions due in the next 7 days`,
    link: "/missions?filter=due_soon",
  },
  hearings: {
    dedupe: "HEARINGS_DUE_SOON",
    type: "session",
    title: "Hearings coming up",
    message: (count) => `${count} hearings in the next 7 days`,
    link: "/sessions?filter=upcoming",
  },
  payments: {
    dedupe: "PAYMENTS_DUE_SOON",
    type: "financialEntry",
    title: "Payments due soon",
    message: (count) => `${count} payments due in the next 7 days`,
    link: "/accounting?filter=due_soon",
  },
};

/**
 * Determine which group category a rule result belongs to
 * Currently returns null to disable grouping (all notifications are individual)
 */
export function pickGroupCategory(ruleResult = {}) {
  const type = (ruleResult.entityType || ruleResult.metadata?.entityType || "").toLowerCase();
  if (type === "task" || type === "personaltask") return null;
  if (type === "mission") return null;
  if (type === "session" || type === "lawsuit") return null;
  if (type === "financial" || type === "payment" || type === "financial_entry" || type === "financialentry") return null;
  return null;
}

/**
 * Extract days left from metadata (supports multiple field names)
 */
export function extractDaysLeft(metadata = {}) {
  if (metadata.daysLeft !== undefined) return metadata.daysLeft;
  if (metadata.daysUntil !== undefined) return metadata.daysUntil;
  if (metadata.daysOverdue !== undefined) return -Math.abs(metadata.daysOverdue);
  if (metadata.count !== undefined) return metadata.count;
  return null;
}

/**
 * Group rule-based notifications
 * Separates individual (urgent/today/tomorrow) from groupable notifications
 */
export function groupRuleNotifications(ruleNotifications = []) {
  const individualRules = [];
  const groupedMap = {
    tasks: [],
    missions: [],
    hearings: [],
    payments: [],
  };

  ruleNotifications.forEach((rule) => {
    const daysLeft = extractDaysLeft(rule.metadata || {});
    const category = pickGroupCategory(rule);
    const entityId = resolveEntityId(rule.metadata || {}, rule.entityId);
    const dueDate =
      rule.metadata?.dueDate ||
      rule.metadata?.scheduledDate ||
      rule.metadata?.deadline ||
      rule.messageParams?.dueDate ||
      rule.messageParams?.deadline ||
      null;
    const title =
      rule.messageParams?.taskTitle ||
      rule.messageParams?.missionTitle ||
      rule.messageParams?.lawsuitNumber ||
      rule.messageParams?.dossierNumber ||
      rule.messageParams?.clientName ||
      rule.metadata?.entityLabel ||
      rule.metadata?.entityReference ||
      rule.metadata?.missionTitle ||
      rule.metadata?.taskTitle ||
      `Item ${entityId || ""}`;

    // Group only non-overdue, non-today/tomorrow buckets (>=3 days)
    if (
      category &&
      daysLeft !== null &&
      daysLeft >= 3 &&
      entityId !== undefined &&
      entityId !== null
    ) {
      groupedMap[category].push({
        id: entityId,
        title,
        dueDate,
        daysLeft,
      });
    } else {
      individualRules.push(rule);
    }
  });

  const groupedNotifications = Object.entries(groupedMap)
    .filter(([, items]) => items.length > 0)
    .map(([category, items]) => {
      const config = GROUP_CONFIG[category];
      const count = items.length;
      return {
        id: `${config.dedupe}_GROUP`,
        type: config.type,
        subType: "dueSoonGroup",
        priority: "info",
        severity: "info",
        template_key: `group.${category}.dueSoon`,
        title: config.title,
        message: config.message(count),
        params: { count, items },
        dedupe_key: config.dedupe,
        entityType: config.type,
        entityId: null,
        timestamp: new Date().toISOString(),
        link: config.link,
        read: false,
      };
    });

  return { individualRules, groupedNotifications };
}


