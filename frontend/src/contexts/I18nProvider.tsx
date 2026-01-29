import { I18nextProvider } from "react-i18next";
import { useEffect, useState, type ReactNode } from "react";
import { changeAppLanguage, i18nInstance, initI18n } from "../i18n";
import { DEFAULT_LANGUAGE, type LanguageCode } from "../i18n/config";
import { useSettings } from "./SettingsContext";

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const { settings } = useSettings();
  const [ready, setReady] = useState<boolean>(i18nInstance.isInitialized);

  useEffect(() => {
    let cancelled = false;
    const targetLanguage =
      (settings?.language as LanguageCode) ?? DEFAULT_LANGUAGE;

    initI18n(targetLanguage).then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [settings?.language]);

  useEffect(() => {
    if (!ready) return;
    const targetLanguage =
      (settings?.language as LanguageCode) ?? DEFAULT_LANGUAGE;
    void changeAppLanguage(targetLanguage);
  }, [ready, settings?.language]);

  useEffect(() => {
    if (!ready) return;
    const splash = (window as Window & {
      __ordinaySplash?: { markReady?: (name: string) => void };
    }).__ordinaySplash;
    if (splash && typeof splash.markReady === "function") {
      splash.markReady("i18n");
    }
  }, [ready]);

  // Wait for i18n to be ready before rendering children
  if (!ready) {
    return null;
  }

  return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
}
