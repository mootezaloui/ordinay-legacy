import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import notificationScheduler from "../services/notificationScheduler";
import { useSettings } from "./SettingsContext";
import * as notificationService from "../services/notificationService";
import { apiClient } from "../services/api/client";
import { useSeverityConfig } from "../hooks/useNotificationTranslation";
import { buildDedupeKey } from "../utils/notificationDedupe";
import { getAppLicenseState } from "../services/licenseService";
import { filterOperationalEntities } from "../utils/importState";
import {
  mapPriorityToSeverity,
  mapTypeToEntityType,
  getIconForEntityType,
  getLinkForEntity,
  mapEntityTypeToNotificationType,
} from "../services/notifications/mappers";

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
const isLicenseLocked = () => getAppLicenseState() === "LOCKED";

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

  const sortNotificationsByTimestamp = useCallback((list = []) => {
    const safeList = Array.isArray(list) ? [...list] : [];
    const getTime = (item) => {
      const value = item?.timestamp ?? item?.created_at ?? item?.createdAt;
      const time = value ? new Date(value).getTime() : 0;
      return Number.isFinite(time) ? time : 0;
    };

    safeList.sort((a, b) => getTime(b) - getTime(a));
    return safeList;
  }, []);

  const setNotificationsSorted = useCallback((updater) => {
    setNotifications((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return sortNotificationsByTimestamp(next);
    });
  }, [sortNotificationsByTimestamp]);

  const shouldNotify = useCallback((payload) => {
    const type = payload?.type || payload?.context;
    return canNotifyType(type);
  }, [canNotifyType]);

  // Add new notification
  const addNotification = useCallback(async (notification) => {
    if (isLicenseLocked()) {
      return null;
    }
    if (!shouldNotify(notification)) {
      console.log("[NOTIFICATION] Skipped due to user preferences", notification);
      return null;
    }

    const dedupeKey = notification.dedupe_key || notification.dedupeKey || buildDedupeKey({
      ...notification,
      entityType: notification.entityType,
      entityId: notification.entityId,
      payload: notification.params || notification.payload,
    });

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

    try {

      // Only include entity_type and entity_id if BOTH are present AND valid
      // Backend validation requires both or neither
      const hasEntityId = notification.entityId !== undefined && notification.entityId !== null;
      const hasValidEntityType = mappedEntityType !== null;

      // Prepare notification data for API
      // Store template_key and params (language-neutral)
      const notificationData = {
        type: notification.type || "app",
        sub_type: notification.subType,
        template_key: notification.template_key || notification.templateKey || "app.generic",
        payload: JSON.stringify(notification.params || {}),
        severity: severity,
        status: notification.read === true ? "read" : "unread",
        dedupe_key: dedupeKey,
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
      if (!createdNotification || !createdNotification.id) {
        return null;
      }

      // Transform API response to match frontend format
      // Store template_key and params for on-demand translation
      let payload = {};
      try {
        if (typeof createdNotification.payload === 'string') {
          payload = JSON.parse(createdNotification.payload);
        } else if (createdNotification.payload && typeof createdNotification.payload === 'object') {
          payload = createdNotification.payload;
        }
      } catch (parseError) {
        console.warn("[NOTIFICATION] Failed to parse payload:", createdNotification.payload, parseError);
        payload = {};
      }

      const frontendNotification = {
        ...createdNotification,
        id: createdNotification.id,
        timestamp: createdNotification.created_at,
        read: createdNotification.status === "read",
        severity: createdNotification.severity,
        priority: createdNotification.severity,
        type: notification.type || "app",
        subType: createdNotification.sub_type || notification.subType,
        entityType: createdNotification.entity_type,
        entityId: createdNotification.entity_id,
        template_key: createdNotification.template_key,
        dedupe_key: createdNotification.dedupe_key || dedupeKey,
        params: payload,
        icon: notification.icon,
        link: notification.link,
        sticky: notification.sticky,
        meta: notification.meta,
        isLocalOnly: false,
      };

      console.log("[NOTIFICATION] Upserting notification:", frontendNotification);
      setNotificationsSorted(prev => {
        const filtered = prev.filter(n => n.dedupe_key !== frontendNotification.dedupe_key && n.id !== frontendNotification.id);
        return [frontendNotification, ...filtered];
      });
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
        template_key: notification.template_key || notification.templateKey || "app.generic",
        params: notification.params || {},
        icon: notification.icon,
        link: notification.link,
        type: notification.type || "app",
        subType: notification.subType,
        dedupe_key: dedupeKey,
        isLocalOnly: true,
      };
      setNotificationsSorted(prev => {
        const filtered = prev.filter(n => n.dedupe_key !== localNotification.dedupe_key);
        return [localNotification, ...filtered];
      });
      return localNotification.id;
    }
  }, [shouldNotify, notifications, setNotificationsSorted]);

  // Load notifications from API on mount
  useEffect(() => {
    async function loadNotifications() {
      try {
        const apiNotifications = await notificationService.fetchNotifications();

        // Handle case where API returns undefined or null
        if (!apiNotifications || !Array.isArray(apiNotifications)) {
          console.warn("API returned invalid notifications data:", apiNotifications);
          setNotificationsSorted([]);
          return;
        }

        // Transform API notifications to frontend format
        // Store template_key and params for on-demand translation
        const transformedNotifications = apiNotifications.map(n => {
          // Use entity_type to determine type, fallback to 'app'
          const notificationType = mapEntityTypeToNotificationType(n.entity_type);

          // Parse payload to extract params (with safe error handling)
          let payload = {};
          try {
            if (typeof n.payload === 'string') {
              payload = JSON.parse(n.payload);
            } else if (n.payload && typeof n.payload === 'object') {
              payload = n.payload;
            }
          } catch (parseError) {
            console.warn("[NOTIFICATION] Failed to parse notification payload:", n.id, n.payload, parseError);
            payload = {};
          }

          return {
            id: n.id,
            template_key: n.template_key,
            params: payload || {},
            severity: n.severity,
            priority: n.severity,
            status: n.status,
            read: n.status === "read",
            timestamp: n.created_at,
            entityType: n.entity_type,
            entityId: n.entity_id,
            scheduledAt: n.scheduled_at,
            readAt: n.read_at,
            dedupe_key: n.dedupe_key,
            type: notificationType,
            subType: n.sub_type,
            icon: getIconForEntityType(n.entity_type, n.severity),
            link: getLinkForEntity(n.entity_type, n.entity_id),
            isLocalOnly: false,
          };
        });

        setNotificationsSorted(transformedNotifications);

        // Also cache in localStorage for offline access
        localStorage.setItem("organia_notifications", JSON.stringify(transformedNotifications));
      } catch (error) {
        console.error("Failed to load notifications from API:", error);

        // Fallback to localStorage if API fails
        const saved = localStorage.getItem("organia_notifications");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setNotificationsSorted(parsed);
          } catch (parseError) {
            console.error("Failed to parse cached notifications:", parseError);
            setNotificationsSorted([]);
          }
        } else {
          setNotificationsSorted([]);
        }
      }
    }

    loadNotifications();
  }, [setNotificationsSorted]);

  // Load entity data for the notification scheduler
  useEffect(() => {
    async function loadEntityData() {
      try {
        console.log("[NOTIFICATION] Loading entity data for scheduler...");

        // Fetch all entities from APIs using apiClient
        const [tasks, personalTasks, sessions, cases, missions, financialEntries, dossiers, clients, officers] = await Promise.all([
          apiClient.get('/tasks').catch(err => { console.error('[NOTIFICATION] Failed to load tasks:', err); return []; }),
          apiClient.get('/personal-tasks').catch(err => { console.error('[NOTIFICATION] Failed to load personal-tasks:', err); return []; }),
          apiClient.get('/sessions').catch(err => { console.error('[NOTIFICATION] Failed to load sessions:', err); return []; }),
          apiClient.get('/cases').catch(err => { console.error('[NOTIFICATION] Failed to load cases:', err); return []; }),
          apiClient.get('/missions').catch(err => { console.error('[NOTIFICATION] Failed to load missions:', err); return []; }),
          apiClient.get('/financial').catch(err => { console.error('[NOTIFICATION] Failed to load financial:', err); return []; }),
          apiClient.get('/dossiers').catch(err => { console.error('[NOTIFICATION] Failed to load dossiers:', err); return []; }),
          apiClient.get('/clients').catch(err => { console.error('[NOTIFICATION] Failed to load clients:', err); return []; }),
          apiClient.get('/officers').catch(err => { console.error('[NOTIFICATION] Failed to load officers:', err); return []; }),
        ]);

        const toOperational = (items) =>
          filterOperationalEntities(Array.isArray(items) ? items : []);

        // Feed data to scheduler
        notificationScheduler.data = {
          tasks: toOperational(tasks),
          personalTasks: toOperational(personalTasks),
          sessions: toOperational(sessions),
          cases: toOperational(cases),
          missions: toOperational(missions),
          financialEntries: toOperational(financialEntries),
          dossiers: toOperational(dossiers),
          clients: toOperational(clients),
          officers: toOperational(officers),
        };

        const schedulerData = notificationScheduler.data;
        console.log("[NOTIFICATION] Entity data loaded:", {
          tasks: schedulerData.tasks.length,
          personalTasks: schedulerData.personalTasks.length,
          sessions: schedulerData.sessions.length,
          cases: schedulerData.cases.length,
          missions: schedulerData.missions.length,
          financialEntries: schedulerData.financialEntries.length,
          dossiers: schedulerData.dossiers.length,
          clients: schedulerData.clients.length,
          officers: schedulerData.officers.length,
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
          officers: [],
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
  }, [setNotificationsSorted]);

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
  }, [notifications, setNotificationsSorted]);

  // Remove alert
  const removeAlert = useCallback((alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, [setNotificationsSorted]);

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
    const targetNotification = notifications.find(n => n.id === notificationId);
    if (targetNotification?.isLocalOnly) {
      setNotificationsSorted(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true, status: "read" } : n)
      );
      return;
    }
    try {
      await notificationService.markAsRead(notificationId);
      setNotificationsSorted(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true, status: "read" } : n)
      );
    } catch (error) {
      console.error(`Failed to mark notification ${notificationId} as read:`, error);
      // Still update locally on error for better UX
      setNotificationsSorted(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true, status: "read" } : n)
      );
    }
  }, [notifications, setNotificationsSorted]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      if (unreadIds.length > 0) {
        await notificationService.markAllAsRead(unreadIds);
      }
      setNotificationsSorted(prev => prev.map(n => ({ ...n, read: true, status: "read" })));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      // Still update locally on error for better UX
      setNotificationsSorted(prev => prev.map(n => ({ ...n, read: true, status: "read" })));
    }
  }, [notifications, setNotificationsSorted]);

  // Delete notification and persist dismissal (backend handles dedupe suppression)
  const deleteNotification = useCallback(async (notificationId) => {
    const targetNotification = notifications.find(n => n.id === notificationId);
    if (targetNotification?.isLocalOnly) {
      setNotificationsSorted(prev => prev.filter(n => n.id !== notificationId));
      return;
    }
    try {
      await notificationService.deleteNotification(notificationId, { user_id: 1 });
      setNotificationsSorted(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error(`Failed to delete notification ${notificationId}:`, error);
      setNotificationsSorted(prev => prev.filter(n => n.id !== notificationId));
    }
  }, [notifications, setNotificationsSorted]);

  // Clear all notifications (backend + local)
  // Bulk clear all notifications (backend + local)
  const clearAll = useCallback(async (options = {}) => {
    try {
      await notificationService.clearAllNotifications({ user_id: 1, ...options });
    } catch (error) {
      console.error("Failed to clear notifications on backend:", error);
    } finally {
      setNotificationsSorted([]);
      localStorage.removeItem("organia_notifications");
    }
  }, [setNotificationsSorted]);

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
  // Store template_key and params for on-demand translation
  const notifyNewClient = useCallback((clientName) => {
    return addNotification({
      type: "client",
      priority: "info",
      template_key: "templates.clientAdded",
      params: { clientName },
      icon: "fas fa-user-plus",
      link: "/clients",
    });
  }, [addNotification]);

  const notifyNewDossier = useCallback((dossierNumber, clientName) => {
    return addNotification({
      type: "dossier",
      priority: "info",
      template_key: "templates.dossierCreated",
      params: { dossierNumber, clientName },
      icon: "fas fa-folder-plus",
      link: "/dossiers",
    });
  }, [addNotification]);

  const notifyTaskDue = useCallback((taskTitle, dueDate) => {
    return addNotification({
      type: "task",
      priority: "high",
      template_key: "templates.taskDue",
      params: { taskTitle, dueDate },
      icon: "fas fa-exclamation-triangle",
      link: "/tasks",
    });
  }, [addNotification]);

  const notifyUpcomingHearing = useCallback((caseNumber, hearingDate) => {
    return addNotification({
      type: "hearing",
      priority: "high",
      template_key: "templates.hearingScheduled",
      params: { caseNumber, hearingDate },
      icon: "fas fa-gavel",
      link: "/cases",
    });
  }, [addNotification]);

  const notifyPaymentReceived = useCallback((clientName, amount) => {
    return addNotification({
      type: "payment",
      priority: "success",
      template_key: "templates.paymentReceived",
      params: { clientName, amount },
      icon: "fas fa-dollar-sign",
      link: "/accounting",
    });
  }, [addNotification]);

  const notifyDocumentUploaded = useCallback((documentName, dossierNumber) => {
    return addNotification({
      type: "document",
      priority: "info",
      template_key: "templates.documentUploaded",
      params: { documentName, dossierNumber },
      icon: "fas fa-file-upload",
      link: `/dossiers/${dossierNumber}`,
    });
  }, [addNotification]);

  const notifySessionScheduled = useCallback((sessionTitle, date) => {
    return addNotification({
      type: "session",
      priority: "info",
      template_key: "templates.sessionScheduled",
      params: { sessionTitle, date },
      icon: "fas fa-calendar-check",
      link: "/sessions",
    });
  }, [addNotification]);

  const notifyDeadlineApproaching = useCallback((dossierNumber, daysLeft) => {
    return addNotification({
      type: "deadline",
      priority: daysLeft <= 2 ? "urgent" : "high",
      template_key: "templates.deadlineApproaching",
      params: { dossierNumber, count: daysLeft },
      icon: "fas fa-clock",
      link: `/dossiers/${dossierNumber}`,
    });
  }, [addNotification]);

  // Use the hook for severity config (updates with language changes)
  const severityConfig = useSeverityConfig();

  const buildNotification = useCallback((severity, payload = {}) => {
    const config = severityConfig[severity] || severityConfig.info;

    // Use template_key if provided, otherwise use legacy title
    const templateKey = payload.template_key || payload.templateKey;
    const params = payload.params || {};

    const duration = payload.duration ?? config.duration;

    // Only add to notification center (bell) for errors or if explicitly requested
    // Skip notification center for routine actions, warnings, success, info (toast-only)
    const addToBell = payload.addToBell ?? (severity === "error");

    let notificationId = null;

    if (addToBell) {
      notificationId = addNotification({
        template_key: templateKey || `severity.${severity}`,
        params,
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
    // For toasts, we still use translated title/message since they're ephemeral
    if (payload.toast !== false) {
      addAlert({
        type: severity,
        title: payload.title || config.titleKey,
        message: payload.message || "",
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
