/**
 * Rule adapter for notification scheduler
 * Converts rule results to notification objects
 */

import { getStableDedupeKey } from "./dedupe";
import { resolveEntityLink } from "../../../utils/notificationTemplates";

/**
 * Icon mapping by entity type
 */
const ICON_MAP = {
  task: "fas fa-tasks",
  personalTask: "fas fa-clipboard-check",
  session: "fas fa-gavel",
  payment: "fas fa-dollar-sign",
  financial: "fas fa-dollar-sign",
  financialEntry: "fas fa-dollar-sign",
  mission: "fas fa-briefcase",
  dossier: "fas fa-folder-open",
  system: "fas fa-bell",
};

/**
 * Get icon for notification type
 */
export function getIconForType(type) {
  return ICON_MAP[type] || "fas fa-bell";
}

/**
 * Get normalized priority key for i18n translation
 */
export function getPriorityKey(priority) {
  const priorityMap = {
    Haute: "high",
    High: "high",
    Urgent: "urgent",
    Moyenne: "medium",
    Medium: "medium",
    Normale: "normal",
    Normal: "normal",
    Basse: "low",
    Low: "low",
  };
  return priorityMap[priority] || priority?.toLowerCase() || "medium";
}

/**
 * Generate notification from rule result
 * Stores template_key + params (no translation at generation time)
 *
 * @param {object} ruleResult - Result from rule evaluation
 * @param {Date} timestamp - Notification timestamp
 * @returns {object} Notification object ready for storage/display
 */
export function generateNotificationFromRule(ruleResult, timestamp = new Date()) {
  // Extract template key from titleKey, removing the .title suffix if present
  // Rules provide keys like "content.session.upcomingHearing.title"
  // We need "content.session.upcomingHearing"
  let templateKey =
    ruleResult.titleKey || ruleResult.messageKey || "app.generic";

  // Remove .title or .message suffix if present
  if (templateKey.endsWith(".title")) {
    templateKey = templateKey.slice(0, -6); // Remove ".title"
  } else if (templateKey.endsWith(".message")) {
    templateKey = templateKey.slice(0, -8); // Remove ".message"
  }

  const titleParams = ruleResult.titleParams || {};
  const messageParams = ruleResult.messageParams || {};

  // Combine all params
  const params = {
    ...titleParams,
    ...messageParams,
    ...ruleResult.metadata,
  };

  const baseNotification = {
    id:
      ruleResult.ruleId ||
      `rule_${ruleResult.entityType}_${
        ruleResult.entityId || "system"
      }_${Date.now()}`,
    timestamp: timestamp.toISOString(),
    read: false,
    type: ruleResult.entityType || "app",
    subType: ruleResult.subType,
    priority: ruleResult.priority || "info",
    icon: getIconForType(ruleResult.entityType),
    entityId: ruleResult.entityId,
    entityType: ruleResult.entityType,
    template_key: templateKey,
    params: params,
    frequency: ruleResult.frequency || "once",
    ruleId: ruleResult.ruleId,
    ruleName: ruleResult.ruleName,
  };

  const dedupe_key = getStableDedupeKey(
    baseNotification.entityType || baseNotification.type,
    baseNotification.subType,
    baseNotification.entityId,
    ruleResult.metadata
  );

  // Resolve link based on entity type and metadata
  const link = resolveEntityLink(baseNotification.entityType, {
    entityId: baseNotification.entityId,
    ...ruleResult.metadata,
  });

  return {
    ...baseNotification,
    dedupe_key,
    link,
  };
}
