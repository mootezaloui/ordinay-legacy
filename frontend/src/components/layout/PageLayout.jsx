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
    <div className="min-h-full w-full h-full">
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main content with dynamic left margin based on sidebar state */}
      <div
        className={`transition-all duration-300 ${isCollapsed ? "ml-20" : "ml-64"}`}
      >
        {/* Header */}
        <HeaderBar />

        {/* Content Area */}
        <main className="p-4 sm:p-6 lg:p-8 min-h-full w-full">
          <div className="w-full min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}