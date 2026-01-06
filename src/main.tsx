import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { SidebarProvider } from "./contexts/SidebarContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { DataProvider } from "./contexts/DataContext";
import { I18nProvider } from "./contexts/I18nProvider";
import { OperatorProvider } from "./contexts/OperatorContext";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { NotificationProvider } from "./contexts/NotificationContext";
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
        <SettingsProvider>
          <I18nProvider>
            <OperatorProvider>
              <ThemeProvider>
                <OnboardingProvider>
                  <NotificationProvider>
                    <ToastProvider>
                      <DataProvider>
                        <AlertBanner />
                        <SidebarProvider>
                          <ConfirmProvider>
                            <BrowserRouter>
                              <App />
                              <OnboardingTutorial />
                            </BrowserRouter>
                          </ConfirmProvider>
                        </SidebarProvider>
                      </DataProvider>
                    </ToastProvider>
                  </NotificationProvider>
                </OnboardingProvider>
              </ThemeProvider>
            </OperatorProvider>
          </I18nProvider>
        </SettingsProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

bootstrap();
