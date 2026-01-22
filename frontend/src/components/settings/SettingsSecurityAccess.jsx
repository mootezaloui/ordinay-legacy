import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLock } from "../../contexts/LockContext";
import { useLicense } from "../../contexts/LicenseContext";
import {
  FREE_PLAN_LIMITS,
  getActivationUrl,
  getOrCreateDeviceId,
  getPendingReferralCode,
  requestReferralLink,
} from "../../services/licenseService";
import { useSettings } from "../../contexts/SettingsContext";
import { formatDateValue } from "../../utils/dateFormat";
import ContentSection from "../layout/ContentSection";

export default function SettingsSecurityAccess() {
  const { settings } = useSettings();
  const { t } = useTranslation(["settings"]);
  const { isEnabled, config, enableLock, disableLock, changePassword, updateSettings, lock } = useLock();
  const { licenseState, licenseData, licenseError, setActivationState } = useLicense();

  const [showEnableForm, setShowEnableForm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
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
  const [referralLink, setReferralLink] = useState("");
  const [referralStatus, setReferralStatus] = useState("idle");
  const [referralMessage, setReferralMessage] = useState("");
  const [referralCopied, setReferralCopied] = useState(false);

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
      setLockError(t("securityAccess.workspaceLock.errors.passwordRequired"));
      return;
    }

    if (formData.password.length < 6) {
      setLockError(t("securityAccess.workspaceLock.errors.passwordTooShort"));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setLockError(t("securityAccess.workspaceLock.errors.passwordMismatch"));
      return;
    }

    enableLock(formData.password, formData.lockOnStartup, formData.inactivityTimeout);
    setLockSuccess(t("securityAccess.workspaceLock.messages.lockEnabled"));
    setShowEnableForm(false);
    resetLockForms();
  };

  const handleDisableLock = () => {
    disableLock();
    setLockSuccess(t("securityAccess.workspaceLock.messages.lockDisabled"));
    resetLockForms();
    setShowDisableConfirm(false);
  };

  const handleChangePassword = () => {
    setLockError("");
    setLockSuccess("");

    if (!formData.currentPassword || !formData.newPassword) {
      setLockError(t("securityAccess.workspaceLock.errors.allFieldsRequired"));
      return;
    }

    if (formData.newPassword.length < 6) {
      setLockError(t("securityAccess.workspaceLock.errors.newPasswordTooShort"));
      return;
    }

    if (formData.newPassword !== formData.confirmNewPassword) {
      setLockError(t("securityAccess.workspaceLock.errors.newPasswordMismatch"));
      return;
    }

    const success = changePassword(formData.currentPassword, formData.newPassword);
    if (success) {
      setLockSuccess(t("securityAccess.workspaceLock.messages.passwordChanged"));
      setShowChangePassword(false);
      resetLockForms();
    } else {
      setLockError(t("securityAccess.workspaceLock.errors.currentPasswordIncorrect"));
    }
  };

  const handleLockSettingsUpdate = (field, value) => {
    updateSettings({ [field]: value });
    setLockSuccess(t("securityAccess.workspaceLock.messages.settingsUpdated"));
    setTimeout(() => setLockSuccess(""), 2000);
  };

  const formatLicenseDate = (value) => {
    if (!value) return "-";
    return formatDateValue(value, settings.dateFormat);
  };

  const licenseTypeLabel = () => {
    if (!licenseData?.license_type) return t("securityAccess.license.labels.unknown");
    return licenseData.license_type.charAt(0).toUpperCase() + licenseData.license_type.slice(1);
  };

  const licenseNextBilling = () => {
    if (!licenseData) return "-";
    if (licenseData.license_type === "perpetual") return t("securityAccess.license.labels.notApplicable");
    return formatLicenseDate(licenseData.expires_at);
  };

  const handleActivateLicense = async () => {
    setActivationError("");
    setActivationBusy(true);
    setActivationState("ACTIVATING", null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const pendingReferral = getPendingReferralCode();
      const url = getActivationUrl(deviceId, pendingReferral);
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
      setActivationError(t("securityAccess.license.errors.activationFailed"));
      setActivationState("ERROR", t("securityAccess.license.errors.activationFailed"));
    } finally {
      setActivationBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadReferralLink = async () => {
      if (licenseState !== "ACTIVE") {
        setReferralLink("");
        setReferralStatus("idle");
        setReferralMessage("");
        return;
      }
      setReferralStatus("loading");
      setReferralMessage("");
      try {
        const deviceId = await getOrCreateDeviceId();
        const result = await requestReferralLink(deviceId);
        if (!active) return;
        if (result.link) {
          setReferralLink(result.link);
          setReferralStatus("ready");
        } else {
          setReferralLink("");
          setReferralStatus("error");
          setReferralMessage(result.error || t("securityAccess.license.referral.unavailable"));
        }
      } catch (error) {
        if (!active) return;
        setReferralLink("");
        setReferralStatus("error");
        setReferralMessage(t("securityAccess.license.referral.unavailable"));
      }
    };
    loadReferralLink();
    return () => {
      active = false;
    };
  }, [licenseState]);

  const handleCopyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 1500);
    } catch (error) {
      setReferralMessage(t("securityAccess.license.referral.copyFailed"));
    }
  };

  const handleRefreshReferral = async () => {
    setReferralStatus("loading");
    setReferralMessage("");
    const deviceId = await getOrCreateDeviceId();
    const result = await requestReferralLink(deviceId);
    if (result.link) {
      setReferralLink(result.link);
      setReferralStatus("ready");
    } else {
      setReferralLink("");
      setReferralStatus("error");
      setReferralMessage(result.error || t("securityAccess.license.referral.unavailable"));
    }
  };


  const licenseStatusLabel = () => {
    const labels = {
      FREE: t("securityAccess.license.status.free"),
      UNACTIVATED: t("securityAccess.license.status.unactivated"),
      ACTIVATING: t("securityAccess.license.status.activating"),
      ACTIVE: t("securityAccess.license.status.active"),
      EXPIRED: t("securityAccess.license.status.expired"),
      ERROR: t("securityAccess.license.status.error"),
    };
    return labels[licenseState] || t("securityAccess.license.status.inactive");
  };

  const isPaidPlan = licenseState === "ACTIVE";
  const planLabel = isPaidPlan
    ? t("securityAccess.license.plan.paid")
    : t("securityAccess.license.plan.free");

  return (
    <div className="space-y-6">
      <ContentSection title={t("securityAccess.workspaceLock.title")}>
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_60%)]" />
          <div className="relative space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${isEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300" : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}
                >
                  <i className={`fas ${isEnabled ? "fa-shield-alt" : "fa-shield"}`}></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("securityAccess.workspaceLock.header.title")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                    {isEnabled
                      ? t("securityAccess.workspaceLock.header.enabledDescription")
                      : t("securityAccess.workspaceLock.header.disabledDescription")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEnabled ? (
                  <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full flex items-center gap-1">
                    <i className="fas fa-lock"></i>
                    {t("securityAccess.workspaceLock.status.enabled")}
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full flex items-center gap-1">
                    <i className="fas fa-unlock"></i>
                    {t("securityAccess.workspaceLock.status.disabled")}
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
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-sm">
                <i className="fas fa-check-circle"></i>
                <span>{lockSuccess}</span>
              </div>
            )}

            {!isEnabled ? (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1.1fr)]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 p-4">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("securityAccess.workspaceLock.why.title")}
                    </h4>
                    <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                      <li className="flex items-start gap-2">
                        <i className="fas fa-check text-emerald-600 mt-0.5"></i>
                        <span>{t("securityAccess.workspaceLock.why.items.protectsData")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <i className="fas fa-check text-emerald-600 mt-0.5"></i>
                        <span>{t("securityAccess.workspaceLock.why.items.autoLock")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <i className="fas fa-check text-emerald-600 mt-0.5"></i>
                        <span>{t("securityAccess.workspaceLock.why.items.localOnly")}</span>
                      </li>
                    </ul>
                  </div>
                  {!showEnableForm && (
                    <button
                      onClick={() => setShowEnableForm(true)}
                      className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-lock"></i>
                      {t("securityAccess.workspaceLock.actions.setup")}
                    </button>
                  )}
                </div>

                {!showEnableForm ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/40 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("securityAccess.workspaceLock.preview.title")}
                    </h4>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {t("securityAccess.workspaceLock.preview.description")}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-3">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {t("securityAccess.workspaceLock.preview.cards.lockOnStartup.title")}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {t("securityAccess.workspaceLock.preview.cards.lockOnStartup.description")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-3">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {t("securityAccess.workspaceLock.preview.cards.inactivity.title")}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {t("securityAccess.workspaceLock.preview.cards.inactivity.description")}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 p-5 bg-white/70 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("securityAccess.workspaceLock.form.title")}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {t("securityAccess.workspaceLock.form.subtitle")}
                      </p>
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200">
                      <div className="flex items-start gap-2">
                        <i className="fas fa-triangle-exclamation mt-0.5"></i>
                        <span>
                          {t("securityAccess.workspaceLock.form.warning")}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t("securityAccess.workspaceLock.form.fields.password.label")}
                        </label>
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder={t("securityAccess.workspaceLock.form.fields.password.placeholder")}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t("securityAccess.workspaceLock.form.fields.confirmPassword.label")}
                        </label>
                        <input
                          type="password"
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                          placeholder={t("securityAccess.workspaceLock.form.fields.confirmPassword.placeholder")}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {t("securityAccess.workspaceLock.form.fields.lockOnStartup.label")}
                          </label>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("securityAccess.workspaceLock.form.fields.lockOnStartup.description")}
                          </p>
                        </div>
                        <button
                          onClick={() => setFormData({ ...formData, lockOnStartup: !formData.lockOnStartup })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.lockOnStartup ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.lockOnStartup ? "translate-x-6" : "translate-x-1"}`}
                          />
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t("securityAccess.workspaceLock.form.fields.inactivityTimeout.label")}
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="120"
                          value={formData.inactivityTimeout}
                          onChange={(e) => setFormData({ ...formData, inactivityTimeout: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {t("securityAccess.workspaceLock.form.fields.inactivityTimeout.hint")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        onClick={handleEnableLock}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {t("securityAccess.workspaceLock.actions.enable")}
                      </button>
                      <button
                        onClick={() => {
                          setShowEnableForm(false);
                          resetLockForms();
                        }}
                        className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
                      >
                        {t("securityAccess.workspaceLock.actions.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
                <div className="space-y-4 p-5 bg-white/70 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("securityAccess.workspaceLock.settings.title")}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {t("securityAccess.workspaceLock.settings.subtitle")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t("securityAccess.workspaceLock.settings.lockOnStartup.label")}
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("securityAccess.workspaceLock.settings.lockOnStartup.description")}
                      </p>
                    </div>
                    <button
                      onClick={() => handleLockSettingsUpdate("lockOnStartup", !config?.lockOnStartup)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config?.lockOnStartup ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config?.lockOnStartup ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t("securityAccess.workspaceLock.settings.inactivityTimeout.label")}
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
                        ? t("securityAccess.workspaceLock.settings.inactivityTimeout.disabled")
                        : t("securityAccess.workspaceLock.settings.inactivityTimeout.enabled", {
                          minutes: config?.inactivityTimeout ?? 0,
                        })}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {!showChangePassword ? (
                    <button
                      onClick={() => setShowChangePassword(true)}
                      className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-key"></i>
                      {t("securityAccess.workspaceLock.actions.changePassword")}
                    </button>
                  ) : (
                    <div className="space-y-3 p-5 bg-white/70 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("securityAccess.workspaceLock.changePassword.title")}
                      </h4>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t("securityAccess.workspaceLock.changePassword.fields.currentPassword")}
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
                          {t("securityAccess.workspaceLock.changePassword.fields.newPassword")}
                        </label>
                        <input
                          type="password"
                          value={formData.newPassword}
                          onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                          placeholder={t("securityAccess.workspaceLock.changePassword.fields.newPasswordPlaceholder")}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t("securityAccess.workspaceLock.changePassword.fields.confirmNewPassword")}
                        </label>
                        <input
                          type="password"
                          value={formData.confirmNewPassword}
                          onChange={(e) => setFormData({ ...formData, confirmNewPassword: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button
                          onClick={handleChangePassword}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          {t("securityAccess.workspaceLock.actions.updatePassword")}
                        </button>
                        <button
                          onClick={() => {
                            setShowChangePassword(false);
                            resetLockForms();
                          }}
                          className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
                        >
                          {t("securityAccess.workspaceLock.actions.cancel")}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={lock}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-lock"></i>
                      {t("securityAccess.workspaceLock.actions.lockNow")}
                    </button>

                    <button
                      onClick={() => setShowDisableConfirm(true)}
                      className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-lock-open"></i>
                      {t("securityAccess.workspaceLock.actions.disable")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </ContentSection>

      <ContentSection title={t("securityAccess.license.title")}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                {t("securityAccess.license.statusLabel")}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t("securityAccess.license.statusDescription")}
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

          {licenseError && licenseState !== "FREE" && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
              <i className="fas fa-exclamation-triangle"></i>
              <span>{licenseError}</span>
            </div>
          )}

          {licenseData ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAccess.license.cards.licenseType")}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {licenseTypeLabel()}
                </p>
              </div>
              {licenseState !== "FREE" && (
                <>
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.cards.nextBilling")}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                      {licenseNextBilling()}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.cards.expirationDate")}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                      {licenseData.expires_at === null
                        ? t("securityAccess.license.labels.never")
                        : formatLicenseDate(licenseData.expires_at)}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300">
              {t("securityAccess.license.emptyState")}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAccess.license.cards.currentPlan")}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {planLabel}
              </p>
              {!isPaidPlan && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t("securityAccess.license.freePlanNote")}
                </p>
              )}
            </div>
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAccess.license.cards.planLimits")}
              </p>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div>
                  {t("securityAccess.license.planLimits.clients", {
                    count: FREE_PLAN_LIMITS.clients,
                  })}
                </div>
                <div>
                  {t("securityAccess.license.planLimits.dossiers", {
                    count: FREE_PLAN_LIMITS.dossiers,
                  })}
                </div>
                <div>
                  {t("securityAccess.license.planLimits.casesPerDossier", {
                    count: FREE_PLAN_LIMITS.casesPerDossier,
                  })}
                </div>
                <div>
                  {t("securityAccess.license.planLimits.activeTasks", {
                    count: FREE_PLAN_LIMITS.activeTasks,
                  })}
                </div>
                <div>{t("securityAccess.license.planLimits.paidUnlimited")}</div>
              </div>
            </div>
          </div>

          {licenseState !== "ACTIVE" && (
            <div className="space-y-3">
              <button
                onClick={handleActivateLicense}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
                disabled={activationBusy || licenseState === "ACTIVATING"}
              >
                <i className="fas fa-bolt"></i>
                {t("securityAccess.license.actions.activate")}
              </button>
              {activationError && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
                  <i className="fas fa-exclamation-triangle"></i>
                  <span>{activationError}</span>
                </div>
              )}
            </div>
          )}

          {licenseState === "ACTIVE" && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("securityAccess.license.referral.title")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("securityAccess.license.referral.subtitle")}
                </p>
              </div>
              {referralStatus === "loading" && (
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <i className="fas fa-spinner fa-spin"></i>
                  {t("securityAccess.license.referral.loading")}
                </div>
              )}
              {referralStatus === "error" && (
                <div className="space-y-2">
                  <div className="text-xs text-amber-600 dark:text-amber-300 flex items-center gap-2">
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>{referralMessage || t("securityAccess.license.referral.unavailable")}</span>
                  </div>
                  <button
                    onClick={handleRefreshReferral}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition"
                  >
                    {t("securityAccess.license.referral.retry")}
                  </button>
                </div>
              )}
              {referralStatus === "ready" && (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={referralLink}
                      readOnly
                      className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                    />
                    <button
                      onClick={handleCopyReferral}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition"
                    >
                      {referralCopied
                        ? t("securityAccess.license.referral.copied")
                        : t("securityAccess.license.referral.copyLink")}
                    </button>
                  </div>
                  {referralMessage && (
                    <div className="text-xs text-amber-600 dark:text-amber-300">
                      {referralMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </ContentSection>

      {showDisableConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowDisableConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <i className="fas fa-triangle-exclamation"></i>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("securityAccess.workspaceLock.disableConfirm.title")}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {t("securityAccess.workspaceLock.disableConfirm.description")}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setShowDisableConfirm(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition"
              >
                {t("securityAccess.workspaceLock.actions.cancel")}
              </button>
              <button
                onClick={handleDisableLock}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition"
              >
                {t("securityAccess.workspaceLock.actions.disable")}
              </button>
            </div>
          </div>
        </div>
      )}

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
