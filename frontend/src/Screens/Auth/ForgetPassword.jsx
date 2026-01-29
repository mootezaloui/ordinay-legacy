import { useState } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../../contexts/theme";
import { useTranslation } from "react-i18next";

/**
 * ⚠️ COSMETIC FORGOT PASSWORD SCREEN - NO REAL PASSWORD RESET
 *
 * This is a placeholder UI for visual consistency.
 *
 * IMPORTANT:
 * - NO password reset logic
 * - NO email sending
 * - NO backend call
 * - NO password recovery
 * - Just shows success message
 *
 * Ordinay is a LOCAL DESKTOP APP with NO password management.
 * Real authentication is FORBIDDEN per AUTH_FREEZE.md
 *
 * See: /AUTH_FREEZE.md for details
 */
export default function ForgotPassword() {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 1500);
  };

  if (isSubmitted) {
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            {/* Success Icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
              <i className="fas fa-check text-green-600 dark:text-green-400 text-2xl"></i>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {t('forgotPassword.success.title')}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {t('forgotPassword.success.message')} <strong>{email}</strong>
            </p>

            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <i className="fas fa-info-circle mr-2"></i>
                {t('forgotPassword.success.info')}
              </p>
            </div>

            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <i className="fas fa-arrow-left"></i>
              {t('forgotPassword.success.backToLogin')}
            </Link>

            <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
              {t('forgotPassword.success.didntReceive')}{" "}
              <button
                onClick={() => setIsSubmitted(false)}
                className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {t('forgotPassword.success.resend')}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

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
            <i className="fas fa-key text-white text-2xl"></i>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {t('forgotPassword.title')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {t('forgotPassword.subtitle')}
          </p>
        </div>

        {/* Forgot Password Form */}
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
                {t('forgotPassword.emailLabel')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-envelope text-slate-400"></i>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  required
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t('forgotPassword.emailHelp')}
              </p>
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
                  {t('forgotPassword.sending')}
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane"></i>
                  {t('forgotPassword.sendButton')}
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <i className="fas fa-arrow-left"></i>
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
          {t('forgotPassword.footer')}
        </p>
      </div>
    </div>
  );
}
