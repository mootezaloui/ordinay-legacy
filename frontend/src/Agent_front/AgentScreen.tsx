import { AgentLayout } from "./AgentLayout";
import Sidebar from "../components/ui/Sidebar";
import HeaderBar from "../components/ui/Header";
import { useSidebar } from "../contexts/SidebarContext";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

export default function AgentScreen() {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
  useBodyScrollLock(isMobileOpen);

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

      {/* Global Sidebar */}
      <Sidebar />

      {/* Main content area with sidebar offset */}
      <div
        className={`h-full flex flex-col p-0 transition-[margin-left] duration-300 ${
          isCollapsed ? "md:ml-[72px]" : "md:ml-64"
        } ml-0`}
      >
        {/* Global Header */}
        <HeaderBar />

        {/* Header spacer - compensates for fixed header on desktop */}
        <div className="flex-shrink-0 h-0 md:h-14" aria-hidden="true" />

        {/* Agent Intelligence */}
        <div className="flex-1 min-h-0 p-0">
          <AgentLayout isGlobalSidebarCollapsed={isCollapsed} />
        </div>
      </div>
    </div>
  );
}
