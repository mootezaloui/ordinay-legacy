import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import notificationScheduler from "../services/notificationScheduler";
import { useSettings } from "./SettingsContext";
import * as notificationService from "../services/notificationService";
import { apiClient } from "../services/api/client";
import { t } from "../i18n";

/**
 * Notification Context
 * Centralized notification management system
 *
 * Features:
 * - Add/Remove notifications
 * - Mark as read/unread
 * - Filter by type/priority
 * - Persist to localStorage
 * - Auto-generate notifications from app events
 * - Scheduled date-based notifications
 */

const NotificationContext = createContext();

/**
 * Helper: Get icon based on entity type and severity
 */
function getIconForEntityType(entityType, severity) {
  if (!entityType) {
    return severity === "error" ? "fas fa-exclamation-circle" : "fas fa-bell";
  }

  const iconMap = {
    client: "fas fa-user",
    dossier: "fas fa-folder",
    case: "fas fa-gavel",
    task: "fas fa-tasks",
    session: "fas fa-calendar-check",
    mission: "fas fa-briefcase",
    financial_entry: "fas fa-dollar-sign",
    personal_task: "fas fa-clipboard-check",
    document: "fas fa-file-upload",
  };

  return iconMap[entityType] || "fas fa-bell";
}

/**
 * Helper: Get navigation link based on entity type and ID
 */
