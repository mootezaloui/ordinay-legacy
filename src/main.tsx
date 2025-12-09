import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { SidebarProvider } from "./contexts/SidebarContext";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { NotificationProvider } from "./contexts/NotificationContext";
import AlertBanner from "./components/notifications/AlertBanner";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NotificationProvider>
      <AlertBanner />
      <ThemeProvider>
        <SidebarProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SidebarProvider>
      </ThemeProvider>
    </NotificationProvider>
  </StrictMode>
);
