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
    <header className={`bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm text-slate-800 dark:text-slate-100 transition-all duration-300 fixed right-0 z-30 titlebar-offset-top ${isCollapsed ? "left-20" : "left-64"}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Global Search */}
          <div className="flex-1 max-w-2xl hidden md:block">
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
