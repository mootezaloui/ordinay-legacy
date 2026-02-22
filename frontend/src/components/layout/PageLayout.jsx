/**
 * PageLayout.jsx
 * Main layout wrapper for all screens
 * Handles consistent spacing and works with sidebar
 */

import { useEffect, useLayoutEffect } from "react";
import { useSidebar } from "../../contexts/SidebarContext";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import HeaderBar from "../ui/Header";
import Sidebar from "../ui/Sidebar";

export default function PageLayout({ children, fullHeight = false, noHeaderSpacer = false }) {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  useBodyScrollLock(isMobileOpen);

  /* For full-height screens (Agent), prevent the viewport scrollbar
     by locking overflow on <html>. Uses useLayoutEffect so the lock
     is applied BEFORE the first paint — useEffect fires AFTER paint,
     leaving a one-frame window where a scrollbar can appear, shift
     viewport width past the md breakpoint, and flip the header from
     fixed→sticky (changing its in-flow height by 56 px). */
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
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main content with dynamic left margin based on sidebar state */}
      <div
        className={`${fullHeight ? "h-full" : "min-h-full"} min-w-0 flex flex-col ${fullHeight ? "transition-[margin-left]" : "transition-all"} duration-300 ${isCollapsed ? "md:ml-20" : "md:ml-64"} ml-0`}
      >
        {/* Header */}
        <HeaderBar />

        {/* Content Area */}
        <main className={mainClassName}>
          {children}
        </main>
      </div>
    </div>
  );
}
