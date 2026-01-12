/**
 * PageLayout.jsx
 * Main layout wrapper for all screens
 * Handles consistent spacing and works with sidebar
 */

import { useSidebar } from "../../contexts/SidebarContext";
import HeaderBar from "../ui/Header";
import Sidebar from "../ui/Sidebar";

export default function PageLayout({ children }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main content with dynamic left margin based on sidebar state */}
      <div
        className={`transition-all duration-300 ${isCollapsed ? "ml-20" : "ml-64"
          }`}
      >
        {/* Header */}
        <HeaderBar />

        {/* Content Area */}
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="w-full mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}