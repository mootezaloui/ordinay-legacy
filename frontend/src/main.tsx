import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { LockProvider } from "./contexts/LockContext";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { SidebarProvider } from "./contexts/SidebarContext";
import { ToastProvider } from "./contexts/ToastContext";
import { SetupProvider } from "./contexts/SetupContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { DataProvider } from "./contexts/DataContext";
import { I18nProvider } from "./contexts/I18nProvider";
import { OperatorProvider } from "./contexts/OperatorContext";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { TutorialProvider } from "./contexts/TutorialContext";
import { LicenseProvider } from "./contexts/LicenseContext";
import { ReferralProvider } from "./contexts/ReferralContext";
import "@fortawesome/fontawesome-free/css/all.min.css";
import {
  NotificationDataBridge,
  NotificationProvider,
} from "./contexts/NotificationContext";
import AlertBanner from "./components/notifications/AlertBanner";
import { SettingsProvider } from "./contexts/SettingsContext";
import ErrorBoundary from "./components/ErrorBoundary";
import OrdinayStartupLoader, {
  useStartupLoader,
} from "./components/brand/OrdinayStartupLoader";
import { initializeApiConfig } from "./lib/apiConfig";
import { AgentSessionsProvider } from "./Agent_front/hooks/useAgentSessions";
import {
  getInitialLanguage,
  getSystemLanguage,
  type LanguageCode,
} from "./i18n/config";
import "./index.css";
import App from "./App";

// Synchronously apply the titlebar class BEFORE React renders.
// TitleBar.jsx also does this via useEffect, but that fires AFTER the first
// paint, causing --titlebar-height to jump from 0→40px mid-transition and
// creating a visible layout gap. Doing it here avoids the flash entirely.
if (window.electronAPI) {
  document.documentElement.classList.add("has-titlebar");
}

// Apply theme class before first paint to prevent startup flash
// (loader rendering in light mode before ThemeProvider effect runs).
(() => {
  const root = document.documentElement;
  const THEME_STORAGE_KEY = "theme";
  const THEME_PREFERENCE_KEY = "themePreference";

  let preference: string | null = null;
  let resolvedTheme: "light" | "dark" | null = null;

  try {
    preference = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (preference !== "light" && preference !== "dark" && preference !== "system") {
      preference = localStorage.getItem(THEME_STORAGE_KEY);
    }
  } catch {
    preference = null;
  }

  if (preference === "light" || preference === "dark") {
    resolvedTheme = preference;
  } else {
    resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
})();

const REQUIRED_STARTUP_SIGNALS = ["setup", "i18n"] as const;
const startupSignals = new Set<string>();
const startupListeners = new Set<() => void>();
const SETTINGS_STORAGE_KEY = "ordinay_settings";
const STARTUP_MESSAGES: Record<LanguageCode, string> = {
  en: "Finding natural balance...",
  fr: "Retrouver l'équilibre naturel...",
  ar: "نبحث عن التوازن الطبيعي...",
};

function resolveStartupLanguage(): LanguageCode {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.settings?.language === "string") {
        return getInitialLanguage(parsed.settings.language);
      }
    }
  } catch {
    // Ignore malformed storage and fall back to system language.
  }

  return getSystemLanguage();
}

const startupMessage = STARTUP_MESSAGES[resolveStartupLanguage()];

function hasAllStartupSignals() {
  return REQUIRED_STARTUP_SIGNALS.every((signal) => startupSignals.has(signal));
}

function notifyStartupListeners() {
  startupListeners.forEach((listener) => listener());
}

function subscribeToStartupSignals(listener: () => void) {
  startupListeners.add(listener);
  return () => {
    startupListeners.delete(listener);
  };
}

(
  window as Window & {
    __ordinaySplash?: { markReady?: (name: string) => void };
  }
).__ordinaySplash = {
  markReady: (name: string) => {
    if (!name) return;
    startupSignals.add(name);
    notifyStartupListeners();
  },
};

function BootstrapApp() {
  const { isLoading, setReady } = useStartupLoader(0);

  useEffect(() => {
    const checkReadiness = () => {
      if (hasAllStartupSignals()) {
        setReady();
      }
    };

    const unsubscribe = subscribeToStartupSignals(checkReadiness);
    checkReadiness();

    return () => {
      unsubscribe();
    };
  }, [setReady]);

  return (
    <>
      <OrdinayStartupLoader isLoading={isLoading} message={startupMessage} />
      <ErrorBoundary>
        <SetupProvider>
          <LockProvider>
            <SettingsProvider>
              <I18nProvider>
                <OperatorProvider>
                  <ThemeProvider>
                    <OnboardingProvider>
                      <TutorialProvider>
                        <NotificationProvider>
                          <ToastProvider>
                            <LicenseProvider>
                              <ReferralProvider>
                                <ConfirmProvider>
                                  <DataProvider>
                                    <NotificationDataBridge />
                                    <AlertBanner />
                                    <SidebarProvider>
                                      <AgentSessionsProvider>
                                        <HashRouter>
                                          <App />
                                        </HashRouter>
                                      </AgentSessionsProvider>
                                    </SidebarProvider>
                                  </DataProvider>
                                </ConfirmProvider>
                              </ReferralProvider>
                            </LicenseProvider>
                          </ToastProvider>
                        </NotificationProvider>
                      </TutorialProvider>
                    </OnboardingProvider>
                  </ThemeProvider>
                </OperatorProvider>
              </I18nProvider>
            </SettingsProvider>
          </LockProvider>
        </SetupProvider>
      </ErrorBoundary>
    </>
  );
}

// Initialize API configuration before rendering
// This is critical for Electron where the backend port is dynamic
async function bootstrap() {
  try {
    await initializeApiConfig();
  } catch (error) {
    console.error("[Ordinay] Failed to initialize API config:", error);
    // Continue anyway - will use fallback URL
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BootstrapApp />
    </StrictMode>,
  );
}

bootstrap();
