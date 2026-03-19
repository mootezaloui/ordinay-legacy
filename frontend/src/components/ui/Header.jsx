import { useLocation } from "react-router-dom";
import { useState } from "react";
import { useSidebar } from "../../contexts/SidebarContext";
import NotificationDropDown from "../notifications/notificationdropdown";
import UserDropdown from "../user/UserDropdown";
import GlobalSearch from "../Search/GlobalSearch";
import { useTranslation } from "react-i18next";
import { routes } from "../../routes";

export default function HeaderBar() {
  const { isCollapsed, isMobileOpen, toggleMobile } = useSidebar();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const { t } = useTranslation("layout");
  const location = useLocation();

  const handleDropdownToggle = (dropdownName) => {
    setActiveDropdown(activeDropdown === dropdownName ? null : dropdownName);
  };

  const closeAllDropdowns = () => {
    setActiveDropdown(null);
  };

  const resolvePageTitle = () => {
    const currentPath = location.pathname;
    const exactMatch = routes.find((route) => route.path === currentPath);
    if (exactMatch?.label) return exactMatch.label;
    if (exactMatch?.name) return exactMatch.name;

    const dynamicMatch = routes.find((route) => {
      if (!route.path.includes(":")) return false;
      const basePath = route.path.split("/:")[0];
      return currentPath.startsWith(basePath);
    });

    if (dynamicMatch?.label) return dynamicMatch.label;
    if (dynamicMatch?.name) return dynamicMatch.name;

    return t("header.title", { defaultValue: "Ordinay" });
  };

  const pageTitle = resolvePageTitle();

  return (
    <header className={`h-14 bg-[#f8fafc] dark:bg-[#0f172a] text-slate-800 dark:text-slate-100 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-50 titlebar-offset-top sticky inset-x-0 md:fixed ${isCollapsed ? "md:left-[72px]" : "md:left-64"}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center h-14 gap-3">
          {/* Left section */}
          <div className="flex items-center gap-3 flex-1">
            <button
              type="button"
              onClick={toggleMobile}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 shadow-sm relative z-50"
              aria-label={isMobileOpen ? "Close navigation" : "Open navigation"}
              aria-controls="mobile-sidebar"
              aria-expanded={isMobileOpen}
            >
              <i className={`${isMobileOpen ? "fas fa-times" : "fas fa-bars"} text-slate-600 dark:text-slate-300`}></i>
            </button>

            {/* Global Search (desktop only) */}
            <div className="hidden md:block w-full max-w-2xl">
              <GlobalSearch />
            </div>
          </div>

          {/* Mobile title */}
          <div className="absolute left-1/2 -translate-x-1/2 md:hidden max-w-[60%] pointer-events-none">
            <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate text-center">
              {pageTitle}
            </span>
          </div>

          {/* Icons & Profile */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Notification Dropdown */}
            <NotificationDropDown
              isOpen={activeDropdown === 'notifications'}
              onToggle={() => handleDropdownToggle('notifications')}
              onClose={closeAllDropdowns}
            />

            {/* User Dropdown */}
            <UserDropdown
              isOpen={activeDropdown === 'user'}
              onToggle={() => handleDropdownToggle('user')}
              onClose={closeAllDropdowns}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
