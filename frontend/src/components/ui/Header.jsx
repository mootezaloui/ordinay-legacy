import { Link } from "react-router-dom";
import { useState } from "react";
import { useSidebar } from "../../contexts/SidebarContext";
import NotificationDropDown from "../notifications/notificationdropdown";
import UserDropdown from "../user/UserDropdown";
import GlobalSearch from "../Search/GlobalSearch";
import { useTranslation } from "react-i18next";

export default function HeaderBar() {
  const { isCollapsed } = useSidebar();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const { t } = useTranslation("layout");

  const handleDropdownToggle = (dropdownName) => {
    setActiveDropdown(activeDropdown === dropdownName ? null : dropdownName);
  };

  const closeAllDropdowns = () => {
    setActiveDropdown(null);
  };

  return (
    <header className={`bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-slate-900 dark:text-white transition-all duration-300 fixed right-0 z-30 border-b border-slate-200/50 dark:border-slate-700/50 titlebar-offset-top ${isCollapsed ? "left-20" : "left-64"}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Logo - Hidden when sidebar is expanded, visible when collapsed */}
          <div className={`flex items-center flex-shrink-0 transition-all duration-300 ${isCollapsed ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
            }`}>
            <Link
              to="/dashboard"
              className="text-lg font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
            >
              {t("header.brand")}
            </Link>
          </div>

          {/* Global Search */}
          <div className="flex-1 max-w-2xl mx-4 hidden md:block">
            <GlobalSearch />
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
