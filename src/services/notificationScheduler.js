/**
 * Notification Scheduler Service
 * Manages automatic generation and scheduling of date-related notifications
 */

import {
  generateTaskNotifications,
  generateSessionNotifications,
  generatePaymentNotifications,
  generateMissionNotifications,
  generateDossierNotifications,
} from '../utils/notificationGenerator';

import {
  getSimulatedScheduledNotifications,
  getNotificationsDueNow,
  markNotificationAsSent,
  getNotificationPreferences,
} from '../utils/scheduledNotifications';

/**
 * Notification Scheduler Class
 * Handles the scheduling and generation of notifications
 */
class NotificationScheduler {
  constructor() {
    this.intervalId = null;
    this.checkInterval = 60000; // Check every minute
    this.onNotificationGenerated = null;
    this.scheduledNotifications = getSimulatedScheduledNotifications();
  }

  /**
   * Start the scheduler
   */
  start(onNotificationGenerated) {
    if (this.intervalId) {
      console.warn('Scheduler already running');
      return;
    }

    this.onNotificationGenerated = onNotificationGenerated;

    console.log('📅 Notification Scheduler started');

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
      console.log('📅 Notification Scheduler stopped');
    }
  }

  /**
   * Check for notifications that are due and generate them
   */
  checkAndGenerateNotifications() {
    const now = new Date();
    const dueNotifications = getNotificationsDueNow(this.scheduledNotifications, now);

    if (dueNotifications.length === 0) {
      return;
    }

    console.log(`📬 Found ${dueNotifications.length} notification(s) due now`);

    dueNotifications.forEach(scheduledNotif => {
      try {
        // Generate the actual notification based on the scheduled one
        const notification = this.generateNotificationFromScheduled(scheduledNotif);

        if (notification && this.onNotificationGenerated) {
          this.onNotificationGenerated(notification);

          // Mark as sent
          markNotificationAsSent(scheduledNotif.id);
          scheduledNotif.sent = true;
        }
      } catch (error) {
        console.error('Error generating notification:', error);
      }
    });
  }

  /**
   * Generate actual notification from scheduled notification
   */
  generateNotificationFromScheduled(scheduledNotif) {
    // This would fetch the actual entity data and generate the notification
    // For now, we'll create a placeholder notification

    const baseNotification = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      read: false,
      type: scheduledNotif.type,
      subType: scheduledNotif.subType,
      priority: scheduledNotif.priority,
      icon: this.getIconForType(scheduledNotif.type),
    };

    // Add specific details based on type
    switch (scheduledNotif.type) {
      case 'task':
        return {
          ...baseNotification,
          title: this.getTitleForTaskNotification(scheduledNotif.subType),
          message: `Notification pour tâche #${scheduledNotif.entityId}`,
          link: `/tasks/${scheduledNotif.entityId}`,
        };

      case 'session':
        return {
          ...baseNotification,
          title: this.getTitleForSessionNotification(scheduledNotif.subType),
          message: `Notification pour séance #${scheduledNotif.entityId}`,
          link: `/sessions/${scheduledNotif.entityId}`,
        };

      case 'payment':
        return {
          ...baseNotification,
          title: this.getTitleForPaymentNotification(scheduledNotif.subType),
          message: `Rappel de paiement #${scheduledNotif.entityId}`,
          link: '/accounting',
        };

      case 'mission':
        return {
          ...baseNotification,
          title: this.getTitleForMissionNotification(scheduledNotif.subType),
          message: `Notification pour mission #${scheduledNotif.entityId}`,
          link: `/officers`,
        };

      case 'dossier':
        return {
          ...baseNotification,
          title: this.getTitleForDossierNotification(scheduledNotif.subType),
          message: `Mise à jour nécessaire pour dossier #${scheduledNotif.entityId}`,
          link: `/dossiers/${scheduledNotif.entityId}`,
        };

      default:
        return baseNotification;
    }
  }

  /**
   * Get icon for notification type
   */
  getIconForType(type) {
    const iconMap = {
      task: 'fas fa-tasks',
      session: 'fas fa-gavel',
      payment: 'fas fa-dollar-sign',
      mission: 'fas fa-briefcase',
      dossier: 'fas fa-folder-open',
    };
    return iconMap[type] || 'fas fa-bell';
  }

  /**
   * Get title for task notification
   */
  getTitleForTaskNotification(subType) {
    const titles = {
      overdue: 'Tâche en Retard',
      dueToday: 'Échéance Aujourd\'hui',
      upcoming: 'Tâche à Venir',
      statusCheck: 'Suivi de Tâche',
    };
    return titles[subType] || 'Notification de Tâche';
  }

  /**
   * Get title for session notification
   */
  getTitleForSessionNotification(subType) {
    const titles = {
      today: 'Séance Aujourd\'hui',
      tomorrow: 'Séance Demain',
      preparation: 'Préparation de Séance',
    };
    return titles[subType] || 'Notification de Séance';
  }

  /**
   * Get title for payment notification
   */
  getTitleForPaymentNotification(subType) {
    const titles = {
      overdue: 'Paiement en Retard',
      dueToday: 'Paiement Dû Aujourd\'hui',
      upcoming: 'Paiement à Recevoir',
    };
    return titles[subType] || 'Notification de Paiement';
  }

  /**
   * Get title for mission notification
   */
  getTitleForMissionNotification(subType) {
    const titles = {
      today: 'Mission Aujourd\'hui',
      upcoming: 'Mission Prochaine',
      completion: 'Suivi de Mission',
    };
    return titles[subType] || 'Notification de Mission';
  }

  /**
   * Get title for dossier notification
   */
  getTitleForDossierNotification(subType) {
    const titles = {
      statusUpdate: 'Mise à Jour Nécessaire',
      review: 'Revue de Dossier',
    };
    return titles[subType] || 'Notification de Dossier';
  }

  /**
   * Manually trigger notification generation for all entities
   * Useful for testing or manual refresh
   */
  generateAllNotifications(data) {
    const preferences = getNotificationPreferences();
    const allNotifications = [];

    if (preferences.tasks.enabled) {
      allNotifications.push(...generateTaskNotifications(data.tasks || []));
      allNotifications.push(...generateTaskNotifications(data.personalTasks || []));
    }

    if (preferences.sessions.enabled) {
      allNotifications.push(...generateSessionNotifications(data.sessions || []));
    }

    if (preferences.payments.enabled) {
      allNotifications.push(...generatePaymentNotifications(data.financialEntries || []));
    }

    if (preferences.missions.enabled) {
      allNotifications.push(...generateMissionNotifications(data.missions || []));
    }

    if (preferences.dossiers.enabled) {
      allNotifications.push(...generateDossierNotifications(data.dossiers || []));
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
      n => n.id !== notificationId
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
    return this.scheduledNotifications.filter(n => !n.sent);
  }
}

// Create singleton instance
const notificationScheduler = new NotificationScheduler();

export default notificationScheduler;
