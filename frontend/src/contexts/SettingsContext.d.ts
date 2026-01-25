import type { ReactNode } from "react";

export type Settings = {
  language: string;
  timezone: string;
  dateFormat: string;
  theme: string;
  currency: string;
  desktopNotifications: boolean;
};

export type NotificationPrefs = Record<string, { enabled?: boolean }>;

export type SettingsContextValue = {
  hydrated: boolean;
  settings: Settings;
  currency: string;
  currencyDisplay: string;
  notificationPrefs: NotificationPrefs;
  updateSettings: (
    patch:
      | Partial<Settings>
      | ((prev: Settings) => Partial<Settings> | Settings)
  ) => void;
  updateNotificationPrefs: (
    patch:
      | NotificationPrefs
      | ((prev: NotificationPrefs) => NotificationPrefs)
  ) => void;
  notificationsEnabled: boolean;
  canNotifyType: (type?: string | null) => boolean;
  formatDate: (
    value: Date | number | string | null | undefined,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  formatDateTime: (
    value: Date | number | string | null | undefined,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  formatCurrency: (
    value: number | null | undefined,
    options?: Intl.NumberFormatOptions
  ) => string;
  formatNumber?: (
    value: number | bigint | null | undefined,
    options?: Intl.NumberFormatOptions
  ) => string;
  [key: string]: unknown;
};

export const DEFAULT_SETTINGS: Settings;
export function SettingsProvider(props: { children: ReactNode }): JSX.Element;
export function useSettings(): SettingsContextValue;
