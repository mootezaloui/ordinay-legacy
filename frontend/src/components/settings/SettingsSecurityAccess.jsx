import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLock } from "../../contexts/LockContext";
import { useLicense } from "../../contexts/LicenseContext";
import {
  FREE_PLAN_LIMITS,
  getActivationUrl,
  getOrCreateDeviceId,
  getPendingReferralCode,
  getPlanManagementUrl,
  requestReferralLink,
} from "../../services/licenseService";
import { useSettings } from "../../contexts/SettingsContext";
import { formatDateValue } from "../../utils/dateFormat";
import ContentSection from "../layout/ContentSection";
import { openExternalLink } from "../../lib/externalLink";

export default function SettingsSecurityAccess() {
  const { settings } = useSettings();
  const { t } = useTranslation(["settings"]);
  const { isEnabled, config, enableLock, disableLock, changePassword, updateSettings, lock } = useLock();
  const { licenseState, licenseData, licenseError, licenseLoaded, refreshLicense, setActivationState } = useLicense();

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
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showOnlineAccessModal, setShowOnlineAccessModal] = useState(false);
  const [planActionError, setPlanActionError] = useState("");
  const [planActionMessage, setPlanActionMessage] = useState("");
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const [planActionTarget, setPlanActionTarget] = useState("");
  const [planRefreshBusy, setPlanRefreshBusy] = useState(false);

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

  const planTitle = (planKey) =>
    t(`securityAccess.license.planChange.plans.${planKey}.title`, {
      defaultValue:
        planKey === "unknown"
          ? t("securityAccess.license.labels.unknown")
          : String(planKey || ""),
    });

  const planDescription = (planKey) =>
    t(`securityAccess.license.planChange.plans.${planKey}.description`, {
      defaultValue: "",
    });

  const getCurrentPlanKey = () => {
    const raw = licenseData?.license_type;
    if (raw) return String(raw).toLowerCase();
    if (licenseState === "FREE") return "free";
    return "unknown";
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
        window.localStorage.removeItem("ordinay_readonly_mode");
      }
      await openExternalLink(url, "settings_plan");
    } catch (error) {
      console.error("[License] Activation launch failed:", error);
      setActivationError(t("securityAccess.license.errors.activationFailed"));
      setActivationState("ERROR", t("securityAccess.license.errors.activationFailed"));
    } finally {
      setActivationBusy(false);
    }
  };

  const handleOpenPlanFlow = async (targetPlan, action) => {
    setPlanActionError("");
    setPlanActionMessage("");
    setPlanActionBusy(true);
    setPlanActionTarget(targetPlan);
    try {
      const deviceId = await getOrCreateDeviceId();
      const currentPlan = getCurrentPlanKey();
      const url = getPlanManagementUrl({
        deviceId,
        currentPlan: currentPlan !== "unknown" ? currentPlan : null,
        targetPlan,
        licenseState,
        action,
      });
      await openExternalLink(url, "settings_plan");
      setPlanActionMessage(t("securityAccess.license.planChange.messages.opened"));
    } catch (error) {
      console.error("[License] Plan flow launch failed:", error);
      setPlanActionError(t("securityAccess.license.planChange.messages.openFailed"));
    } finally {
      setPlanActionBusy(false);
      setPlanActionTarget("");
    }
  };

  const handleRefreshLicense = async () => {
    setPlanActionError("");
    setPlanActionMessage("");
    setPlanRefreshBusy(true);
    try {
      await refreshLicense();
      setPlanActionMessage(t("securityAccess.license.planChange.messages.refreshSuccess"));
    } catch (error) {
      console.error("[License] Refresh failed:", error);
      setPlanActionError(t("securityAccess.license.planChange.messages.refreshFailed"));
    } finally {
      setPlanRefreshBusy(false);
    }
  };

  const openPlanModal = () => {
    setPlanActionError("");
    setPlanActionMessage("");
    setShowPlanModal(true);
  };

  const closePlanModal = () => {
    setShowPlanModal(false);
  };

  const openOnlineAccessModal = () => {
    setShowOnlineAccessModal(true);
  };

  const closeOnlineAccessModal = () => {
    setShowOnlineAccessModal(false);
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
    // LOADING: license not yet resolved - show loading indicator, not "inactive"
    if (licenseState === "LOADING") {
      return t("securityAccess.license.status.loading", { defaultValue: "Loading..." });
    }
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
  const currentPlanKey = getCurrentPlanKey();
  const isPerpetual = currentPlanKey === "perpetual";
  const includeTrialPlan = currentPlanKey === "trial";
  const planOptions = [
    { key: "free", icon: "fa-layer-group" },
    ...(includeTrialPlan ? [{ key: "trial", icon: "fa-hourglass-half" }] : []),
    { key: "monthly", icon: "fa-calendar-alt" },
    { key: "yearly", icon: "fa-calendar-check" },
    { key: "perpetual", icon: "fa-infinity" },
  ];
  const planActionsLocked = licenseState === "ACTIVATING";
  const canShowPlanActions = licenseLoaded;

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
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6">
          {/* Background gradient */}
          <div className={`pointer-events-none absolute inset-0 ${isPaidPlan
            ? "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.12),_transparent_60%)]"
            : "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.12),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.12),_transparent_60%)]"
          }`} />

          <div className="relative space-y-6">
            {/* Header with status */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${isPaidPlan
                  ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 text-emerald-600 dark:border-emerald-800/50 dark:from-emerald-900/30 dark:to-green-900/20 dark:text-emerald-400"
                  : "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 dark:border-amber-800/50 dark:from-amber-900/30 dark:to-orange-900/20 dark:text-amber-400"
                }`}>
                  <i className={`fas ${isPaidPlan ? "fa-crown" : "fa-certificate"} text-lg`}></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("securityAccess.license.statusLabel")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                    {t("securityAccess.license.statusDescription")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 text-xs font-semibold rounded-full flex items-center gap-1.5 ${isPaidPlan
                  ? "bg-gradient-to-r from-emerald-100 to-green-100 dark:from-emerald-900/40 dark:to-green-900/30 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800/50"
                  : "bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800/50"
                }`}>
                  <i className={`fas ${isPaidPlan ? "fa-check-circle" : "fa-hourglass-half"}`}></i>
                  {licenseStatusLabel()}
                </span>
              </div>
            </div>

            {/* Error message */}
            {licenseError && licenseState !== "FREE" && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
                <i className="fas fa-exclamation-triangle"></i>
                <span>{licenseError}</span>
              </div>
            )}

            {/* License details cards */}
            {licenseData && licenseState !== "FREE" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900/40 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <i className="fas fa-id-card text-blue-600 dark:text-blue-400 text-sm"></i>
                    </div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.cards.licenseType")}
                    </p>
                  </div>
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {licenseTypeLabel()}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900/40 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <i className="fas fa-calendar-alt text-purple-600 dark:text-purple-400 text-sm"></i>
                    </div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.cards.nextBilling")}
                    </p>
                  </div>
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {licenseNextBilling()}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900/40 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                      <i className="fas fa-clock text-rose-600 dark:text-rose-400 text-sm"></i>
                    </div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.cards.expirationDate")}
                    </p>
                  </div>
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {licenseData.expires_at === null
                      ? t("securityAccess.license.labels.never")
                      : formatLicenseDate(licenseData.expires_at)}
                  </p>
                </div>
              </div>
            )}

            {/* Current Plan Card */}
            <div className={`p-5 rounded-xl border ${isPaidPlan
              ? "border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/80 to-green-50/80 dark:from-emerald-900/20 dark:to-green-900/10"
              : "border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-900/20 dark:to-orange-900/10"
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPaidPlan
                    ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/25"
                    : "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25"
                  }`}>
                    <i className={`fas ${isPaidPlan ? "fa-infinity" : "fa-layer-group"}`}></i>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.cards.currentPlan")}
                    </p>
                    <p className={`text-lg font-bold ${isPaidPlan ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                      {planLabel}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {!isPaidPlan && (
                    <button
                      onClick={handleActivateLicense}
                      disabled={activationBusy || licenseState === "ACTIVATING"}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2 disabled:opacity-60"
                    >
                      <i className="fas fa-bolt"></i>
                      {t("securityAccess.license.actions.activate")}
                    </button>
                  )}
                  {canShowPlanActions && (
                    <button
                      onClick={openPlanModal}
                      disabled={planActionsLocked || isPerpetual}
                      className={`px-4 py-2 text-sm font-semibold rounded-xl transition flex items-center gap-2 ${(planActionsLocked || isPerpetual)
                        ? "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                        : "bg-white/80 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <i className={`fas ${isPaidPlan ? "fa-exchange-alt" : "fa-bolt"}`}></i>
                      {isPaidPlan
                        ? t("securityAccess.license.planChange.upgradeAction", { defaultValue: "Change plan" })
                        : t("securityAccess.license.planChange.action")}
                    </button>
                  )}
                  {isPerpetual && canShowPlanActions && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-right mt-1">
                      {t("securityAccess.license.perpetual.highestPlan", { defaultValue: "You own the highest Ordinay license." })}
                    </p>
                  )}
                </div>
              </div>

              {planActionsLocked && canShowPlanActions && (
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-300 flex items-center gap-2">
                  <i className="fas fa-hourglass-half"></i>
                  {t("securityAccess.license.planChange.status.activationInProgress")}
                </div>
              )}

              {activationError && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
                  <i className="fas fa-exclamation-circle"></i>
                  <span>{activationError}</span>
                </div>
              )}
            </div>

            {/* Plan Limits */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <i className="fas fa-sliders-h text-slate-500 dark:text-slate-400"></i>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("securityAccess.license.cards.planLimits")}
                  </p>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2">
                      <i className="fas fa-users text-blue-600 dark:text-blue-400"></i>
                    </div>
                    <p className={`text-lg font-bold ${isPaidPlan ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
                      {isPaidPlan ? "∞" : FREE_PLAN_LIMITS.clients}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Clients</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-2">
                      <i className="fas fa-folder text-purple-600 dark:text-purple-400"></i>
                    </div>
                    <p className={`text-lg font-bold ${isPaidPlan ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
                      {isPaidPlan ? "∞" : FREE_PLAN_LIMITS.dossiers}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Dossiers</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-2">
                      <i className="fas fa-briefcase text-amber-600 dark:text-amber-400"></i>
                    </div>
                    <p className={`text-lg font-bold ${isPaidPlan ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
                      {isPaidPlan ? "∞" : FREE_PLAN_LIMITS.lawsuitsPerDossier}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Lawsuits/Dossier</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-2">
                      <i className="fas fa-tasks text-rose-600 dark:text-rose-400"></i>
                    </div>
                    <p className={`text-lg font-bold ${isPaidPlan ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
                      {isPaidPlan ? "∞" : FREE_PLAN_LIMITS.activeTasks}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Active Tasks</p>
                  </div>
                </div>
                {isPaidPlan && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <i className="fas fa-check-circle"></i>
                    <span className="text-sm font-medium">{t("securityAccess.license.planLimits.paidUnlimited")}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Referral Section - Only for active licenses */}
            {licenseState === "ACTIVE" && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-indigo-900/20 dark:to-purple-900/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-indigo-200/50 dark:border-indigo-800/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
                      <i className="fas fa-gift"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("securityAccess.license.referral.title")}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("securityAccess.license.referral.subtitle")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  {referralStatus === "loading" && (
                    <div className="flex items-center justify-center gap-2 py-4 text-slate-500 dark:text-slate-400">
                      <i className="fas fa-spinner fa-spin"></i>
                      <span className="text-sm">{t("securityAccess.license.referral.loading")}</span>
                    </div>
                  )}
                  {referralStatus === "error" && (
                    <div className="space-y-3">
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span>{referralMessage || t("securityAccess.license.referral.unavailable")}</span>
                      </div>
                      <button
                        onClick={handleRefreshReferral}
                        className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition flex items-center gap-2"
                      >
                        <i className="fas fa-sync-alt"></i>
                        {t("securityAccess.license.referral.retry")}
                      </button>
                    </div>
                  )}
                  {referralStatus === "ready" && (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={referralLink}
                            readOnly
                            className="w-full px-4 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 pr-10"
                          />
                          <i className="fas fa-link absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        </div>
                        <button
                          onClick={handleCopyReferral}
                          className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition flex items-center gap-2 ${referralCopied
                            ? "bg-emerald-500 text-white"
                            : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25"
                          }`}
                        >
                          <i className={`fas ${referralCopied ? "fa-check" : "fa-copy"}`}></i>
                          {referralCopied
                            ? t("securityAccess.license.referral.copied")
                            : t("securityAccess.license.referral.copyLink")}
                        </button>
                      </div>
                      {referralMessage && (
                        <div className="text-xs text-amber-600 dark:text-amber-300 flex items-center gap-2">
                          <i className="fas fa-info-circle"></i>
                          {referralMessage}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ContentSection>

      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center p-0 md:px-4 pt-[var(--titlebar-height)] md:pt-[calc(var(--titlebar-height)+16px)]">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closePlanModal}
          />
          <div className="relative w-full h-full md:h-auto md:max-w-4xl md:max-h-[90vh] rounded-none md:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t("securityAccess.license.planChange.title")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t("securityAccess.license.planChange.subtitle")}
                </p>
              </div>
              <button
                onClick={closePlanModal}
                className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                aria-label={t("securityAccess.license.planChange.actions.close")}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.planChange.currentPlan")}
                  </p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">
                    {planTitle(currentPlanKey)}
                  </p>
                </div>
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {licenseStatusLabel()}
                </span>
              </div>
            </div>

              {planActionsLocked && (
                <div className="mt-4 p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200 text-sm flex items-center gap-2">
                  <i className="fas fa-hourglass-half"></i>
                  <span>{t("securityAccess.license.planChange.status.activationInProgress")}</span>
                </div>
              )}

              {isPerpetual && (
                <div className="mt-4 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-200 text-sm flex items-start gap-3">
                  <i className="fas fa-crown mt-0.5"></i>
                  <div>
                    <p className="font-semibold">{t("securityAccess.license.perpetual.highestPlan", { defaultValue: "You already own the highest Ordinay license." })}</p>
                    <p className="mt-1 text-xs opacity-80">{t("securityAccess.license.perpetual.noChanges", { defaultValue: "Perpetual licenses do not require plan changes. Future add-ons and agents can be managed separately." })}</p>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {isPaidPlan
                    ? t("securityAccess.license.planChange.availablePlans")
                    : t("securityAccess.license.planChange.availablePlans")}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {planOptions.map((plan) => {
                    const isCurrent = currentPlanKey === plan.key;
                    const isManageable = isCurrent && isPaidPlan;
                    // Perpetual users: block all base plan selections (no downgrades, no re-purchase)
                    const isPerpetualBlocked = isPerpetual && !isCurrent;
                    const isDisabled = planActionsLocked || planActionBusy || planRefreshBusy || (isCurrent && !isPaidPlan) || isPerpetualBlocked;
                    const actionLabel = isPerpetualBlocked
                      ? t("securityAccess.license.planChange.actions.unavailable", { defaultValue: "Unavailable" })
                      : isCurrent
                        ? isPaidPlan
                          ? t("securityAccess.license.planChange.actions.manage")
                          : t("securityAccess.license.planChange.actions.current")
                        : isPaidPlan
                          ? t("securityAccess.license.planChange.actions.changeTo", { defaultValue: "Switch" })
                          : t("securityAccess.license.planChange.actions.select");

                    return (
                      <div
                        key={plan.key}
                        className={`rounded-xl border p-4 transition ${isCurrent
                          ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/20"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${isCurrent
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            }`}>
                              <i className={`fas ${plan.icon}`}></i>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {planTitle(plan.key)}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {planDescription(plan.key)}
                              </p>
                            </div>
                          </div>
                          {isCurrent && (
                            <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {t("securityAccess.license.planChange.actions.current")}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleOpenPlanFlow(plan.key, isManageable ? "manage" : "change")}
                          disabled={isDisabled}
                          className={`mt-4 w-full px-3 py-2 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2 ${isDisabled
                            ? "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                            : "bg-slate-900 text-white hover:bg-slate-800"
                          }`}
                        >
                          {planActionBusy && planActionTarget === plan.key && (
                            <i className="fas fa-spinner fa-spin"></i>
                          )}
                          {actionLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                    <i className="fas fa-external-link-alt"></i>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("securityAccess.license.planChange.notes.title")}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {t("securityAccess.license.planChange.notes.external")}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("securityAccess.license.planChange.notes.after")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                  <button
                    onClick={handleRefreshLicense}
                    disabled={planRefreshBusy}
                    className={`w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2 ${planRefreshBusy
                      ? "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    {planRefreshBusy && <i className="fas fa-spinner fa-spin"></i>}
                    {t("securityAccess.license.planChange.actions.refresh")}
                  </button>
                  <button
                    onClick={closePlanModal}
                    className="w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
                  >
                    {t("securityAccess.license.planChange.actions.close")}
                  </button>
                </div>
              </div>

              {planActionError && (
                <div className="mt-4 p-3 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 text-sm flex items-center gap-2">
                  <i className="fas fa-exclamation-circle"></i>
                  <span>{planActionError}</span>
                </div>
              )}
              {planActionMessage && (
                <div className="mt-4 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-200 text-sm flex items-center gap-2">
                  <i className="fas fa-check-circle"></i>
                  <span>{planActionMessage}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showOnlineAccessModal && (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center p-0 md:px-4 pt-[var(--titlebar-height)] md:pt-[calc(var(--titlebar-height)+16px)]">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeOnlineAccessModal}
          />
          <div className="relative w-full h-full md:h-auto md:max-w-md rounded-none md:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl flex flex-col">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                <i className="fas fa-cloud"></i>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("security.onlineAccess.modal.title")}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {t("security.onlineAccess.modal.description")}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <i className="fas fa-hourglass-half text-amber-500"></i>
              <span>{t("security.onlineAccess.modal.badge")}</span>
            </div>
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 justify-end">
              <button
                onClick={closeOnlineAccessModal}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition"
              >
                {t("security.onlineAccess.modal.actions.close")}
              </button>
              <button
                disabled
                className="w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-lg bg-slate-400 text-white cursor-not-allowed"
              >
                {t("security.onlineAccess.modal.actions.setupRequired")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisableConfirm && (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center p-0 md:px-4 pt-[var(--titlebar-height)] md:pt-[calc(var(--titlebar-height)+16px)]">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowDisableConfirm(false)}
          />
          <div className="relative w-full h-full md:h-auto md:max-w-md rounded-none md:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl flex flex-col">
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
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 justify-end">
              <button
                onClick={() => setShowDisableConfirm(false)}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition"
              >
                {t("securityAccess.workspaceLock.actions.cancel")}
              </button>
              <button
                onClick={handleDisableLock}
                className="w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition"
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

          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("security.onlineAccess.title")}
              </h3>
              <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {t("security.onlineAccess.optionalBadge")}
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("security.onlineAccess.description")}
            </p>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-900/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {t("security.onlineAccess.notice.title")}
              </p>
              <ul className="space-y-2 text-xs text-amber-900 dark:text-amber-200">
                {["syncsData", "requiresAccount", "offlineStillWorks"].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <i className="fas fa-info-circle mt-0.5"></i>
                    <span>{t(`security.onlineAccess.notice.items.${item}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("security.onlineAccess.optionalNote")}
            </p>
            <button
              onClick={openOnlineAccessModal}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <i className="fas fa-cloud"></i>
              {t("security.onlineAccess.actions.enable")}
            </button>
          </div>

        </div>
      </ContentSection>
    </div>
  );
}
