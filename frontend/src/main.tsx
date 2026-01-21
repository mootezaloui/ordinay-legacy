import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
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
import "@fortawesome/fontawesome-free/css/all.min.css";
import { NotificationProvider } from "./contexts/NotificationContext";
import TutorialOverlay from "./components/tutorial/TutorialOverlay";
import AlertBanner from "./components/notifications/AlertBanner";
import { OnboardingTutorial } from "./components/onboarding";
import { SettingsProvider } from "./contexts/SettingsContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { initializeApiConfig } from "./lib/apiConfig";
import "./index.css";
import App from "./App";

// Initialize API configuration before rendering
// This is critical for Electron where the backend port is dynamic
async function bootstrap() {
  try {
    await initializeApiConfig();
    console.log("[Organia] API configuration initialized");
  } catch (error) {
    console.error("[Organia] Failed to initialize API config:", error);
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
                              <ConfirmProvider>
                                <DataProvider>
                                  <AlertBanner />
                                  <SidebarProvider>
                                    <BrowserRouter>
                                      <App />
                                    </BrowserRouter>
                                  </SidebarProvider>
                                </DataProvider>
                              </ConfirmProvider>
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
