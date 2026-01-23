import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../../contexts/theme";
import { useSidebar } from "../../contexts/SidebarContext";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const [activeFlash, setActiveFlash] = useState(false);
  const { t } = useTranslation("layout");
  const handleExit = () => {
    if (typeof window !== "undefined" && typeof window.close === "function") {
      window.close();
    } else {
      // Fallback for browser preview: return to dashboard instead of a fake logout
      window.location.href = "/dashboard";
    }
  };

  // Brief pop animation when route changes so the active item feels responsive
  useEffect(() => {
    setActiveFlash(true);
    const timer = setTimeout(() => setActiveFlash(false), 280);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Grouped navigation structure
  const navigationGroups = [
    {
      id: "primary",
      items: [
        { icon: "fas fa-th-large", label: t("sidebar.dashboard"), route: "/dashboard" },
      ]
    },
    {
      id: "core",
      label: !isCollapsed ? t("sidebar.groups.core", { defaultValue: "Core" }) : null,
      items: [
        { icon: "fas fa-users", label: t("sidebar.clients"), route: "/clients" },
        { icon: "fas fa-folder-open", label: t("sidebar.dossiers"), route: "/dossiers" },
        { icon: "fas fa-gavel", label: t("sidebar.cases"), route: "/cases" },
      ]
    },
    {
      id: "workflow",
      label: !isCollapsed ? t("sidebar.groups.workflow", { defaultValue: "Workflow" }) : null,
      items: [
        { icon: "fas fa-tasks", label: t("sidebar.tasks"), route: "/tasks" },
        { icon: "fas fa-calendar", label: t("sidebar.sessions"), route: "/sessions" },
        { icon: "fas fa-sticky-note", label: t("sidebar.personalTasks"), route: "/personal-tasks" },
      ]
    },
    {
      id: "operations",
      label: !isCollapsed ? t("sidebar.groups.operations", { defaultValue: "Operations" }) : null,
      items: [
        { icon: "fas fa-user-tie", label: t("sidebar.officers"), route: "/officers" },
        { icon: "fas fa-calculator", label: t("sidebar.accounting"), route: "/accounting" },
      ]
    },
    {
      id: "tools",
      label: !isCollapsed ? t("sidebar.groups.tools", { defaultValue: "Tools" }) : null,
      items: [
        { icon: "fas fa-robot", label: t("sidebar.chatbot"), route: "/chatbot" },
      ]
    }
  ];

  return (
    <aside
      className={`fixed left-0 flex flex-col transition-all duration-300 border-r z-40 titlebar-offset-top titlebar-offset-height ${isCollapsed ? "w-[72px]" : "w-64"
        } bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800`}
    >
      {/* Toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 rounded-full p-1.5 border shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 z-50 transition-all"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <i className={`${isCollapsed ? "fas fa-chevron-right text-xs" : "fas fa-chevron-left text-xs"} text-slate-600 dark:text-slate-400`}></i>
      </button>

      {/* Header - Logo only */}
      <div className="relative px-4 py-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
        <div className="flex items-center justify-center">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-600/10 dark:from-blue-400/10 dark:to-blue-500/10 rounded-xl blur-sm"></div>
            <svg
              className="relative w-10 h-10"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Organia"
            >
              {/* Outer ring */}
              <circle
                cx="16"
                cy="16"
                r="13"
                stroke="currentColor"
                strokeWidth="0.5"
                fill="none"
                className="text-blue-500/30 dark:text-blue-400/30"
              />
              {/* Middle ring */}
              <circle
                cx="16"
                cy="16"
                r="9"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
                className="text-blue-600/50 dark:text-blue-500/50"
              />
              {/* Inner ring */}
              <circle
                cx="16"
                cy="16"
                r="5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                className="text-blue-600 dark:text-blue-500"
              />
              {/* Orbital dots */}
              <circle cx="16" cy="3" r="1.5" fill="currentColor" className="text-blue-600 dark:text-blue-500" />
              <circle cx="29" cy="16" r="1.5" fill="currentColor" className="text-blue-600 dark:text-blue-500" />
              <circle cx="16" cy="29" r="1.5" fill="currentColor" className="text-blue-600 dark:text-blue-500" />
              <circle cx="3" cy="16" r="1.5" fill="currentColor" className="text-blue-600 dark:text-blue-500" />
              {/* Center accent */}
              <circle cx="16" cy="16" r="2" fill="currentColor" className="text-blue-600 dark:text-blue-500" />
            </svg>
          </div>
        </div>
      </div>

      {/* Navigation - Grouped with enhanced hierarchy */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <div className="space-y-6">
          {navigationGroups.map((group) => (
            <div key={group.id} className="px-3">
              {/* Section label - only show when expanded */}
              {group.label && !isCollapsed && (
                <div className="px-3 mb-2">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              )}

              {/* Collapsed section indicator */}
              {group.label && isCollapsed && group.id !== "primary" && (
                <div className="flex justify-center mb-2">
                  <div className="w-6 h-px bg-slate-300 dark:bg-slate-700"></div>
                </div>
              )}

              {/* Items */}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location.pathname.startsWith(item.route);
                  return (
                    <li key={item.route}>
                      <Link
                        to={item.route}
                        data-tutorial={
                          item.route === "/dashboard" ? "sidebar-dashboard-link" :
                            item.route === "/clients" ? "sidebar-clients-link" :
                              item.route === "/dossiers" ? "sidebar-dossiers-link" :
                                item.route === "/personal-tasks" ? "sidebar-personal-tasks-link" :
                                  item.route === "/sessions" ? "sidebar-sessions-link" :
                                    item.route === "/officers" ? "sidebar-officers-link" :
                                      item.route === "/accounting" ? "sidebar-accounting-link" :
                                        undefined
                        }
                        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isCollapsed ? "justify-center" : "justify-start"
                          } ${isActive
                            ? "bg-blue-600 dark:bg-blue-600 text-white shadow-lg shadow-blue-500/30 dark:shadow-blue-600/40"
                            : "hover:bg-white dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 hover:shadow-sm"
                          }`}
                      >
                        {/* Icon container with enhanced styling */}
                        <span className={`relative flex items-center justify-center w-5 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-105"
                          }`}>
                          <i
                            className={`${item.icon} text-base transition-all duration-200 ${isActive
                                ? "text-white"
                                : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                              }`}
                          ></i>
                        </span>

                        {/* Label */}
                        {!isCollapsed && (
                          <span
                            className={`text-[13px] font-medium transition-all duration-200 ${isActive
                                ? "text-white"
                                : "text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white"
                              } ${isActive && activeFlash ? "animate-pop" : ""}`}
                          >
                            {item.label}
                          </span>
                        )}

                        {/* Active indicator glow */}
                        {isActive && (
                          <span className="absolute inset-0 rounded-xl bg-blue-400/10 dark:bg-blue-400/10 blur-sm"></span>
                        )}

                        {/* Tooltip for collapsed state */}
                        {isCollapsed && (
                          <span className="absolute left-full ml-4 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                            {item.label}
                            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-100"></span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer - System actions with clear separation */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-gradient-to-b from-transparent to-slate-100/50 dark:to-slate-900/50">
        <div className="p-3 space-y-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-white dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 hover:shadow-sm ${isCollapsed ? "justify-center" : "justify-start"
              }`}
          >
            <span className="relative flex items-center justify-center w-5">
              <i className={`${isDark ? "fas fa-sun" : "fas fa-moon"} text-base text-slate-500 dark:text-slate-400 group-hover:text-amber-500 transition-all duration-200`}></i>
            </span>
            {!isCollapsed && (
              <span className="text-[13px] font-medium">{isDark ? t("sidebar.theme.light") : t("sidebar.theme.dark")}</span>
            )}

            {/* Tooltip for collapsed */}
            {isCollapsed && (
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                {isDark ? t("sidebar.theme.light") : t("sidebar.theme.dark")}
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-100"></span>
              </span>
            )}
          </button>

          {/* Exit button */}
          <button
            onClick={handleExit}
            className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-950/50 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 ${isCollapsed ? "justify-center" : "justify-start"
              }`}
          >
            <span className="relative flex items-center justify-center w-5">
              <i className="fas fa-sign-out-alt text-base text-red-500 dark:text-red-400 transition-all duration-200"></i>
            </span>
            {!isCollapsed && (
              <span className="text-[13px] font-medium text-red-600 dark:text-red-400">{t("sidebar.exitApp")}</span>
            )}

            {/* Tooltip for collapsed */}
            {isCollapsed && (
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                {t("sidebar.exitApp")}
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-100"></span>
              </span>
            )}
          </button>
        </div>

        {/* Version footer */}
        <div className={`px-4 py-3 ${isCollapsed ? "text-center" : ""}`}>
          <p className="text-[10px] text-slate-400 dark:text-slate-600 font-medium">
            {isCollapsed ? "©" : "© 2025"}
          </p>
        </div>
      </div>
    </aside>
  );
}
