/**
 * Notification Scheduler Service
 * Manages automatic generation and scheduling of behavior-driven notifications
 * Integrates with the intelligent rules engine
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
import { evaluateAllRules } from "./notificationRules";

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
          const personalTaskNotifs =
            generateTaskNotifications(data.personalTasks || []);
          generatedNotifications.push(...taskNotifs, ...personalTaskNotifs);
        }

        // Generate session notifications from real sessions
        if (preferences.sessions.enabled) {
          const sessionNotifs = generateSessionNotifications(data.sessions || []);
          generatedNotifications.push(...sessionNotifs);
        }

        // Generate payment notifications from real financial entries
        if (preferences.payments.enabled) {
          const paymentNotifs = generatePaymentNotifications(data.financialEntries || []);
          generatedNotifications.push(...paymentNotifs);
        }

        // Generate mission notifications from real missions
        if (preferences.missions.enabled) {
          const missionNotifs = generateMissionNotifications(data.missions || []);
          generatedNotifications.push(...missionNotifs);
        }

        // Generate dossier notifications from real dossiers
        if (preferences.dossiers.enabled) {
          const dossierNotifs = generateDossierNotifications(data.dossiers || []);
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
   */
  generateNotificationFromRule(ruleResult, timestamp = new Date()) {
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
      title: ruleResult.title,
      message: ruleResult.message,
      metadata: ruleResult.metadata || {},
      frequency: ruleResult.frequency || "once",
      ruleId: ruleResult.ruleId,
      ruleName: ruleResult.ruleName,
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

    const messageMap = {
      task: `Notification pour tâche #${scheduledNotif.entityId}`,
      session: `Notification pour séance #${scheduledNotif.entityId}`,
      payment: `Rappel de paiement #${scheduledNotif.entityId}`,
      mission: `Notification pour mission #${scheduledNotif.entityId}`,
      dossier: `Mise à jour nécessaire pour dossier #${scheduledNotif.entityId}`,
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
      title: titleMap[scheduledNotif.type] || "Notification",
      message: messageMap[scheduledNotif.type] || "Notification",
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
   * Get title for task notification
   */
  getTitleForTaskNotification(subType) {
    const titles = {
      overdue: "Tâche en Retard",
      dueToday: "Échéance Aujourd'hui",
      upcoming: "Tâche à Venir",
      statusCheck: "Suivi de Tâche",
    };
    return titles[subType] || "Notification de Tâche";
  }

  /**
   * Get title for session notification
   */
  getTitleForSessionNotification(subType) {
    const titles = {
      today: "Séance Aujourd'hui",
      tomorrow: "Séance Demain",
      preparation: "Préparation de Séance",
      statusUpdate: "Mise à Jour Séance",
      postponed: "Séance Reportée",
    };
    return titles[subType] || "Notification de Séance";
  }

  /**
   * Get title for payment notification
   */
  getTitleForPaymentNotification(subType) {
    const titles = {
      overdue: "Paiement en Retard",
      dueToday: "Paiement Dû Aujourd'hui",
      upcoming: "Paiement à Recevoir",
    };
    return titles[subType] || "Notification de Paiement";
  }

  /**
   * Get title for mission notification
   */
  getTitleForMissionNotification(subType) {
    const titles = {
      today: "Mission Aujourd'hui",
      upcoming: "Mission Prochaine",
      completion: "Suivi de Mission",
      dueToday: "Mission Échéance Aujourd'hui",
      assigned: "Nouvelle Mission",
      documentsCheck: "Documents Mission",
      reassigned: "Mission Réassignée",
    };
    return titles[subType] || "Notification de Mission";
  }

  /**
   * Get title for dossier notification
   */
  getTitleForDossierNotification(subType) {
    const titles = {
      statusUpdate: "Mise à Jour Nécessaire",
      review: "Revue de Dossier",
    };
    return titles[subType] || "Notification de Dossier";
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
