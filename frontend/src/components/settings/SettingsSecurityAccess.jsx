import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLock } from "../../contexts/LockContext";
import { useLicense } from "../../contexts/LicenseContext";
import { getActivationUrl, getOrCreateDeviceId, requestActivationFromServer } from "../../services/licenseService";
import { useSettings } from "../../contexts/SettingsContext";
import { formatDateValue } from "../../utils/dateFormat";
import ContentSection from "../layout/ContentSection";

export default function SettingsSecurityAccess() {
  const { settings } = useSettings();
  const { t } = useTranslation(["settings"]);
  const { isEnabled, config, enableLock, disableLock, changePassword, updateSettings, lock } = useLock();
  const { licenseState, licenseData, licenseError, setActivationState, activateLicense } = useLicense();

  const [showEnableForm, setShowEnableForm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
    lockOnStartup: true,
    inactivityTimeout: 15,
  });
  const [lockError, setLockError] = useState("");
  const [lockSuccess, setLockSuccess] = useState("");
  const [activationError, setActivationError] = useState("");
  const [activationBusy, setActivationBusy] = useState(false);

  const resetLockForms = () => {
    setFormData({
      password: "",
      confirmPassword: "",
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
      lockOnStartup: config?.lockOnStartup ?? true,
      inactivityTimeout: config?.inactivityTimeout ?? 15,
    });
    setLockError("");
    setLockSuccess("");
  };

  const handleEnableLock = () => {
    setLockError("");
    setLockSuccess("");

    if (!formData.password) {
      setLockError("Password is required");
      return;
    }

    if (formData.password.length < 6) {
      setLockError("Password must be at least 6 characters");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setLockError("Passwords do not match");
      return;
    }

    enableLock(formData.password, formData.lockOnStartup, formData.inactivityTimeout);
    setLockSuccess("Workspace lock enabled successfully");
    setShowEnableForm(false);
    resetLockForms();
  };

  const handleDisableLock = () => {
    if (confirm("Are you sure you want to disable workspace lock? Your workspace will no longer be protected.")) {
      disableLock();
      setLockSuccess("Workspace lock disabled");
      resetLockForms();
    }
  };

  const handleChangePassword = () => {
    setLockError("");
    setLockSuccess("");

    if (!formData.currentPassword || !formData.newPassword) {
      setLockError("All password fields are required");
      return;
    }

    if (formData.newPassword.length < 6) {
      setLockError("New password must be at least 6 characters");
      return;
    }

    if (formData.newPassword !== formData.confirmNewPassword) {
      setLockError("New passwords do not match");
      return;
    }

    const success = changePassword(formData.currentPassword, formData.newPassword);
    if (success) {
      setLockSuccess("Password changed successfully");
      setShowChangePassword(false);
      resetLockForms();
    } else {
      setLockError("Current password is incorrect");
    }
  };

  const handleLockSettingsUpdate = (field, value) => {
    updateSettings({ [field]: value });
    setLockSuccess("Settings updated");
    setTimeout(() => setLockSuccess(""), 2000);
  };

  const formatLicenseDate = (value) => {
    if (!value) return "-";
    return formatDateValue(value, settings.dateFormat);
  };

  const licenseTypeLabel = () => {
    if (!licenseData?.license_type) return "Unknown";
    return licenseData.license_type.charAt(0).toUpperCase() + licenseData.license_type.slice(1);
  };

  const licenseNextBilling = () => {
    if (!licenseData) return "-";
    if (licenseData.license_type === "perpetual") return "N/A";
    return formatLicenseDate(licenseData.expires_at);
  };

  const handleActivateLicense = async () => {
    setActivationError("");
    setActivationBusy(true);
    setActivationState("ACTIVATING", null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const url = getActivationUrl(deviceId);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("organia_readonly_mode");
      }
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(url);
      } else {
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("[License] Activation launch failed:", error);
      setActivationError("Activation failed. Please try again.");
      setActivationState("ERROR", "Activation failed");
    } finally {
      setActivationBusy(false);
    }
  };

  const handleSimulateActivation = async () => {
    setActivationError("");
    setActivationBusy(true);
    setActivationState("ACTIVATING", null);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("organia_readonly_mode");
      }
      const deviceId = await getOrCreateDeviceId();
      const licenseData = await requestActivationFromServer(deviceId);
      await activateLicense(licenseData);
    } catch (error) {
      console.error("[License] Activation failed:", error);
      setActivationError("Activation failed. Please try again.");
      setActivationState("ERROR", "Activation failed");
    } finally {
      setActivationBusy(false);
    }
  };

  const licenseStatusLabel = () => {
    const labels = {
      UNACTIVATED: "Unactivated",
      ACTIVATING: "Activating",
      ACTIVE: "Active",
      EXPIRED: "Expired",
      ERROR: "Error",
    };
    return labels[licenseState] || "Inactive";
  };

  return (
    <div className="space-y-6">
      <ContentSection title="Workspace Lock">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                Lock Status
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isEnabled
                  ? "Your workspace is protected with a password"
                  : "Your workspace is not protected"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isEnabled ? (
                <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full flex items-center gap-1">
                  <i className="fas fa-lock"></i>
                  Enabled
                </span>
              ) : (
                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium rounded-full flex items-center gap-1">
                  <i className="fas fa-unlock"></i>
                  Disabled
                </span>
              )}
            </div>
          </div>

          {lockError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
              <i className="fas fa-exclamation-circle"></i>
              <span>{lockError}</span>
            </div>
          )}
          {lockSuccess && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
              <i className="fas fa-check-circle"></i>
              <span>{lockSuccess}</span>
            </div>
          )}

          {!isEnabled ? (
            <div className="space-y-4">
              {!showEnableForm ? (
                <button
                  onClick={() => setShowEnableForm(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <i className="fas fa-lock"></i>
                  Enable Workspace Lock
                </button>
              ) : (
                <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Set Up Workspace Lock
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Enter password (min. 6 characters)"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        placeholder="Re-enter password"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Lock on startup
                      </label>
                      <button
                        onClick={() => setFormData({ ...formData, lockOnStartup: !formData.lockOnStartup })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData.lockOnStartup ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${formData.lockOnStartup ? "translate-x-5" : "translate-x-1"}`}
                        />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Lock after inactivity (minutes, 0 to disable)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="120"
                        value={formData.inactivityTimeout}
                        onChange={(e) => setFormData({ ...formData, inactivityTimeout: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleEnableLock}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Enable Lock
                    </button>
                    <button
                      onClick={() => {
                        setShowEnableForm(false);
                        resetLockForms();
                      }}
                      className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Lock Settings
                </h4>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Lock on startup
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Require password when app starts
                    </p>
                  </div>
                  <button
                    onClick={() => handleLockSettingsUpdate("lockOnStartup", !config?.lockOnStartup)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config?.lockOnStartup ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config?.lockOnStartup ? "translate-x-5" : "translate-x-1"}`}
                    />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Inactivity timeout (minutes, 0 to disable)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={config?.inactivityTimeout ?? 15}
                    onChange={(e) => handleLockSettingsUpdate("inactivityTimeout", parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {config?.inactivityTimeout === 0
                      ? "Automatic lock disabled"
                      : `Lock after ${config?.inactivityTimeout} minutes of inactivity`}
                  </p>
                </div>
              </div>

              {!showChangePassword ? (
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <i className="fas fa-key"></i>
                  Change Password
                </button>
              ) : (
                <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Change Password
                  </h4>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={formData.currentPassword}
                      onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={formData.newPassword}
                      onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                      placeholder="Min. 6 characters"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={formData.confirmNewPassword}
                      onChange={(e) => setFormData({ ...formData, confirmNewPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleChangePassword}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Update Password
                    </button>
                    <button
                      onClick={() => {
                        setShowChangePassword(false);
                        resetLockForms();
                      }}
                      className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={lock}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <i className="fas fa-lock"></i>
                Lock Now
              </button>

              <button
                onClick={handleDisableLock}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <i className="fas fa-lock-open"></i>
                Disable Workspace Lock
              </button>
            </div>
          )}
        </div>
      </ContentSection>

      <ContentSection title="License">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                Status
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Local license on this device
              </p>
            </div>
            <span className={`px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1 ${licenseState === "ACTIVE"
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
              }`}>
              <i className={`fas ${licenseState === "ACTIVE" ? "fa-check-circle" : "fa-lock"}`}></i>
              {licenseStatusLabel()}
            </span>
          </div>

          {licenseError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
              <i className="fas fa-exclamation-triangle"></i>
              <span>{licenseError}</span>
            </div>
          )}

          {licenseData ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  License Type
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {licenseTypeLabel()}
                </p>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Next Billing
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {licenseNextBilling()}
                </p>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Expiration Date
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {licenseData.expires_at === null ? "Never" : formatLicenseDate(licenseData.expires_at)}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300">
              No license file found.
            </div>
          )}
          {licenseState !== "ACTIVE" && (
            <div className="space-y-3">
              <button
                onClick={handleActivateLicense}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
                disabled={activationBusy || licenseState === "ACTIVATING"}
              >
                <i className="fas fa-bolt"></i>
                Activate Organia
              </button>
              {import.meta.env.DEV && (
                <button
                  onClick={handleSimulateActivation}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
                  disabled={activationBusy || licenseState === "ACTIVATING"}
                >
                  <i className="fas fa-flask"></i>
                  Simulate successful activation
                </button>
              )}
              {activationError && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
                  <i className="fas fa-exclamation-triangle"></i>
                  <span>{activationError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </ContentSection>

      <ContentSection title={t("sections.accountSecurity")}>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("security.current.title")}
            </h3>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <i className="fas fa-desktop text-blue-500 mt-0.5"></i>
                <span>{t("security.current.localOperator")}</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="fas fa-globe text-slate-500 mt-0.5"></i>
                <span>{t("security.current.noOnlineAuth")}</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="fas fa-user-shield text-emerald-600 mt-0.5"></i>
                <span>{t("security.current.osControlled")}</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="fas fa-database text-amber-600 mt-0.5"></i>
                <span>{t("security.current.localData")}</span>
              </li>
            </ul>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("security.comingSoon.title")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("security.comingSoon.caption")}
            </p>
            <div className="space-y-3">
              {[
                "twoFactor",
                "sessionTimeout",
                "changePassword",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-800/40 opacity-60 cursor-not-allowed"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {t(`security.comingSoon.items.${item}.label`)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t(`security.comingSoon.items.${item}.description`)}
                    </p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {t("security.comingSoon.badge")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ContentSection>
    </div>
  );
}
