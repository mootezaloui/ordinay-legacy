import { useTranslation } from "react-i18next";
import ContentSection from "../layout/ContentSection";
import { useUpdateStatus } from "../../hooks/useUpdateStatus";

export default function SettingsUpdates() {
  const { t } = useTranslation(["settings"]);
  const updateStatus = useUpdateStatus();

  const isChecking = updateStatus.status === "checking";
  const isDownloading = updateStatus.status === "downloading";
  const isDownloaded = updateStatus.status === "downloaded";
  const hasFailure = [
    "download-failed",
    "update-check-failed",
    "verification-failed",
    "install-blocked",
  ].includes(updateStatus.status);
  const isAvailable =
    updateStatus.status === "update-available" ||
    updateStatus.status === "download-failed" ||
    updateStatus.status === "verification-failed" ||
    updateStatus.status === "install-blocked" ||
    isDownloaded;

  const statusLabel = isChecking
    ? t("updates.checking")
    : isDownloading
      ? t("updates.downloading")
      : hasFailure
        ? t("updates.updateFailed")
        : isAvailable
          ? t("updates.available")
          : t("updates.upToDate");

  const handleCheck = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    try {
      await window.electronAPI.checkForUpdates();
    } catch {
      // Silent by design
    }
  };

  const handleDownload = async () => {
    if (!window.electronAPI?.downloadUpdate) return;
    try {
      await window.electronAPI.downloadUpdate();
    } catch {
      // Silent by design (error handled via update status)
    }
  };

  const handleInstall = async () => {
    if (!window.electronAPI?.installUpdate) return;
    await window.electronAPI.installUpdate();
  };

  return (
    <div className="space-y-6">
      <ContentSection title={t("updates.sectionTitle")}>
        <div className="p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("updates.currentVersion")}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {updateStatus.version || t("updates.versionUnavailable")}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("updates.statusLabel")}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {statusLabel}
              </div>
              {isAvailable && updateStatus.availableVersion && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("updates.availableVersion", {
                    version: updateStatus.availableVersion,
                  })}
                </div>
              )}
              {isDownloading && updateStatus.progress !== null && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("updates.downloadProgress", {
                    percent: updateStatus.progress,
                  })}
                </div>
              )}
              {hasFailure && updateStatus.lastError && (
                <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {updateStatus.lastError}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCheck}
              disabled={isChecking || isDownloading}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                isChecking || isDownloading
                  ? "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                  : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-400"
              }`}
            >
              {t("updates.actions.check")}
            </button>

            {isAvailable && !isDownloaded && (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                  isDownloading
                    ? "border-blue-200 text-blue-300 cursor-not-allowed"
                    : "border-blue-500 text-blue-700 dark:text-blue-200 hover:border-blue-600"
                }`}
              >
                {t("updates.actions.download")}
              </button>
            )}

            {isDownloaded && (
              <button
                onClick={handleInstall}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition"
              >
                {t("updates.actions.install")}
              </button>
            )}
          </div>
        </div>
      </ContentSection>
    </div>
  );
}
