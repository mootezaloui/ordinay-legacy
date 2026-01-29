import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../contexts/theme";
import { useTranslation } from "react-i18next";

/**
 * ⚠️ COSMETIC LOGIN SCREEN - NO REAL AUTHENTICATION
 *
 * This is a placeholder UI for visual consistency.
 *
 * IMPORTANT:
 * - NO password validation
 * - NO backend authentication
 * - NO token generation
 * - NO session creation
 * - Just navigates to dashboard
 *
 * Ordinay is a LOCAL DESKTOP APP with implicit operator trust.
 * Real authentication is FORBIDDEN per AUTH_FREEZE.md
 *
 * See: /AUTH_FREEZE.md for details
 */
export default function Login() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation('auth');
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // ⚠️ COSMETIC ONLY - NO REAL AUTHENTICATION HAPPENS HERE
    // This just simulates a login for UX consistency
    // NO password validation, NO backend call, NO token generation
    setTimeout(() => {
      if (formData.email && formData.password) {
        // Success - navigate to dashboard (no auth check)
        navigate("/dashboard");
      } else {
        setError(t('login.errors.pleaseFillBoth'));
        setIsLoading(false);
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 py-12 transition-colors duration-200">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-all duration-200 border border-slate-200 dark:border-slate-700"
      >
        <i className={`${isDark ? "fas fa-sun" : "fas fa-moon"} text-slate-600 dark:text-slate-300`}></i>
      </button>

      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg mb-4">
            <i className="fas fa-scale-balanced text-white text-2xl"></i>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {t('login.title')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {t('login.subtitle')}
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                <i className="fas fa-exclamation-circle text-red-600 dark:text-red-400"></i>
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                {t('login.email')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-envelope text-slate-400"></i>
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder={t('login.emailPlaceholder')}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                {t('login.password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-lock text-slate-400"></i>
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder={t('login.passwordPlaceholder')}
                  required
                />
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-slate-600 dark:text-slate-400">
                  {t('login.rememberMe')}
                </span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {t('login.forgotPassword')}
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  {t('login.loggingIn')}
                </>
              ) : (
                <>
                  <i className="fas fa-sign-in-alt"></i>
                  {t('login.loginButton')}
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {t('login.orContinueWith')}
              </span>
            </div>
          </div>

          {/* Social Login Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button className="flex items-center justify-center gap-2 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <i className="fab fa-google text-red-500"></i>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.google')}</span>
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <i className="fab fa-microsoft text-blue-500"></i>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.microsoft')}</span>
            </button>
          </div>

          {/* Sign Up Link */}
          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {t('login.noAccount')}{" "}
            <Link
              to="/signup"
              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {t('login.createAccount')}
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
          {t('login.footer')}
        </p>
      </div>
    </div>
  );
}
