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

        {/* Content Area - use spacing to soften the header transition */}
        <main className="px-4 sm:px-6 lg:px-8 pb-8 pt-16 flex-1 min-h-0">
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
