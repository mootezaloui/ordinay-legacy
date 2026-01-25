import type { ReactNode } from "react";

export type NotificationContextValue = {
  notifications: unknown[];
  alerts: unknown[];
  unreadCount: number;
  addNotification: (notification: unknown) => unknown;
  addAlert: (alert: unknown) => unknown;
  removeAlert: (alertId: number | string) => void;
  markAsRead: (notificationId: number | string) => unknown;
  markAllAsRead: () => unknown;
  deleteNotification: (notificationId: number | string) => unknown;
  clearAll: (options?: Record<string, unknown>) => unknown;
  getNotificationsByType: (type: string) => unknown[];
  getNotificationsByPriority: (priority: string) => unknown[];
  notify: Record<string, (payload?: Record<string, unknown>) => unknown>;
  generateAllNotifications: (data?: Record<string, unknown>) => unknown[];
  getScheduledNotifications: () => unknown[];
  notificationsEnabled: boolean;
  notificationPrefs: Record<string, unknown>;
  [key: string]: unknown;
};

export function NotificationProvider(props: { children: ReactNode }): JSX.Element;
export function NotificationDataBridge(): JSX.Element | null;
export function useNotifications(): NotificationContextValue;
