/**
 * components/LockScreen.tsx
 * Full-screen workspace lock UI
 * Blocks all app access until correct password is entered
 */

import { useEffect, useState, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLock } from "../../contexts/LockContext";
import { resetAppData } from "../../services/appResetService";

export default function LockScreen() {
  const { t } = useTranslation("lock");
  const { unlock } = useLock();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetCountdown, setResetCountdown] = useState(6);
  const resetConfirmToken = "RESET";

  const openResetConfirm = () => {
    setResetConfirmText("");
    setResetCountdown(6);
    setShowResetConfirm(true);
  };

  const closeResetConfirm = () => {
    if (isResetting) return;
    setShowResetConfirm(false);
    setResetConfirmText("");
    setResetCountdown(6);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError(t("errors.passwordRequired"));
      return;
    }

    setIsUnlocking(true);

    // Small delay for UX feedback
    await new Promise((resolve) => setTimeout(resolve, 300));

    const success = unlock(password);

    if (!success) {
      setError(t("errors.passwordIncorrect"));
      setPassword("");
      setIsUnlocking(false);
    }
  };

  const handleResetApp = async () => {
    setIsResetting(true);
    await resetAppData();
    window.location.reload();
  };

  useEffect(() => {
    if (!showResetConfirm) return;

    const timer = window.setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [showResetConfirm]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center z-[9999]">
      <div className="w-full max-w-md px-8">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-2xl mb-6 shadow-2xl">
            <i className="fas fa-lock text-white text-3xl"></i>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {t("title")}
          </h1>
          <p className="text-slate-400">
            {t("subtitle")}
          </p>
        </div>

        {/* Lock Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="sr-only">
              {t("fields.password.label")}
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder={t("fields.password.placeholder")}
                autoFocus
                autoComplete="current-password"
                disabled={isUnlocking}
                className={`w-full pl-12 pr-4 py-4 bg-slate-800/50 border ${
                  error ? "border-red-500" : "border-slate-700"
                } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              />
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fas fa-key text-slate-500"></i>
              </div>
            </div>
            {error && (
              <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
                <i className="fas fa-exclamation-circle"></i>
                <span>{error}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isUnlocking}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUnlocking ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                <span>{t("actions.unlocking")}</span>
              </>
            ) : (
              <>
                <i className="fas fa-unlock"></i>
                <span>{t("actions.unlock")}</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={openResetConfirm}
            className="text-xs text-slate-400 hover:text-slate-200 transition"
          >
            {t("actions.forgotReset")}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p>{t("footer")}</p>
        </div>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={closeResetConfirm}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl text-white">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 text-red-200 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]">
                <i className="fas fa-exclamation"></i>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("reset.title")}</h3>
                <p className="text-xs text-slate-300 mt-1">
                  {t("reset.description")}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-300 mb-2">
                {t("fields.resetConfirm.label", { token: resetConfirmToken })}
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder={t("fields.resetConfirm.placeholder", { token: resetConfirmToken })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                {t("reset.countdown", { seconds: resetCountdown })}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                disabled={isResetting}
                onClick={closeResetConfirm}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 transition disabled:opacity-60"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="button"
                disabled={isResetting || resetCountdown > 0 || resetConfirmText !== resetConfirmToken}
                onClick={handleResetApp}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-60 flex items-center gap-2"
              >
                {isResetting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    {t("actions.resetting")}
                  </>
                ) : (
                  t("actions.reset")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
