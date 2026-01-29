import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNotificationPreferences } from "../utils/scheduledNotifications";
import { formatDateTimeValue, formatDateValue, getDefaultDateFormat } from "../utils/dateFormat";
import { DEFAULT_LANGUAGE, getInitialLanguage, getLanguageLocale, getSystemLanguage } from "../i18n/config";
import { i18nInstance } from "../i18n";
import { DEFAULT_CURRENCY, formatCurrency as formatCurrencyValue, getCurrencyDisplayLabel, getCurrencyFromSettings, normalizeCurrencyCode } from "../utils/currency";

const STORAGE_KEY = "ordinay_settings";

export const DEFAULT_SETTINGS = {
  language: DEFAULT_LANGUAGE,
  timezone: "Africa/Tunis",
  dateFormat: getDefaultDateFormat(),
  theme: "system",
  currency: DEFAULT_CURRENCY,
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
  // Initialize settings from localStorage synchronously (before first render)
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.settings) {
          const parsedSettings = { ...DEFAULT_SETTINGS, ...parsed.settings };
          const storedLanguage =
            typeof parsed.settings?.language === "string" ? parsed.settings.language : null;
          parsedSettings.language = storedLanguage
            ? getInitialLanguage(storedLanguage)
            : getSystemLanguage();
          parsedSettings.currency = normalizeCurrencyCode(parsedSettings.currency);
          return parsedSettings;
        }
      }
    } catch (error) {
      console.warn("[Settings] Failed to load settings from storage", error);
    }
    return {
      ...DEFAULT_SETTINGS,
      language: getSystemLanguage(),
    };
  });

  // Initialize notification preferences synchronously
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    if (typeof window === "undefined") return getNotificationPreferences();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.notificationPrefs) {
          return { ...getNotificationPreferences(), ...parsed.notificationPrefs };
        }
      }
    } catch (error) {
      console.warn("[Settings] Failed to load notification preferences from storage", error);
    }
    return getNotificationPreferences();
  });

  const [hydrated, setHydrated] = useState(true);

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
    setSettings(prev => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      next.language = getInitialLanguage(next.language);
      next.currency = normalizeCurrencyCode(next.currency);
      return next;
    });
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

  const currency = useMemo(() => getCurrencyFromSettings(settings), [settings]);
  const currencyLocale = useMemo(
    () => getLanguageLocale(settings?.language),
    [settings?.language]
  );
  const currencyDisplay = useMemo(
    () => getCurrencyDisplayLabel(currency, currencyLocale),
    [currency, currencyLocale]
  );

  useEffect(() => {
    if (!i18nInstance?.options) return;
    const interpolation = i18nInstance.options.interpolation || {};
    i18nInstance.options.interpolation = interpolation;
    interpolation.defaultVariables = {
      ...(interpolation.defaultVariables || {}),
      currency: currencyDisplay,
    };
    i18nInstance.emit?.("languageChanged", i18nInstance.language);
  }, [currencyDisplay]);

  const canNotifyType = useCallback((type) => {
    // Global notification toggle
    if (!notificationsEnabled) return false;
    if (!type) return true;

    // Map notification types to preference keys
    const normalized = type.toLowerCase();
    const prefsKeyMap = {
      task: "tasks",
      personaltask: "personalTasks",
      deadline: "tasks",
      session: "sessions",
      hearing: "sessions",
      payment: "payments",
      finance: "payments",
      financial: "payments",
      mission: "missions",
      dossier: "dossiers",
      lawsuit: "lawsuits",
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
    currency,
    currencyDisplay,
    notificationPrefs,
    updateSettings,
    updateNotificationPrefs,
    notificationsEnabled,
    canNotifyType,
    formatDate: (value, options) => formatDateValue(value, settings.dateFormat, options),
    formatDateTime: (value, options) => formatDateTimeValue(value, settings.dateFormat, options),
    formatCurrency: (value, options) =>
      formatCurrencyValue(value, {
        ...options,
        currency,
        locale: currencyLocale,
      }),
  }), [
    hydrated,
    settings,
    currency,
    notificationPrefs,
    updateSettings,
    updateNotificationPrefs,
    notificationsEnabled,
    canNotifyType,
    settings.dateFormat,
    currencyLocale,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
