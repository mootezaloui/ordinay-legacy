import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNotificationPreferences } from "../utils/scheduledNotifications";
import { formatDateTimeValue, formatDateValue, getDefaultDateFormat } from "../utils/dateFormat";

const STORAGE_KEY = "organia_settings";

const DEFAULT_SETTINGS = {
  language: "en",
  timezone: "Africa/Tunis",
  dateFormat: getDefaultDateFormat(),
  theme: "system",
  desktopNotifications: true, // Simplified: just enable/disable all notifications
};

const SettingsContext = createContext(null);

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notificationPrefs, setNotificationPrefs] = useState(getNotificationPreferences());
  const [hydrated, setHydrated] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.settings) {
          setSettings(prev => ({ ...prev, ...parsed.settings }));
        }
        if (parsed?.notificationPrefs) {
          setNotificationPrefs(prev => ({ ...prev, ...parsed.notificationPrefs }));
        }
      }
    } catch (error) {
      console.warn("[Settings] Failed to load settings from storage", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist settings & preferences
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ settings, notificationPrefs })
      );
      // Keep theme preference available for ThemeProvider initial load
      if (settings?.theme) {
        window.localStorage.setItem("themePreference", settings.theme);
      }
    } catch (error) {
      console.warn("[Settings] Failed to persist settings", error);
    }
  }, [settings, notificationPrefs]);

  const updateSettings = useCallback((patch) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const updateNotificationPrefs = useCallback((patch) => {
    setNotificationPrefs(prev => {
      if (typeof patch === "function") {
        return patch(prev);
      }
      return { ...prev, ...patch };
    });
  }, []);

  const notificationsEnabled = useMemo(
    () => settings.desktopNotifications !== false,
    [settings.desktopNotifications]
  );

  const canNotifyType = useCallback((type) => {
    // Global notification toggle
    if (!notificationsEnabled) return false;
    if (!type) return true;

    // Map notification types to preference keys
    const normalized = type.toLowerCase();
    const prefsKeyMap = {
      task: "tasks",
      deadline: "tasks",
      session: "sessions",
      hearing: "sessions",
      payment: "payments",
      finance: "payments",
      financial: "payments",
      mission: "missions",
      dossier: "dossiers",
      case: "dossiers",
      client: "clients",
    };

    // Check entity-specific preferences
    const prefKey = prefsKeyMap[normalized];
    if (prefKey && notificationPrefs?.[prefKey]?.enabled === false) {
      return false;
    }

    return true;
  }, [notificationsEnabled, notificationPrefs]);

  const value = useMemo(() => ({
    hydrated,
    settings,
    notificationPrefs,
    updateSettings,
    updateNotificationPrefs,
    notificationsEnabled,
    canNotifyType,
    formatDate: (value, options) => formatDateValue(value, settings.dateFormat, options),
    formatDateTime: (value, options) => formatDateTimeValue(value, settings.dateFormat, options),
  }), [
    hydrated,
    settings,
    notificationPrefs,
    updateSettings,
    updateNotificationPrefs,
    notificationsEnabled,
    canNotifyType,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
