import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/theme";

export default function NotFound() {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation("notFound");

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 py-12 transition-colors duration-200">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-all duration-200 border border-slate-200 dark:border-slate-700"
      >
        <i className={`${isDark ? "fas fa-sun" : "fas fa-moon"} text-slate-600 dark:text-slate-300`}></i>
      </button>

      <div className="w-full max-w-2xl text-center">
        {/* 404 Illustration */}
        <div className="mb-8 relative">
          {/* Large 404 */}
          <div className="text-[180px] font-black leading-none">
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              404
            </span>
          </div>

          {/* Floating Icons */}
          <div className="absolute top-0 left-1/4 animate-bounce">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <i className="fas fa-balance-scale text-blue-600 dark:text-blue-400 text-2xl"></i>
            </div>
          </div>
          <div className="absolute top-12 right-1/4 animate-bounce" style={{ animationDelay: "0.2s" }}>
            <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <i className="fas fa-gavel text-purple-600 dark:text-purple-400 text-xl"></i>
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            {t("page.title")}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">
            {t("page.subtitle")}
          </p>
          <p className="text-slate-500 dark:text-slate-500">
            {t("page.detail")}
          </p>
        </div>

        {/* Suggestions */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
            {t("actions.title")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Home Button */}
            <Link
              to="/dashboard"
              className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <i className="fas fa-home text-blue-600 dark:text-blue-400 text-xl"></i>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{t("actions.home.title")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("actions.home.subtitle")}</p>
              </div>
            </Link>

            {/* Clients Button */}
            <Link
              to="/clients"
              className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <i className="fas fa-users text-purple-600 dark:text-purple-400 text-xl"></i>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{t("actions.clients.title")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("actions.clients.subtitle")}</p>
              </div>
            </Link>

            {/* Cases Button */}
            <Link
              to="/dossiers"
              className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <i className="fas fa-folder-open text-green-600 dark:text-green-400 text-xl"></i>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{t("actions.dossiers.title")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("actions.dossiers.subtitle")}</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Error Code */}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("code")}
        </p>

        {/* Contact Support */}
        <div className="mt-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("support.prefix")} {" "}
            <Link
              to="/support"
              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {t("support.link")}
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-slate-500 dark:text-slate-400">
          {t("footer")}
        </p>
      </div>
    </div>
  );
}
