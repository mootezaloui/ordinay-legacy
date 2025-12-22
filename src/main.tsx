import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { SidebarProvider } from "./contexts/SidebarContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { DataProvider } from "./contexts/DataContext";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { NotificationProvider } from "./contexts/NotificationContext";
import AlertBanner from "./components/notifications/AlertBanner";
import { SettingsProvider } from "./contexts/SettingsContext";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <ThemeProvider>
        <NotificationProvider>
          <ToastProvider>
            <DataProvider>
              <AlertBanner />
              <SidebarProvider>
                <ConfirmProvider>
                  <BrowserRouter>
                    <App />
                  </BrowserRouter>
                </ConfirmProvider>
              </SidebarProvider>
            </DataProvider>
          </ToastProvider>
        </NotificationProvider>
      </ThemeProvider>
    </SettingsProvider>
  </StrictMode>
);
