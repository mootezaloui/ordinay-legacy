import { apiClient } from "./api/client";
import { buildDedupeKey } from "../utils/notificationDedupe";
import {
  generateTaskNotifications,
  generateSessionNotifications,
  generateMissionNotifications,
  generateDossierNotifications,
} from "../utils/notificationGenerator";

import {
  getSimulatedScheduledNotifications,
  getNotificationsDueNow,
  markNotificationAsSent,
  getNotificationPreferences,
} from "../utils/scheduledNotifications";
import { resolveEntityLink } from "../utils/notificationTemplates";
import { evaluateAllRules } from "./notificationRules";
import { filterOperationalEntities } from "../utils/importState";
import { t } from "../i18n";

// Helper to check if a notification is dismissed for the user (OWNER, id=1)
async function isNotificationDismissed(dedupe_key, user_id = 1) {
  try {
    const params = new URLSearchParams({ dedupe_key, user_id }).toString();
    const result = await apiClient.get(`/notifications/dismissed?${params}`);
    return result.dismissed;
  } catch (error) {
    console.error("Failed to check dismissed notification:", error);
    return false;
  }
}

function resolveEntityId(metadata = {}, fallbackId = null) {
  return (
    metadata.taskId ??
    metadata.personalTaskId ??
    metadata.sessionId ??
    metadata.missionId ??
    metadata.financialEntryId ??
    metadata.dossierId ??
    metadata.lawsuitId ??
    fallbackId
  );
}

function getStableDedupeKey(entityType, subType, entityId, metadata = {}) {
  const resolvedId = resolveEntityId(metadata, entityId);
  if (resolvedId === undefined || resolvedId === null) return null;

  const type = (entityType || "").toLowerCase();
  if (type === "task" || type === "personaltask") {
    return `TASK_DEADLINE:${resolvedId}`;
  }
  if (type === "mission") {
    return `MISSION_DEADLINE:${resolvedId}`;
  }
  if (type === "session" || type === "lawsuit" || type === "dossier") {
    const sessionId = metadata.sessionId || resolvedId;
    if (!sessionId) return null;
    const scheduledAt =
      metadata.scheduledDate ||
      metadata.scheduled_at ||
      metadata.date ||
      metadata.sessionDate ||
      "";
    const normalizedSubType = subType || metadata.subType || "";
    return `HEARING_DATE:${sessionId}:${normalizedSubType}:${scheduledAt}`;
  }
  if (type === "financial" || type === "payment" || type === "financial_entry" || type === "financialentry") {
    return `PAYMENT_STATUS:${resolvedId}`;
  }
  return null;
}

