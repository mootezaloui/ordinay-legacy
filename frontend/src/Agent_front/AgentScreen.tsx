import { AgentLayout } from "./AgentLayout";
import Sidebar from "../components/ui/Sidebar";
import HeaderBar from "../components/ui/Header";
import { useSidebar } from "../contexts/SidebarContext";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

// Synchronize with PageLayout persistence
// We use a shared module-level variable to track across the app
// Note: In a larger app, this would be in a context or global state
// But we replicate the PageLayout.jsx pattern here for consistency.
const NAVIGATION_ORDER = [
  "/dashboard",
  "/clients",
  "/dossiers",
  "/lawsuits",
  "/tasks",
  "/sessions",
  "/personal-tasks",
  "/officers",
  "/accounting",
  "/chatbot",
  "/settings",
  "/profile",
  "/notifications"
];

// Reference the same internal counter (this works because they share the same JS bundle environment)
// But to be 100% sure we use the window object for cross-file global state if they were separate (they are not).
// Here we just define it locally for the Agent scope.
let _lastPageIndexAgent = -1;

export default function AgentScreen() {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  const location = useLocation();
  useBodyScrollLock(isMobileOpen);

  // Direction logic same as PageLayout.jsx
  const baseRoute = "/" + (location.pathname.split("/")[1] || "dashboard");
  const currentIndex = NAVIGATION_ORDER.indexOf(baseRoute);
  
  const [animationClass, setAnimationClass] = useState(() => {
    // Use a ref-like approach to get the previous value from the global window or similar
    // To avoid circular dependencies with PageLayout, we'll use a window property or just a shared let
    const lastIdx = (window as any)._ordinayLastPageIndex ?? -1;
    return lastIdx === -1 ? "animate-page-content-up" : currentIndex >= lastIdx ? "animate-page-content-up" : "animate-page-content-down";
  });

  useEffect(() => {
    (window as any)._ordinayLastPageIndex = currentIndex;
  }, [currentIndex]);

  return (
    <div className="fixed inset-0 flex flex-col titlebar-offset-padding overflow-hidden">
      {/* Mobile sidebar overlay */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeMobile}
          className="fixed inset-0 z-30 bg-[#0f172a]/50 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Global Sidebar & Header */}
      <Sidebar />
      <HeaderBar />

      {/* Main content area with sidebar offset */}
      <div
        className={`h-full flex flex-col p-0 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isCollapsed ? "md:ml-[72px]" : "md:ml-64"
        } ml-0`}
      >
        {/* Header spacer - compensates for fixed header on desktop */}
        <div className="flex-shrink-0 h-0 md:h-14" aria-hidden="true" />

        {/* Agent Intelligence */}
        <div 
          className={`flex-1 min-h-0 p-0 ${animationClass}`}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) {
              setAnimationClass("");
            }
          }}
        >
          <AgentLayout isGlobalSidebarCollapsed={isCollapsed} />
        </div>
      </div>
    </div>
  );
}
