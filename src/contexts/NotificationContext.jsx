import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import notificationScheduler from "../services/notificationScheduler";

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

  // Load notifications from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("organia_notifications");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNotifications(parsed);
      } catch (error) {
        console.error("Failed to load notifications:", error);
      }
    } else {
      // Initialize with sample notifications
      setNotifications(getInitialNotifications());
    }

    // Start the notification scheduler
    notificationScheduler.start((notification) => {
      // When scheduler generates a notification, add it to the list
      addNotification(notification);
    });

    // Cleanup on unmount
    return () => {
      notificationScheduler.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [removeAlert]);

  // Add new notification
  const addNotification = useCallback((notification) => {
    const newNotification = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      read: false,
      severity: notification.severity || notification.priority || "info",
      priority: notification.priority || notification.severity || "info",
      ...notification,
    };

    setNotifications(prev => [newNotification, ...prev]);
    return newNotification.id;
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Delete notification
  const deleteNotification = useCallback((notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    localStorage.removeItem("organia_notifications");
  }, []);

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
      title: "Nouveau Client",
      message: `Le client "${clientName}" a été ajouté avec succès.`,
      icon: "fas fa-user-plus",
      link: "/clients",
    });
  }, [addNotification]);

  const notifyNewDossier = useCallback((dossierNumber, clientName) => {
    return addNotification({
      type: "dossier",
      priority: "info",
      title: "Nouveau Dossier",
      message: `Le dossier ${dossierNumber} a été créé pour ${clientName}.`,
      icon: "fas fa-folder-plus",
      link: "/dossiers",
    });
  }, [addNotification]);

  const notifyTaskDue = useCallback((taskTitle, dueDate) => {
    return addNotification({
      type: "task",
      priority: "high",
      title: "Tâche Urgente",
      message: `"${taskTitle}" doit être terminée le ${dueDate}.`,
      icon: "fas fa-exclamation-triangle",
      link: "/tasks",
    });
  }, [addNotification]);

  const notifyUpcomingHearing = useCallback((caseNumber, hearingDate) => {
    return addNotification({
      type: "hearing",
      priority: "high",
      title: "Audience Prochaine",
      message: `L'audience pour ${caseNumber} est prévue le ${hearingDate}.`,
      icon: "fas fa-gavel",
      link: "/cases",
    });
  }, [addNotification]);

  const notifyPaymentReceived = useCallback((clientName, amount) => {
    return addNotification({
      type: "payment",
      priority: "success",
      title: "Paiement Reçu",
      message: `${clientName} a effectué un paiement de ${amount}.`,
      icon: "fas fa-dollar-sign",
      link: "/accounting",
    });
  }, [addNotification]);

  const notifyDocumentUploaded = useCallback((documentName, dossierNumber) => {
    return addNotification({
      type: "document",
      priority: "info",
      title: "Document Ajouté",
      message: `"${documentName}" a été ajouté au dossier ${dossierNumber}.`,
      icon: "fas fa-file-upload",
      link: `/dossiers/${dossierNumber}`,
    });
  }, [addNotification]);

  const notifySessionScheduled = useCallback((sessionTitle, date) => {
    return addNotification({
      type: "session",
      priority: "info",
      title: "Séance Programmée",
      message: `"${sessionTitle}" est programmée pour le ${date}.`,
      icon: "fas fa-calendar-check",
      link: "/sessions",
    });
  }, [addNotification]);

  const notifyDeadlineApproaching = useCallback((dossierNumber, daysLeft) => {
    return addNotification({
      type: "deadline",
      priority: daysLeft <= 2 ? "urgent" : "high",
      title: "Échéance Approchante",
      message: `La date limite pour ${dossierNumber} est dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
      icon: "fas fa-clock",
      link: `/dossiers/${dossierNumber}`,
    });
  }, [addNotification]);

  const severityConfig = useMemo(() => ({
    success: { icon: "fas fa-check-circle", title: "Succes", duration: 3500 },
    info: { icon: "fas fa-info-circle", title: "Info", duration: 4000 },
    warning: { icon: "fas fa-exclamation-triangle", title: "Attention", duration: 8500 },
    error: { icon: "fas fa-exclamation-circle", title: "Erreur", duration: 0 }, // 0 => require manual dismissal
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
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// Initial sample notifications
function getInitialNotifications() {
  const now = new Date();

  return [
    {
      id: 1,
      type: "deadline",
      priority: "urgent",
      title: "Échéance Critique",
      message: "Le dossier #DOS-2024-001 doit être finalisé aujourd'hui!",
      icon: "fas fa-exclamation-circle",
      link: "/dossiers/1",
      timestamp: new Date(now.getTime() - 10 * 60000).toISOString(),
      read: false,
    },
    {
      id: 2,
      type: "hearing",
      priority: "high",
      title: "Audience Demain",
      message: "L'audience pour le dossier #DOS-2024-002 est prévue demain à 10h00.",
      icon: "fas fa-gavel",
      link: "/cases/1",
      timestamp: new Date(now.getTime() - 2 * 3600000).toISOString(),
      read: false,
    },
    {
      id: 3,
      type: "payment",
      priority: "success",
      title: "Paiement Reçu",
      message: "Ahmed Ben Ali a effectué un paiement de 1,500 TND.",
      icon: "fas fa-dollar-sign",
      link: "/accounting",
      timestamp: new Date(now.getTime() - 24 * 3600000).toISOString(),
      read: false,
    },
    {
      id: 4,
      type: "client",
      priority: "info",
      title: "Nouveau Client",
      message: "Sarah Trabelsi a été ajoutée à votre base de clients.",
      icon: "fas fa-user-plus",
      link: "/clients",
      timestamp: new Date(now.getTime() - 48 * 3600000).toISOString(),
      read: true,
    },
    {
      id: 5,
      type: "document",
      priority: "info",
      title: "Document Ajouté",
      message: "Contrat signé ajouté au dossier #DOS-2024-003.",
      icon: "fas fa-file-upload",
      link: "/dossiers/3",
      timestamp: new Date(now.getTime() - 72 * 3600000).toISOString(),
      read: true,
    },
  ];
}