const GROUP_CONFIG = {
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

function pickGroupCategory(ruleResult = {}) {
  const type = (ruleResult.entityType || ruleResult.metadata?.entityType || "").toLowerCase();
  if (type === "task" || type === "personaltask") return null;
  if (type === "mission") return null;
  if (type === "session" || type === "lawsuit") return null;
  if (type === "financial" || type === "payment" || type === "financial_entry" || type === "financialentry") return null;
  return null;
}

function extractDaysLeft(metadata = {}) {
  if (metadata.daysLeft !== undefined) return metadata.daysLeft;
  if (metadata.daysUntil !== undefined) return metadata.daysUntil;
  if (metadata.daysOverdue !== undefined) return -Math.abs(metadata.daysOverdue);
  if (metadata.count !== undefined) return metadata.count;
  return null;
}

function groupRuleNotifications(ruleNotifications = []) {
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

function filterOperationalData(data = {}) {
  return {
    tasks: filterOperationalEntities(data.tasks || []),
    personalTasks: filterOperationalEntities(data.personalTasks || []),
    sessions: filterOperationalEntities(data.sessions || []),
    missions: filterOperationalEntities(data.missions || []),
    dossiers: filterOperationalEntities(data.dossiers || []),
    lawsuits: filterOperationalEntities(data.lawsuits || []),
    clients: filterOperationalEntities(data.clients || []),
    officers: filterOperationalEntities(data.officers || []),
    financialEntries: filterOperationalEntities(data.financialEntries || []),
  };
}
/**
 * Notification Scheduler Service
 * Manages automatic generation and scheduling of behavior-driven notifications
 * Integrates with the intelligent rules engine
 *
 * I18N ARCHITECTURE:
 * - NotificationRules return i18n keys (titleKey, messageKey) and params (titleParams, messageParams)
 * - This scheduler translates them at generation time using the t() function
 * - This ensures notifications are language-aware when created
 */

/**
 * Notification Scheduler Class
 * Handles the scheduling and generation of notifications
 */
class NotificationScheduler {
  constructor() {
    this.intervalId = null;
    this.checkInterval = 60000; // Check every minute
    this.onNotificationGenerated = null;
    this.data = {
      tasks: [],
      sessions: [],
      missions: [],
      financialEntries: [],
      dossiers: [],
      lawsuits: [],
      clients: [],
      personalTasks: [],
    };
    this.scheduledNotifications = getSimulatedScheduledNotifications();
    this.sentNotificationIds = new Set(); // Track sent notifications to avoid duplicates
    this.lastCheckDate = null; // Track last check to run daily checks
  }

  /**
   * Start the scheduler
   */
  start(onNotificationGenerated) {
    if (this.intervalId) {
      console.warn("Scheduler already running");
      return;
    }

    this.onNotificationGenerated = onNotificationGenerated;

    // Run immediately on start
    this.checkAndGenerateNotifications();

    // Then run at intervals
    this.intervalId = setInterval(() => {
      this.checkAndGenerateNotifications();
    }, this.checkInterval);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check for notifications that are due and generate them
   * Enhanced with rules engine and real data integration
   */
  checkAndGenerateNotifications() {
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const preferences = getNotificationPreferences();
    const data = filterOperationalData(this.data || {});

    // Only run full data check once per day
    const shouldRunDailyCheck = this.lastCheckDate !== currentDate;

    if (shouldRunDailyCheck) {
      this.lastCheckDate = currentDate;
      this.sentNotificationIds.clear(); // Reset sent notifications for new day

      // Generate notifications from actual app data
      const generatedNotifications = [];

      try {
        // Generate task notifications from real tasks
        if (preferences.tasks.enabled) {
          const taskNotifs = generateTaskNotifications(data.tasks || [], {
            dossiers: data.dossiers || [],
            lawsuits: data.lawsuits || [],
          });
          // NOTE: Personal tasks are handled by the rules-based system (PersonalTaskRules)
          // not by the old generator, so we don't call generateTaskNotifications for them
          generatedNotifications.push(...taskNotifs);
        }

        // Generate session notifications from real sessions
        if (preferences.sessions.enabled) {
          const sessionNotifs = generateSessionNotifications(
            data.sessions || []
          );
          generatedNotifications.push(...sessionNotifs);
        }

        // Payments are handled by the rules engine (FinancialRules)

        // Generate mission notifications from real missions
        if (preferences.missions.enabled) {
          const missionNotifs = generateMissionNotifications(
            data.missions || []
          );
          generatedNotifications.push(...missionNotifs);
        }

        // Generate dossier notifications from real dossiers
        if (preferences.dossiers.enabled) {
          const dossierNotifs = generateDossierNotifications(
            data.dossiers || []
          );
          generatedNotifications.push(...dossierNotifs);
        }

        // Normalize dedupe keys before filtering
        const normalizedGenerated = generatedNotifications.map((notif) => {
          const dedupe_key =
            notif.dedupe_key ||
            getStableDedupeKey(
              notif.entityType || notif.type,
              notif.subType,
              notif.entityId,
              notif.metadata || notif.params
            );
          return {
            ...notif,
            dedupe_key: dedupe_key || buildDedupeKey({ ...notif, sub_type: notif.subType }),
          };
        });

        // Apply severity gate: only individualize overdue/today/tomorrow
        const gatedNotifications = normalizedGenerated.filter((notif) => {
          const daysLeft = notif.metadata?.daysLeft;
          if (daysLeft === undefined || daysLeft === null) return true;
          const entityType = (notif.entityType || notif.type || "").toLowerCase();
          if (entityType === "dossier") return true;
          return daysLeft < 3; // 0/1 or overdue; group candidates (>=3) are skipped here
        });

        // Filter out already sent notifications and dismissed notifications (async)
        const filterDismissed = async (notif) => {
          if (this.sentNotificationIds.has(notif.id)) return false;
          return !(await isNotificationDismissed(notif.dedupe_key, 1));
        };

        (async () => {
          const checks = await Promise.all(
            gatedNotifications.map(filterDismissed)
          );
          const newNotifications = gatedNotifications.filter(
            (_, i) => checks[i]
          );

          // Send generated notifications
          if (newNotifications.length > 0) {
            newNotifications.forEach((notification) => {
              if (this.onNotificationGenerated) {
                this.onNotificationGenerated(notification);
                this.sentNotificationIds.add(notification.id);
              }
            });
          }
        })();
      } catch (error) {
        console.error(
          "[SCHEDULER] Error generating notifications from real data:",
          error
        );
      }
    }

    // Evaluate intelligent rules engine for behavior-driven notifications
    try {
      const ruleBasedNotifications = evaluateAllRules(now, {
        entities: data,
      });

      (async () => {
        if (ruleBasedNotifications.length > 0) {
          const { individualRules, groupedNotifications } = groupRuleNotifications(ruleBasedNotifications);
          const preparedRuleNotifications = [
            ...individualRules.map((ruleNotif) =>
              this.generateNotificationFromRule(ruleNotif, now)
            ),
            ...groupedNotifications,
          ];

          const ruleChecks = await Promise.all(
            preparedRuleNotifications.map(async (notification) => {
              const dedupe_key =
                notification.dedupe_key ||
                getStableDedupeKey(
                  notification.entityType || notification.type,
                  notification.subType,
                  notification.entityId,
                  notification.metadata || notification.params
                ) ||
                buildDedupeKey({
                  ...notification,
                  sub_type: notification.subType,
                });
              return !(await isNotificationDismissed(dedupe_key, 1));
            })
          );

          const filteredRuleNotifications = preparedRuleNotifications.filter(
            (_, idx) => ruleChecks[idx]
          );

          filteredRuleNotifications.forEach((notification) => {
            if (
              notification &&
              this.onNotificationGenerated &&
              !this.sentNotificationIds.has(notification.id)
            ) {
              this.onNotificationGenerated(notification);
              this.sentNotificationIds.add(notification.id);
            }
          });
        }
      })();
    } catch (error) {
      console.error("[SCHEDULER] Error evaluating notification rules:", error);
    }

    // Also check simulated scheduled notifications (for backwards compatibility)
    const dueNotifications = getNotificationsDueNow(
      this.scheduledNotifications,
      now
    );

    if (dueNotifications.length > 0) {
      dueNotifications.forEach((scheduledNotif) => {
        (async () => {
          try {
            // Generate the actual notification based on the scheduled one
            const notification =
              this.generateNotificationFromScheduled(scheduledNotif);

            const dedupe_key =
              notification &&
              (notification.dedupe_key ||
                buildDedupeKey({
                  ...notification,
                  sub_type: notification.subType,
                }));

            if (
              notification &&
              dedupe_key &&
              this.onNotificationGenerated &&
              !(await isNotificationDismissed(dedupe_key, 1))
            ) {
              this.onNotificationGenerated(notification);

              // Mark as sent
              markNotificationAsSent(scheduledNotif.id);
              scheduledNotif.sent = true;
            }
          } catch (error) {
            console.error("Error generating notification:", error);
          }
        })();
      });
    }
  }

  /**
   * Generate notification from intelligent rule
   * CORRECTED: Stores template_key + params (no translation at generation time)
   */
  generateNotificationFromRule(ruleResult, timestamp = new Date()) {
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
      icon: this.getIconForType(ruleResult.entityType),
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

  /**
   * Get normalized priority key for i18n translation
   */
  getPriorityKey(priority) {
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
   * Generate actual notification from scheduled notification
   */
  generateNotificationFromScheduled(scheduledNotif) {
    // This would fetch the actual entity data and generate the notification
    // For now, we'll create a placeholder notification

    if (!scheduledNotif || typeof scheduledNotif !== "object") {
      console.error(
        "[SCHEDULER] Invalid scheduled notification payload:",
        scheduledNotif
      );
      return null;
    }

    try {
      const baseNotification = {
        id: `${scheduledNotif.type}_${scheduledNotif.subType}_${
          scheduledNotif.entityId || Math.random().toString(16).slice(2)
        }`,
        timestamp: new Date().toISOString(),
        read: false,
        type: scheduledNotif.type,
        subType: scheduledNotif.subType,
        priority: scheduledNotif.priority,
        icon: this.getIconForType(scheduledNotif.type),
        entityId: scheduledNotif.entityId,
        entityType: scheduledNotif.entityType || scheduledNotif.type,
      };

      const link = resolveEntityLink(baseNotification.entityType, {
        entityId: baseNotification.entityId,
        dossierId: scheduledNotif.dossierId,
        lawsuitId: scheduledNotif.lawsuitId,
        clientId: scheduledNotif.clientId,
        missionId: scheduledNotif.missionId,
      });

      // Get message using i18n - try specific subType first, then fallback to generic
      const getMessageForType = (type, subType, entityId) => {
        // Try specific subType message key
        const subTypeKey = `notifications:content.${type}.${subType}.message`;
        const genericKey = `notifications:content.${type}.generic.message`;

        // Get translated message with entityId as fallback context
        const message = t(subTypeKey, { id: entityId, defaultValue: "" });
        if (message) return message;

        // Try generic message for the entity type
        const genericMessage = t(genericKey, { id: entityId, defaultValue: "" });
        if (genericMessage) return genericMessage;

        // Final fallback using center types
        return t(`notifications:center.types.${type}`, {
          defaultValue: t("notifications:center.notification"),
        });
      };

      const titleMap = {
        task: this.getTitleForTaskNotification(scheduledNotif.subType),
        session: this.getTitleForSessionNotification(scheduledNotif.subType),
        payment: this.getTitleForPaymentNotification(scheduledNotif.subType),
        mission: this.getTitleForMissionNotification(scheduledNotif.subType),
        dossier: this.getTitleForDossierNotification(scheduledNotif.subType),
      };

      return {
        ...baseNotification,
        title:
          titleMap[scheduledNotif.type] || t("notifications:center.notification"),
        message: getMessageForType(
          scheduledNotif.type,
          scheduledNotif.subType,
          scheduledNotif.entityId
        ),
        link,
      };
    } catch (error) {
      console.error(
        "[SCHEDULER] Failed to generate scheduled notification:",
        error
      );
      return null;
    }
  }

  /**
   * Get icon for notification type
   */
  getIconForType(type) {
    const iconMap = {
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
    return iconMap[type] || "fas fa-bell";
  }

  /**
   * Get title for task notification (i18n)
   */
  getTitleForTaskNotification(subType) {
    const titleKeys = {
      overdue: "notifications:content.task.overdue.title",
      dueToday: "notifications:content.task.dueToday.title",
      upcoming: "notifications:content.task.upcomingDeadline.title",
      statusCheck: "notifications:content.task.statusCheck.title",
    };
    const key = titleKeys[subType];
    return key ? t(key, { count: 1 }) : t("notifications:center.types.task");
  }

  /**
   * Get title for session notification (i18n)
   */
  getTitleForSessionNotification(subType) {
    const titleKeys = {
      today: "notifications:content.session.today.title",
      tomorrow: "notifications:content.session.tomorrow.title",
      preparation: "notifications:content.session.preparation.title",
      upcomingHearing: "notifications:content.session.upcomingHearing.title",
      hearingToday: "notifications:content.session.hearingToday.title",
    };
    const key = titleKeys[subType];
    return key ? t(key, { count: 1 }) : t("notifications:center.types.session");
  }

  /**
   * Get title for payment notification (i18n)
   */
  getTitleForPaymentNotification(subType) {
    const titleKeys = {
      overdue: "notifications:content.financial.paymentOverdue.title",
      overduePayment: "notifications:content.financial.overduePayment.title",
      dueToday: "notifications:content.financial.paymentDueToday.title",
      upcoming: "notifications:content.financial.upcomingPayment.title",
      upcomingPayment: "notifications:content.financial.upcomingPayment.title",
    };
    const key = titleKeys[subType];
    return key ? t(key, { count: 1 }) : t("notifications:center.types.payment");
  }

  /**
   * Get title for mission notification (i18n)
   */
  getTitleForMissionNotification(subType) {
    const titleKeys = {
      today: "notifications:content.mission.dueToday.title",
      dueToday: "notifications:content.mission.dueToday.title",
      upcoming: "notifications:content.mission.upcoming.title",
      upcomingDeadline: "notifications:content.mission.upcomingDeadline.title",
      completion: "notifications:content.mission.completion.title",
      completionReminder:
        "notifications:content.mission.completionReminder.title",
      assigned: "notifications:content.domain.missionAssigned.title",
      reassigned: "notifications:content.domain.missionReassigned.title",
    };
    const key = titleKeys[subType];
    return key ? t(key, { count: 1 }) : t("notifications:center.types.mission");
  }

  /**
   * Get title for dossier notification (i18n)
   */
  getTitleForDossierNotification(subType) {
    const titleKeys = {
      statusUpdate: "notifications:content.dossier.statusUpdateNeeded.title",
      inactivityReminder:
        "notifications:content.dossier.inactivityReminder.title",
      review: "notifications:content.dossier.generalReview.title",
      reviewReminder: "notifications:content.dossier.reviewReminder.title",
    };
    const key = titleKeys[subType];
    return key ? t(key, { count: 1 }) : t("notifications:center.types.dossier");
  }

  /**
   * Manually trigger notification generation for all entities
   * Useful for testing or manual refresh
   */
  generateAllNotifications(data) {
    this.data = data || this.data;
    const operationalData = filterOperationalData(this.data || {});
    const preferences = getNotificationPreferences();
    const allNotifications = [];

    if (preferences.tasks.enabled) {
      allNotifications.push(...generateTaskNotifications(operationalData.tasks || [], {
        dossiers: operationalData.dossiers || [],
        lawsuits: operationalData.lawsuits || [],
      }));
      // NOTE: Personal tasks are handled by the rules-based system (PersonalTaskRules)
      // not by the old generator
    }

    if (preferences.sessions.enabled) {
      allNotifications.push(
        ...generateSessionNotifications(operationalData.sessions || [])
      );
    }

    // Payments are handled by the rules engine (FinancialRules)

    if (preferences.missions.enabled) {
      allNotifications.push(
        ...generateMissionNotifications(operationalData.missions || [])
      );
    }

    if (preferences.dossiers.enabled) {
      allNotifications.push(
        ...generateDossierNotifications(operationalData.dossiers || [])
      );
    }

    return allNotifications;
  }

  /**
   * Add a new scheduled notification
   */
  addScheduledNotification(notification) {
    this.scheduledNotifications.push(notification);
  }

  /**
   * Remove a scheduled notification
   */
  removeScheduledNotification(notificationId) {
    this.scheduledNotifications = this.scheduledNotifications.filter(
      (n) => n.id !== notificationId
    );
  }

  /**
   * Get all scheduled notifications
   */
  getScheduledNotifications() {
    return this.scheduledNotifications;
  }

  /**
   * Get pending scheduled notifications
   */
  getPendingScheduledNotifications() {
    return this.scheduledNotifications.filter((n) => !n.sent);
  }
}

// Create singleton instance
const notificationScheduler = new NotificationScheduler();

export default notificationScheduler;




