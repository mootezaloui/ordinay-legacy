import { Link } from "react-router-dom";
import { useTheme } from "../../contexts/theme";
import { useSidebar } from "../../contexts/SidebarContext";

export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { isDark, toggleTheme } = useTheme();

  const menuItems = [
    { icon: "fas fa-th-large", label: "Dashboard", route: "/dashboard" },
    { icon: "fas fa-users", label: "Clients", route: "/clients" },
    { icon: "fas fa-folder-open", label: "Dossiers", route: "/dossiers" },
    { icon: "fas fa-tasks", label: "Tâches", route: "/tasks" },
    { icon: "fas fa-gavel", label: "Procès", route: "/cases" },
    { icon: "fas fa-calendar", label: "Audience ", route: "/sessions" },
    { icon: "fas fa-sticky-note", label: "Corvées", route: "/personal-tasks" },
    { icon: "fas fa-user-tie", label: "Huissier", route: "/officers" },
    { icon: "fas fa-calculator", label: "Comptabilité", route: "/accounting" },
    { icon: "fas fa-robot", label: "ChatBot", route: "/chatbot" },
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
          {!isCollapsed && <span className="font-semibold text-lg">Organia</span>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {menuItems.map((item, index) => (
            <li key={index}>
              <Link
                to={item.route}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 ${isCollapsed ? "justify-center" : "justify-start"
                  }`}
              >
                <span className="flex-shrink-0">
                  <i className={item.icon}></i>
                </span>
                {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            </li>
          ))}
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
            {!isCollapsed && <span className="text-sm font-medium">{isDark ? "Light Mode" : "Dark Mode"}</span>}
          </button>

          <button
            onClick={() => console.log("Logout clicked")}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 ${isCollapsed ? "justify-center" : "justify-start"
              }`}
          >
            <span className="flex-shrink-0">
              <i className="fas fa-sign-out-alt text-red-500"></i>
            </span>
            {!isCollapsed && <span className="text-sm font-medium text-red-500">Logout</span>}
          </button>
        </div>

        <p className={`px-4 py-3 text-xs text-slate-400 dark:text-slate-500 ${isCollapsed ? "text-center" : ""}`}>
          © 2025 Organia
        </p>
      </div>
    </aside>
  );
}