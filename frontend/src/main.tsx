import { StrictMode } from "react";
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
import { NotificationDataBridge, NotificationProvider } from "./contexts/NotificationContext";
import AlertBanner from "./components/notifications/AlertBanner";
import { SettingsProvider } from "./contexts/SettingsContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { initializeApiConfig } from "./lib/apiConfig";
import "./index.css";
import App from "./App";

// Synchronously apply the titlebar class BEFORE React renders.
// TitleBar.jsx also does this via useEffect, but that fires AFTER the first
// paint, causing --titlebar-height to jump from 0→40px mid-transition and
// creating a visible layout gap. Doing it here avoids the flash entirely.
if (window.electronAPI) {
  document.documentElement.classList.add("has-titlebar");
}

// Initialize API configuration before rendering
// This is critical for Electron where the backend port is dynamic
async function bootstrap() {
  try {
    await initializeApiConfig();
    console.log("[Ordinay] API configuration initialized");
  } catch (error) {
    console.error("[Ordinay] Failed to initialize API config:", error);
    // Continue anyway - will use fallback URL
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
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
                                      <HashRouter>
                                        <App />
                                      </HashRouter>
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
    </StrictMode>
  );
}

bootstrap();
