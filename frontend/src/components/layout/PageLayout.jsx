/**
 * PageLayout.jsx
 * Main layout wrapper for all screens
 * Handles consistent spacing and works with sidebar
 */

import { useSidebar } from "../../contexts/SidebarContext";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import HeaderBar from "../ui/Header";
import Sidebar from "../ui/Sidebar";

export default function PageLayout({ children }) {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  useBodyScrollLock(isMobileOpen);

  return (
    <div className="min-h-full w-full h-full titlebar-offset-padding overflow-x-hidden">
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
        className={`min-h-full flex flex-col transition-all duration-300 ${isCollapsed ? "md:ml-20" : "md:ml-64"} ml-0`}
      >
        {/* Header */}
        <HeaderBar />

        {/* Content Area - use spacing to soften the header transition */}
        <main className="px-4 sm:px-6 lg:px-8 pb-8 pt-6 md:pt-16 flex-1 min-h-0">
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
