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

import {
  generateTaskNotifications,
  generateSessionNotifications,
  generatePaymentNotifications,
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
import { translateNotificationCopy } from "../utils/notificationVariants";
import { evaluateAllRules } from "./notificationRules";
import { t } from "../i18n";

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
      cases: [],
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

    console.log("[SCHEDULER] Notification Scheduler started");

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
      console.log("[SCHEDULER] Notification Scheduler stopped");
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
    const data = this.data || {};

    // Only run full data check once per day
    const shouldRunDailyCheck = this.lastCheckDate !== currentDate;

    if (shouldRunDailyCheck) {
      console.log("[SCHEDULER] Running daily notification check for real data");
      this.lastCheckDate = currentDate;
      this.sentNotificationIds.clear(); // Reset sent notifications for new day

      // Generate notifications from actual app data
      const generatedNotifications = [];

      try {
        // Generate task notifications from real tasks
        if (preferences.tasks.enabled) {
          const taskNotifs = generateTaskNotifications(data.tasks || []);
          const personalTaskNotifs = generateTaskNotifications(
            data.personalTasks || []
          );
          generatedNotifications.push(...taskNotifs, ...personalTaskNotifs);
        }

        // Generate session notifications from real sessions
        if (preferences.sessions.enabled) {
          const sessionNotifs = generateSessionNotifications(
            data.sessions || []
          );
          generatedNotifications.push(...sessionNotifs);
        }

        // Generate payment notifications from real financial entries
        if (preferences.payments.enabled) {
          const paymentNotifs = generatePaymentNotifications(
            data.financialEntries || []
          );
          generatedNotifications.push(...paymentNotifs);
        }

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

        // Filter out already sent notifications
        const newNotifications = generatedNotifications.filter(
          (notif) => !this.sentNotificationIds.has(notif.id)
        );

        // Send generated notifications
        if (newNotifications.length > 0) {
          console.log(
            `[SCHEDULER] Generated ${newNotifications.length} new notification(s) from real data`
          );

          newNotifications.forEach((notification) => {
            if (this.onNotificationGenerated) {
              this.onNotificationGenerated(notification);
              this.sentNotificationIds.add(notification.id);
            }
          });
        } else {
          console.log("[SCHEDULER] No new notifications to send today");
        }
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
        entities: this.data,
      });

      if (ruleBasedNotifications.length > 0) {
        console.log(
          `[SCHEDULER] Rules engine generated ${ruleBasedNotifications.length} notification(s)`
        );

        ruleBasedNotifications.forEach((ruleNotif) => {
          const notification = this.generateNotificationFromRule(
            ruleNotif,
            now
          );

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
    } catch (error) {
      console.error("[SCHEDULER] Error evaluating notification rules:", error);
    }

    // Also check simulated scheduled notifications (for backwards compatibility)
    const dueNotifications = getNotificationsDueNow(
      this.scheduledNotifications,
      now
    );

    if (dueNotifications.length > 0) {
      console.log(
        `[SCHEDULER] Found ${dueNotifications.length} scheduled notification(s) due now`
      );

      dueNotifications.forEach((scheduledNotif) => {
        try {
          // Generate the actual notification based on the scheduled one
          const notification =
            this.generateNotificationFromScheduled(scheduledNotif);

          if (notification && this.onNotificationGenerated) {
            this.onNotificationGenerated(notification);

            // Mark as sent
            markNotificationAsSent(scheduledNotif.id);
            scheduledNotif.sent = true;
          }
        } catch (error) {
          console.error("Error generating notification:", error);
        }
      });
    }
  }

  /**
   * Generate notification from intelligent rule
   * Translates i18n keys (titleKey, messageKey) using the t() function
   */
  generateNotificationFromRule(ruleResult, timestamp = new Date()) {
    // Translate title and message using i18n keys if available
    // The notification rules provide titleKey/messageKey with titleParams/messageParams
    let translatedTitle = ruleResult.title || "";
    let translatedMessage = ruleResult.message || "";
    const titleParams = ruleResult.titleParams || {};
    const messageParams = { ...(ruleResult.messageParams || {}) };

    // Translate nested domain values (priority) if present
    // Priority values like "Haute", "Moyenne", "Basse" need translation
    if (messageParams.priority) {
      const priorityKey = this.getPriorityKey(messageParams.priority);
      messageParams.priority = t(`notifications:content.priority.${priorityKey}`);
    }

    if (ruleResult.titleKey || ruleResult.messageKey) {
      const translated = translateNotificationCopy({
        titleKey: ruleResult.titleKey,
        messageKey: ruleResult.messageKey,
        titleParams,
        messageParams,
        seedParts: [
          ruleResult.ruleId,
          ruleResult.entityId,
          ruleResult.ruleName,
          ruleResult.subType,
        ],
        timestamp,
      });

      translatedTitle = translated.title || translatedTitle;
      translatedMessage = translated.message || translatedMessage;
    }

    const baseNotification = {
      id:
        ruleResult.ruleId ||
        `rule_${ruleResult.entityType}_${
          ruleResult.entityId || "system"
        }_${Date.now()}`,
      timestamp: timestamp.toISOString(),
      read: false,
      type: ruleResult.entityType,
      subType: ruleResult.subType,
      priority: ruleResult.priority,
      icon: this.getIconForType(ruleResult.entityType),
      entityId: ruleResult.entityId,
      entityType: ruleResult.entityType,
      title: translatedTitle,
      message: translatedMessage,
      metadata: ruleResult.metadata || {},
      frequency: ruleResult.frequency || "once",
      ruleId: ruleResult.ruleId,
      ruleName: ruleResult.ruleName,
      // Store original keys for potential re-translation on language change
      titleKey: ruleResult.titleKey,
      titleParams: ruleResult.titleParams,
      messageKey: ruleResult.messageKey,
      messageParams: ruleResult.messageParams,
    };

    // Resolve link based on entity type and metadata
    const link = resolveEntityLink(baseNotification.entityType, {
      entityId: baseNotification.entityId,
      ...ruleResult.metadata,
    });

    return {
      ...baseNotification,
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
      caseId: scheduledNotif.caseId,
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
  }

  /**
   * Get icon for notification type
   */
  getIconForType(type) {
    const iconMap = {
      task: "fas fa-tasks",
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
      review: "notifications:content.dossier.review.title",
      reviewReminder: "notifications:content.dossier.reviewReminder.title",
      deadlineOverdue: "notifications:content.dossier.deadlineOverdue.title",
      deadlineToday: "notifications:content.dossier.deadlineToday.title",
      deadlineUpcoming: "notifications:content.dossier.deadlineUpcoming.title",
      deadlineWeek: "notifications:content.dossier.deadlineWeek.title",
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
    const preferences = getNotificationPreferences();
    const allNotifications = [];

    if (preferences.tasks.enabled) {
      allNotifications.push(...generateTaskNotifications(data.tasks || []));
      allNotifications.push(
        ...generateTaskNotifications(data.personalTasks || [])
      );
    }

    if (preferences.sessions.enabled) {
      allNotifications.push(
        ...generateSessionNotifications(data.sessions || [])
      );
    }

    if (preferences.payments.enabled) {
      allNotifications.push(
        ...generatePaymentNotifications(data.financialEntries || [])
      );
    }

    if (preferences.missions.enabled) {
      allNotifications.push(
        ...generateMissionNotifications(data.missions || [])
      );
    }

    if (preferences.dossiers.enabled) {
      allNotifications.push(
        ...generateDossierNotifications(data.dossiers || [])
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
