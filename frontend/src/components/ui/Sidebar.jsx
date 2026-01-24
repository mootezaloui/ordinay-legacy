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
        { icon: "fas fa-gavel", label: t("sidebar.lawsuits"), route: "/lawsuits" },
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
        } bg-background text-foreground border-border`}
    >
      {/* Toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 rounded-full p-1.5 border shadow-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card border-border hover:bg-muted z-50 transition-all"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <i className={`${isCollapsed ? "fas fa-chevron-right text-xs" : "fas fa-chevron-left text-xs"} text-muted-foreground`}></i>
      </button>

      {/* Navigation - Grouped with enhanced hierarchy */}
      <nav className="flex-1 pt-6 pb-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <div className="space-y-6">
          {navigationGroups.map((group) => (
            <div key={group.id} className="px-3">
              {/* Section label - only show when expanded */}
              {group.label && !isCollapsed && (
                <div className="px-3 mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              )}

              {/* Collapsed section indicator */}
              {group.label && isCollapsed && group.id !== "primary" && (
                <div className="flex justify-center mb-2">
                  <div className="w-6 h-px bg-border"></div>
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
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                            : "hover:bg-muted text-foreground hover:shadow-sm"
                          }`}
                      >
                        {/* Icon container with enhanced styling */}
                        <span className={`relative flex items-center justify-center w-5 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-105"
                          }`}>
                          <i
                            className={`${item.icon} text-base transition-all duration-200 ${isActive
                                ? "text-primary-foreground"
                                : "text-muted-foreground group-hover:text-foreground"
                              }`}
                          ></i>
                        </span>

                        {/* Label */}
                        {!isCollapsed && (
                          <span
                            className={`text-[13px] font-medium transition-all duration-200 ${isActive
                                ? "text-primary-foreground"
                                : "text-foreground"
                              } ${isActive && activeFlash ? "animate-pop" : ""}`}
                          >
                            {item.label}
                          </span>
                        )}

                        {/* Active indicator glow */}
                        {isActive && (
                          <span className="absolute inset-0 rounded-xl bg-primary/10 blur-sm"></span>
                        )}

                        {/* Tooltip for collapsed state */}
                        {isCollapsed && (
                          <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                            {item.label}
                            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground"></span>
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
      <div className="border-t border-border bg-gradient-to-b from-transparent to-secondary/60">
        <div className="p-3 space-y-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-muted text-foreground hover:shadow-sm ${isCollapsed ? "justify-center" : "justify-start"
              }`}
          >
            <span className="relative flex items-center justify-center w-5">
              <i className={`${isDark ? "fas fa-sun" : "fas fa-moon"} text-base text-muted-foreground group-hover:text-amber-500 transition-all duration-200`}></i>
            </span>
            {!isCollapsed && (
              <span className="text-[13px] font-medium">{isDark ? t("sidebar.theme.light") : t("sidebar.theme.dark")}</span>
            )}

            {/* Tooltip for collapsed */}
            {isCollapsed && (
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                {isDark ? t("sidebar.theme.light") : t("sidebar.theme.dark")}
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground"></span>
              </span>
            )}
          </button>

          {/* Exit button */}
          <button
            onClick={handleExit}
            className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-950/50 text-foreground hover:text-red-600 dark:hover:text-red-400 ${isCollapsed ? "justify-center" : "justify-start"
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
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                {t("sidebar.exitApp")}
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground"></span>
              </span>
            )}
          </button>
        </div>

        {/* Version footer */}
        <div className={`px-4 py-3 ${isCollapsed ? "text-center" : ""}`}>
          <p className="text-[10px] text-muted-foreground font-medium">
            {isCollapsed ? "©" : "© 2025"}
          </p>
        </div>
      </div>
    </aside>
  );
}


