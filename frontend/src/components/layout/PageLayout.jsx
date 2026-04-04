/**
 * PageLayout.jsx
 * Main layout wrapper for all screens
 * Handles consistent spacing and works with sidebar
 */

import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSidebar } from "../../contexts/SidebarContext";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import HeaderBar from "../ui/Header";
import Sidebar from "../ui/Sidebar";

// Persistence across remounts shared with AgentScreen
// We use a property on window to allow sync across different layout files
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

export default function PageLayout({ children, fullHeight = false, noHeaderSpacer = false }) {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  const location = useLocation();
  useBodyScrollLock(isMobileOpen);

  // Determine navigation direction
  const baseRoute = "/" + (location.pathname.split("/")[1] || "dashboard");
  const currentIndex = NAVIGATION_ORDER.indexOf(baseRoute);

  // Lock animation class per navigation using refs.
  // useEffect updating window._ordinayLastPageIndex AFTER render means any re-render
  // (e.g. context update mid-animation) would recompute the wrong direction and restart
  // the CSS animation from opacity:0, causing a visible flash. Computing and locking
  // synchronously during render prevents the class from changing on re-renders.
  const animationClassRef = useRef(null);
  const prevIndexRef = useRef(window._ordinayLastPageIndex ?? -1);

  if (prevIndexRef.current !== currentIndex) {
    const lastIdx = window._ordinayLastPageIndex ?? -1;
    animationClassRef.current = (lastIdx === -1 || currentIndex >= lastIdx)
      ? "animate-page-content-up"
      : "animate-page-content-down";
    window._ordinayLastPageIndex = currentIndex;
    prevIndexRef.current = currentIndex;
  }

  const animationClass = animationClassRef.current ?? "animate-page-content-up";

  // Lock overflow on <html> for full-height screens
  useLayoutEffect(() => {
    if (!fullHeight) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, [fullHeight]);


  const rootClassName = fullHeight
    ? "w-full h-screen titlebar-offset-padding overflow-hidden"
    : "min-h-full w-full h-full titlebar-offset-padding overflow-x-hidden";

  const mainClassName = fullHeight
    ? "flex-1 min-h-0 min-w-0 flex flex-col"
    : "px-4 sm:px-6 lg:px-8 pb-8 pt-6 md:pt-16 flex-1 min-h-0 min-w-0";

  return (
    <div className={rootClassName}>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeMobile}
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm md:hidden"
        />
      )}
      {/* Global Sidebar & Header */}
      <Sidebar />
      <HeaderBar />

      {/* Main content area with sidebar offset */}
      <div
        className={`${fullHeight ? "h-full" : "min-h-full"} min-w-0 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isCollapsed ? "md:ml-[72px]" : "md:ml-64"
        } ml-0`}
      >

        {/* Content Area */}
        <main className={mainClassName}>
          <div className={animationClass}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
