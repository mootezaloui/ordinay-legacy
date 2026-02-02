/**
 * PageLayout.jsx
 * Main layout wrapper for all screens
 * Handles consistent spacing and works with sidebar
 */

import { useEffect } from "react";
import { useSidebar } from "../../contexts/SidebarContext";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import HeaderBar from "../ui/Header";
import Sidebar from "../ui/Sidebar";

export default function PageLayout({ children, fullHeight = false, noHeaderSpacer = false }) {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  useBodyScrollLock(isMobileOpen);

  /* For full-height screens (Agent), prevent the viewport scrollbar
     by locking overflow on <html>. Cleaned up on unmount. */
  useEffect(() => {
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
    ? "flex-1 min-h-0 overflow-hidden flex flex-col pb-7 "
    : "px-4 sm:px-6 lg:px-8 pb-8 pt-6 md:pt-16 flex-1 min-h-0";

  const contentClassName = fullHeight
    ? "w-full h-full flex flex-col"
    : "w-full h-full";

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
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main content with dynamic left margin based on sidebar state */}
      <div
        className={`${fullHeight ? "h-full" : "min-h-full"} flex flex-col ${fullHeight ? "transition-[margin-left]" : "transition-all"} duration-300 ${isCollapsed ? "md:ml-20" : "md:ml-64"} ml-0`}
      >
        {/* Header */}
        <HeaderBar />

        {/* On md+ the header becomes position:fixed (out of flow).
            This spacer reclaims its h-14 slot so <main> starts below it. */}
        {fullHeight && (
          <div className={`hidden md:block flex-shrink-0 ${noHeaderSpacer ? 'h-6' : 'h-14'}`} aria-hidden="true" />
        )}

        {/* Content Area */}
        <main className={mainClassName}>
          <div className={contentClassName}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
