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
    <div className="min-h-full w-full h-full titlebar-offset-padding">
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main content with dynamic left margin based on sidebar state */}
      <div
        className={`min-h-full flex flex-col transition-all duration-300 ${isCollapsed ? "ml-20" : "ml-64"}`}
      >
        {/* Header */}
        <HeaderBar />

        {/* Content Area - pt-20 accounts for fixed header height
            flex-1 and min-h-0 enable proper flex child behavior for nested scrolling */}
        <main className="px-4 sm:px-6 lg:px-8 pb-8 pt-20 flex-1 min-h-0">
          <div className="w-full h-full max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}