function getLinkForEntity(entityType, entityId) {
  if (!entityType || !entityId) return null;

  const linkMap = {
    client: `/clients/${entityId}`,
    dossier: `/dossiers/${entityId}`,
    case: `/cases/${entityId}`,
    task: `/tasks/${entityId}`,
    session: `/sessions/${entityId}`,
    mission: `/missions/${entityId}`,
    financial_entry: `/accounting`,
    personal_task: `/personal-tasks/${entityId}`,
    document: `/documents/${entityId}`,
  };

  return linkMap[entityType] || null;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const { canNotifyType, notificationsEnabled, notificationPrefs } = useSettings();

  const shouldNotify = useCallback((payload) => {
    const type = payload?.type || payload?.context;
    return canNotifyType(type);
  }, [canNotifyType]);

  // Add new notification
  const addNotification = useCallback(async (notification) => {
    if (!shouldNotify(notification)) {
      console.log("[NOTIFICATION] Skipped due to user preferences", notification);
      return null;
    }

    try {
      // Map priority to valid severity (database constraint: info, warning, error)
      const mapPriorityToSeverity = (priority) => {
        const priorityLower = (priority || '').toLowerCase();
        if (priorityLower === 'urgent' || priorityLower === 'critical' || priorityLower === 'high') {
          return 'error';
        }
        if (priorityLower === 'medium' || priorityLower === 'soon') {
          return 'warning';
        }
        // info, low, success, normal, etc.
        return 'info';
      };

      // Map notification type to valid entity_type (database constraint)
      const mapTypeToEntityType = (type) => {
        const typeMap = {
          'hearing': 'session',
          'payment': 'financial_entry',
          'deadline': 'dossier',
          'proceeding': 'case',
          // Valid types that map directly
          'client': 'client',
          'dossier': 'dossier',
          'case': 'case',
          'task': 'task',
          'session': 'session',
          'mission': 'mission',
          'financial_entry': 'financial_entry',
          'personal_task': 'personal_task',
          'document': 'document',
        };
        return typeMap[type] || null;
      };

      // Determine severity: use existing severity if valid, otherwise map from priority
      let severity = notification.severity || notification.priority || 'info';
      const validSeverities = ['info', 'warning', 'error'];
      if (!validSeverities.includes(severity)) {
        severity = mapPriorityToSeverity(severity);
      }

      // Map notification type to valid entity_type for database
      // Use explicit entityType if provided, otherwise map from type field
      let mappedEntityType = null;
      if (notification.entityType) {
        mappedEntityType = mapTypeToEntityType(notification.entityType);
      } else if (notification.type) {
        mappedEntityType = mapTypeToEntityType(notification.type);
      }

      // Only include entity_type and entity_id if BOTH are present AND valid
      // Backend validation requires both or neither
      const hasEntityId = notification.entityId !== undefined && notification.entityId !== null;
      const hasValidEntityType = mappedEntityType !== null;

      // Check for duplicate notification before creating
      // Avoid creating duplicate notifications for the same entity
      if (hasValidEntityType && hasEntityId) {
        const existingNotification = notifications.find(n =>
          n.entityType === mappedEntityType &&
          n.entityId === notification.entityId &&
          n.title === notification.title &&
          n.status !== 'archived' &&
          // Only check unread or notifications from the last 24 hours
          (!n.read || (new Date() - new Date(n.timestamp)) < 24 * 60 * 60 * 1000)
        );

        if (existingNotification) {
          console.log("[NOTIFICATION] Duplicate detected, skipping:", notification.title);
          return existingNotification.id;
        }
      }

      // Prepare notification data for API
      const notificationData = {
        title: notification.title,
        message: notification.message,
        severity: severity,
        status: notification.read === true ? "read" : "unread",
      };

      if (hasValidEntityType && hasEntityId) {
        notificationData.entity_type = mappedEntityType;
        notificationData.entity_id = notification.entityId;
      }

      // Only include scheduled_at if present
      if (notification.scheduledAt) {
        notificationData.scheduled_at = notification.scheduledAt;
      }

      // Create notification via API
      const createdNotification = await notificationService.createNotification(notificationData);

      // Transform API response to match frontend format
      const frontendNotification = {
        ...createdNotification,
        id: createdNotification.id,
        timestamp: createdNotification.created_at,
        read: createdNotification.status === "read",
        severity: createdNotification.severity,
        priority: createdNotification.severity,
        type: notification.type || "app",
        entityType: createdNotification.entity_type,
        entityId: createdNotification.entity_id,
        icon: notification.icon,
        link: notification.link,
        sticky: notification.sticky,
        meta: notification.meta,
      };

      console.log("[NOTIFICATION] Adding notification:", frontendNotification);
      setNotifications(prev => [frontendNotification, ...prev]);
      return frontendNotification.id;
    } catch (error) {
      console.error("[NOTIFICATION] Failed to create notification:", error);
      // Fallback to local-only notification on error
      const localNotification = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        read: false,
        severity: severity,
        priority: notification.priority || severity || "info",
        entityType: mappedEntityType,
        entityId: notification.entityId,
        ...notification,
      };
      setNotifications(prev => [localNotification, ...prev]);
      return localNotification.id;
    }
  }, [shouldNotify, notifications]);

  // Load notifications from API on mount
  useEffect(() => {
    async function loadNotifications() {
      try {
        const apiNotifications = await notificationService.fetchNotifications();

        // Handle case where API returns undefined or null
        if (!apiNotifications || !Array.isArray(apiNotifications)) {
          console.warn("API returned invalid notifications data:", apiNotifications);
          setNotifications([]);
          return;
        }

        // Transform API notifications to frontend format
        const transformedNotifications = apiNotifications.map(n => ({
          id: n.id,
          title: n.title,
          message: n.message,
          severity: n.severity,
          priority: n.severity,
          status: n.status,
          read: n.status === "read",
          timestamp: n.created_at,
          entityType: n.entity_type,
          entityId: n.entity_id,
          scheduledAt: n.scheduled_at,
          readAt: n.read_at,
          type: "app", // Default type, can be enhanced based on entity_type
          icon: getIconForEntityType(n.entity_type, n.severity),
          link: getLinkForEntity(n.entity_type, n.entity_id),
        }));

        setNotifications(transformedNotifications);

        // Also cache in localStorage for offline access
        localStorage.setItem("organia_notifications", JSON.stringify(transformedNotifications));
      } catch (error) {
        console.error("Failed to load notifications from API:", error);

        // Fallback to localStorage if API fails
        const saved = localStorage.getItem("organia_notifications");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setNotifications(parsed);
          } catch (parseError) {
            console.error("Failed to parse cached notifications:", parseError);
            setNotifications([]);
          }
        } else {
          setNotifications([]);
        }
      }
    }

    loadNotifications();
  }, []);

  // Load entity data for the notification scheduler
  useEffect(() => {
    async function loadEntityData() {
      try {
        console.log("[NOTIFICATION] Loading entity data for scheduler...");

        // Fetch all entities from APIs using apiClient
        const [tasks, personalTasks, sessions, cases, missions, financialEntries, dossiers, clients] = await Promise.all([
          apiClient.get('/tasks').catch(err => { console.error('[NOTIFICATION] Failed to load tasks:', err); return []; }),
          apiClient.get('/personal-tasks').catch(err => { console.error('[NOTIFICATION] Failed to load personal-tasks:', err); return []; }),
          apiClient.get('/sessions').catch(err => { console.error('[NOTIFICATION] Failed to load sessions:', err); return []; }),
          apiClient.get('/cases').catch(err => { console.error('[NOTIFICATION] Failed to load cases:', err); return []; }),
          apiClient.get('/missions').catch(err => { console.error('[NOTIFICATION] Failed to load missions:', err); return []; }),
          apiClient.get('/financial').catch(err => { console.error('[NOTIFICATION] Failed to load financial:', err); return []; }),
          apiClient.get('/dossiers').catch(err => { console.error('[NOTIFICATION] Failed to load dossiers:', err); return []; }),
          apiClient.get('/clients').catch(err => { console.error('[NOTIFICATION] Failed to load clients:', err); return []; }),
        ]);

        // Feed data to scheduler
        notificationScheduler.data = {
          tasks: Array.isArray(tasks) ? tasks : [],
          personalTasks: Array.isArray(personalTasks) ? personalTasks : [],
          sessions: Array.isArray(sessions) ? sessions : [],
          cases: Array.isArray(cases) ? cases : [],
          missions: Array.isArray(missions) ? missions : [],
          financialEntries: Array.isArray(financialEntries) ? financialEntries : [],
          dossiers: Array.isArray(dossiers) ? dossiers : [],
          clients: Array.isArray(clients) ? clients : [],
        };

        console.log("[NOTIFICATION] Entity data loaded:", {
          tasks: (tasks || []).length,
          personalTasks: (personalTasks || []).length,
          sessions: (sessions || []).length,
          cases: (cases || []).length,
          missions: (missions || []).length,
          financialEntries: (financialEntries || []).length,
          dossiers: (dossiers || []).length,
          clients: (clients || []).length,
        });
      } catch (error) {
        console.error("[NOTIFICATION] Failed to load entity data:", error);
        // Set empty arrays to prevent crashes
        notificationScheduler.data = {
          tasks: [],
          personalTasks: [],
          sessions: [],
          cases: [],
          missions: [],
          financialEntries: [],
          dossiers: [],
          clients: [],
        };
      }
    }

    // Load data immediately
    loadEntityData();

    // Reload every 30 minutes (instead of hourly) to keep data fresh
    const dataRefreshInterval = setInterval(loadEntityData, 30 * 60 * 1000);

    return () => {
      clearInterval(dataRefreshInterval);
    };
  }, []);

  // Start scheduler in separate effect with proper dependencies
  useEffect(() => {
    // Start the notification scheduler
    notificationScheduler.start((notification) => {
      // When scheduler generates a notification, add it to the list
      addNotification(notification);
    });

    // Cleanup on unmount
    return () => {
      notificationScheduler.stop();
    };
  }, [addNotification]);

  // Save to localStorage whenever notifications change
  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem("organia_notifications", JSON.stringify(notifications));
    }
  }, [notifications]);

  // Remove alert
  const removeAlert = useCallback((alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  // Add alert (temporary banner notification)
  const addAlert = useCallback((alert) => {
    if (!shouldNotify(alert)) {
      console.log("[NOTIFICATION] Alert suppressed by user preferences", alert);
      return null;
    }

    const duration = alert.duration ?? 5000;
    const newAlert = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      duration,
      ...alert,
    };

    setAlerts(prev => [...prev, newAlert]);

    // Auto-remove after duration (unless explicitly disabled)
    if (typeof duration === "number" && duration > 0) {
      setTimeout(() => {
        removeAlert(newAlert.id);
      }, duration);
    }

    return newAlert.id;
  }, [removeAlert, shouldNotify]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true, status: "read" } : n)
      );
    } catch (error) {
      console.error(`Failed to mark notification ${notificationId} as read:`, error);
      // Still update locally on error for better UX
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true, status: "read" } : n)
      );
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      if (unreadIds.length > 0) {
        await notificationService.markAllAsRead(unreadIds);
      }
      setNotifications(prev => prev.map(n => ({ ...n, read: true, status: "read" })));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      // Still update locally on error for better UX
      setNotifications(prev => prev.map(n => ({ ...n, read: true, status: "read" })));
    }
  }, [notifications]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error(`Failed to delete notification ${notificationId}:`, error);
      // Still update locally on error for better UX
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }
  }, []);

  // Clear all notifications (backend + local)
  const clearAll = useCallback(async () => {
    try {
      // Best-effort delete each notification on the backend
      const ids = notifications.map((n) => n.id).filter(Boolean);
      if (ids.length > 0) {
        await Promise.allSettled(ids.map((id) => notificationService.deleteNotification(id)));
      }
    } catch (error) {
      console.error("Failed to clear notifications on backend:", error);
    } finally {
      setNotifications([]);
      localStorage.removeItem("organia_notifications");
    }
  }, [notifications]);

  // Get unread count
  const unreadCount = notifications.filter(n => !n.read).length;

  // Filter notifications
  const getNotificationsByType = useCallback((type) => {
    return notifications.filter(n => n.type === type);
  }, [notifications]);

  const getNotificationsByPriority = useCallback((priority) => {
    return notifications.filter(n => n.priority === priority);
  }, [notifications]);

  // Notification generators for app events
  const notifyNewClient = useCallback((clientName) => {
    return addNotification({
      type: "client",
      priority: "info",
      title: t("notifications:templates.titles.clientAdded"),
      message: t("notifications:templates.clientAdded", { clientName }),
      icon: "fas fa-user-plus",
      link: "/clients",
    });
  }, [addNotification]);

  const notifyNewDossier = useCallback((dossierNumber, clientName) => {
    return addNotification({
      type: "dossier",
      priority: "info",
      title: t("notifications:templates.titles.dossierCreated"),
      message: t("notifications:templates.dossierCreated", { dossierNumber, clientName }),
      icon: "fas fa-folder-plus",
      link: "/dossiers",
    });
  }, [addNotification]);

  const notifyTaskDue = useCallback((taskTitle, dueDate) => {
    return addNotification({
      type: "task",
      priority: "high",
      title: t("notifications:templates.titles.taskDue"),
      message: t("notifications:templates.taskDue", { taskTitle, dueDate }),
      icon: "fas fa-exclamation-triangle",
      link: "/tasks",
    });
  }, [addNotification]);

  const notifyUpcomingHearing = useCallback((caseNumber, hearingDate) => {
    return addNotification({
      type: "hearing",
      priority: "high",
      title: t("notifications:templates.titles.hearingScheduled"),
      message: t("notifications:templates.hearingScheduled", { caseNumber, hearingDate }),
      icon: "fas fa-gavel",
      link: "/cases",
    });
  }, [addNotification]);

  const notifyPaymentReceived = useCallback((clientName, amount) => {
    return addNotification({
      type: "payment",
      priority: "success",
      title: t("notifications:templates.titles.paymentReceived"),
      message: t("notifications:templates.paymentReceived", { clientName, amount }),
      icon: "fas fa-dollar-sign",
      link: "/accounting",
    });
  }, [addNotification]);

  const notifyDocumentUploaded = useCallback((documentName, dossierNumber) => {
    return addNotification({
      type: "document",
      priority: "info",
      title: t("notifications:templates.titles.documentUploaded"),
      message: t("notifications:templates.documentUploaded", { documentName, dossierNumber }),
      icon: "fas fa-file-upload",
      link: `/dossiers/${dossierNumber}`,
    });
  }, [addNotification]);

  const notifySessionScheduled = useCallback((sessionTitle, date) => {
    return addNotification({
      type: "session",
      priority: "info",
      title: t("notifications:templates.titles.sessionScheduled"),
      message: t("notifications:templates.sessionScheduled", { sessionTitle, date }),
      icon: "fas fa-calendar-check",
      link: "/sessions",
    });
  }, [addNotification]);

  const notifyDeadlineApproaching = useCallback((dossierNumber, daysLeft) => {
    return addNotification({
      type: "deadline",
      priority: daysLeft <= 2 ? "urgent" : "high",
      title: t("notifications:templates.titles.deadlineApproaching"),
      message: t("notifications:templates.deadlineApproaching", { dossierNumber, count: daysLeft }),
      icon: "fas fa-clock",
      link: `/dossiers/${dossierNumber}`,
    });
  }, [addNotification]);

  const severityConfig = useMemo(() => ({
    success: { icon: "fas fa-check-circle", title: t("notifications:severity.success"), duration: 3500 },
    info: { icon: "fas fa-info-circle", title: t("notifications:severity.info"), duration: 4000 },
    warning: { icon: "fas fa-exclamation-triangle", title: t("notifications:severity.warning"), duration: 8500 },
    error: { icon: "fas fa-exclamation-circle", title: t("notifications:severity.error"), duration: 0 }, // 0 => require manual dismissal
  }), []);

  const buildNotification = useCallback((severity, payload = {}) => {
    const config = severityConfig[severity] || severityConfig.info;
    const title = payload.title || config.title;
    const message = payload.message || config.message || "";
    const duration = payload.duration ?? config.duration;

    // Only add to notification center (bell) for errors or if explicitly requested
    // Skip notification center for routine actions, warnings, success, info (toast-only)
    const addToBell = payload.addToBell ?? (severity === "error");

    let notificationId = null;

    if (addToBell) {
      notificationId = addNotification({
        title,
        message,
        icon: payload.icon || config.icon,
        link: payload.link,
        type: payload.type || payload.context || "app",
        priority: payload.priority || severity,
        severity,
        sticky: payload.sticky ?? (severity === "error" || severity === "warning"),
        meta: payload.meta,
      });
    }

    // Always show toast unless explicitly disabled
    if (payload.toast !== false) {
      addAlert({
        type: severity,
        title,
        message,
        action: payload.action,
        duration: duration === 0 ? null : duration,
      });
    }

    return notificationId;
  }, [addAlert, addNotification, severityConfig]);

  const notifier = useMemo(() => ({
    success: (payload) => buildNotification("success", payload),
    info: (payload) => buildNotification("info", payload),
    warning: (payload) => buildNotification("warning", payload),
    error: (payload) => buildNotification("error", payload),
  }), [buildNotification]);

  // Manual trigger for generating all notifications
  const generateAllNotifications = useCallback((data) => {
    const generatedNotifications = notificationScheduler.generateAllNotifications(data);
    generatedNotifications.forEach(notification => {
      addNotification(notification);
    });
    return generatedNotifications;
  }, [addNotification]);

  // Get scheduled notifications
  const getScheduledNotifications = useCallback(() => {
    return notificationScheduler.getScheduledNotifications();
  }, []);

  const value = {
    // State
    notifications,
    alerts,
    unreadCount,

    // Actions
    addNotification,
    addAlert,
    removeAlert,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,

    // Filters & helpers
    getNotificationsByType,
    getNotificationsByPriority,
    notify: notifier,

    // Event generators
    notifyNewClient,
    notifyNewDossier,
    notifyTaskDue,
    notifyUpcomingHearing,
    notifyPaymentReceived,
    notifyDocumentUploaded,
    notifySessionScheduled,
    notifyDeadlineApproaching,

    // Scheduler functions
    generateAllNotifications,
    getScheduledNotifications,

    // Preferences info
    notificationsEnabled,
    notificationPrefs,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
