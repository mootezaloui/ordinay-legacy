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

  // Brief pop animation when route changes so the active item feels responsive
  useEffect(() => {
    setActiveFlash(true);
    const timer = setTimeout(() => setActiveFlash(false), 280);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const menuItems = [
    { icon: "fas fa-th-large", label: t("sidebar.dashboard"), route: "/dashboard" },
    { icon: "fas fa-users", label: t("sidebar.clients"), route: "/clients" },
    { icon: "fas fa-folder-open", label: t("sidebar.dossiers"), route: "/dossiers" },
    { icon: "fas fa-tasks", label: t("sidebar.tasks"), route: "/tasks" },
    { icon: "fas fa-gavel", label: t("sidebar.cases"), route: "/cases" },
    { icon: "fas fa-calendar", label: t("sidebar.sessions"), route: "/sessions" },
    { icon: "fas fa-sticky-note", label: t("sidebar.personalTasks"), route: "/personal-tasks" },
    { icon: "fas fa-user-tie", label: t("sidebar.officers"), route: "/officers" },
    { icon: "fas fa-calculator", label: t("sidebar.accounting"), route: "/accounting" },
    { icon: "fas fa-robot", label: t("sidebar.chatbot"), route: "/chatbot" },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-screen flex flex-col justify-between transition-all duration-300 border-r z-40 ${isCollapsed ? "w-20" : "w-64"
        } bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800`}
    >
      {/* Toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 rounded-full p-1.5 border focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 z-50"
      >
        <i className={`${isCollapsed ? "fas fa-chevron-right text-sm" : "fas fa-chevron-left text-sm"}`}></i>
      </button>

      {/* Logo */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-700">
            <i className="fas fa-scale-balanced"></i>
          </div>
          {!isCollapsed && <span className="font-semibold text-lg">{t("sidebar.brand")}</span>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {menuItems.map((item, index) => {
            const isActive = location.pathname.startsWith(item.route);
            return (
              <li key={index}>
                {/* Use startsWith to handle nested routes (e.g., /clients/123) so the indicator stays active. */}
                <Link
                  to={item.route}
                  className={`group relative flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 overflow-hidden ${isCollapsed ? "justify-center" : "justify-start"
                    } ${isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                >
                  <span
                    className={`absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-blue-500 transition-all duration-300 ease-out ${isActive
                      ? "scale-y-100 opacity-100"
                      : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-80"
                      }`}
                  ></span>
                  <span className="flex-shrink-0">
                    <i
                      className={`${item.icon} transition-colors duration-200 ${isActive
                        ? "text-blue-600 dark:text-blue-300"
                        : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200"
                        }`}
                    ></i>
                  </span>
                  {!isCollapsed && (
                    <span
                      className={`text-sm font-medium transition-colors duration-200 ${isActive
                        ? "text-blue-700 dark:text-blue-100"
                        : "text-slate-700 group-hover:text-slate-900 dark:text-slate-200 dark:group-hover:text-white"
                        } ${isActive && activeFlash ? "animate-pop" : ""}`}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="p-4 space-y-3">
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 ${isCollapsed ? "justify-center" : "justify-start"
              }`}
          >
            <span className="flex-shrink-0">
              <i className={isDark ? "fas fa-sun" : "fas fa-moon"}></i>
            </span>
            {!isCollapsed && <span className="text-sm font-medium">{isDark ? t("sidebar.theme.light") : t("sidebar.theme.dark")}</span>}
          </button>

          <button
            onClick={() => console.log("Logout clicked")}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 ${isCollapsed ? "justify-center" : "justify-start"
              }`}
          >
            <span className="flex-shrink-0">
              <i className="fas fa-sign-out-alt text-red-500"></i>
            </span>
            {!isCollapsed && <span className="text-sm font-medium text-red-500">{t("sidebar.logout")}</span>}
          </button>
        </div>

        <p className={`px-4 py-3 text-xs text-slate-400 dark:text-slate-500 ${isCollapsed ? "text-center" : ""}`}>
          {t("sidebar.footer")}
        </p>
      </div>
    </aside>
  );
}
