import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLock } from "./contexts/LockContext";
import { useSetup } from "./contexts/SetupContext";
import SetupFlow from "./components/setup/SetupFlow";
import { useInactivityLock } from "./hooks/useInactivityLock";
import LockScreen from "./components/lock/LockScreen";
import AppRouter from "./routes/AppRouter";
import {
  OnboardingTutorial,
  TutorialCard,
  TutorialOverlay as OnboardingOverlay,
} from "./components/onboarding";
import TutorialOverlay from "./components/tutorial/TutorialOverlay";
import LicenseBanner from "./components/LicenseBanner";
import TitleBar from "./components/ui/TitleBar";
import { useLicense } from "./contexts/LicenseContext";
import { useNotifications } from "./contexts/NotificationContext";
import { useUpdateStatus } from "./hooks/useUpdateStatus";
import { useOnboarding } from "./contexts/OnboardingContext";
import { useTutorial } from "./contexts/TutorialContext";
import {
  clearPendingReferralCode,
  extractPendingReferralFromUrl,
  getActivationUrl,
  getOrCreateDeviceId,
  getPendingReferralCode,
  fetchActivationStatus,
  startActivationIntent,
  storePendingReferralCode,
  submitReferralOnActivation,
  type LicenseData,
  type LicenseState,
  type SignedLicense,
} from "./services/licenseService";
import { openExternalLink } from "./lib/externalLink";

const FREE_PLAN_STORAGE_KEY = "ordinay_free_plan_continue";
const ACTIVATION_PENDING_STORAGE_KEY = "ordinay_activation_pending";
const decodeBase64UrlToString = (value: string): string | null => {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const parseSignedLicenseFromUrl = (encoded: string): SignedLicense | null => {
  const decoded = decodeBase64UrlToString(encoded);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as SignedLicense;
  } catch {
    return null;
  }
};

type ReferralRewardSummary = {
  id: string;
  reward_type: "percentage" | "fixed_amount" | "extra_days";
  reward_value: number;
  expires_at: string | null;
  status?: "unused" | "used" | "expired";
};

const parseRewardsFromUrl = (encoded: string | null): ReferralRewardSummary[] => {
  if (!encoded) return [];
  const decoded = decodeBase64UrlToString(encoded);
  if (!decoded) return [];
  try {
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as ReferralRewardSummary[];
  } catch {
    return [];
  }
};

function App() {
  const { t } = useTranslation("activation");
  const { t: tSettings } = useTranslation("settings");
  const { isLocked } = useLock();
  const { isInitialized } = useSetup();
  const {
    hasCompletedOnboarding,
    hasSkippedOnboarding,
    isActive: isOnboardingActive,
    showWelcomeModal,
  } = useOnboarding();
  const {
    isActive: isGuidedTutorialActive,
    hasCompletedTutorial: hasCompletedGuidedTutorial,
    hasStartedTutorial: hasStartedGuidedTutorial,
  } = useTutorial();
  const {
    licenseState,
    licenseData,
    licenseLoaded,
    activateLicense,
    setActivationState,
  } = useLicense();
  const { addAlert } = useNotifications();
  const updateStatus = useUpdateStatus();
  const updateAlertRef = useRef({
    lastStatus: "",
    lastVersionNotified: "",
  });
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationView, setActivationView] = useState<
    "choice" | "waiting" | "success" | "error" | "free_setup"
  >("choice");
  const [activationRewards, setActivationRewards] = useState<ReferralRewardSummary[]>([]);
  const [allowReadOnly, setAllowReadOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FREE_PLAN_STORAGE_KEY) === "1";
  });
  const activationContextRef = useRef({
    t,
    activateLicense,
    setActivationState,
    licenseState,
    addAlert,
  });
  const activationInFlightRef = useRef<string | null>(null);
  const activationPollRef = useRef<number | null>(null);
  // Monitor user activity for inactivity lock
  useInactivityLock();

  useEffect(() => {
    activationContextRef.current = {
      t,
      activateLicense,
      setActivationState,
      licenseState,
      addAlert,
    };
  }, [activateLicense, setActivationState, t, licenseState, addAlert]);

  useEffect(() => {
    let mounted = true;
    getOrCreateDeviceId().then((id) => {
      if (mounted) setDeviceId(id);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!deviceId || !licenseLoaded) return;
    let cancelled = false;
    const checkStatus = async () => {
      const status = await fetchActivationStatus(deviceId);
      if (cancelled || !status.ok) return;
      if (status.status === "paid" && status.license) {
        try {
          if (licenseState !== "ACTIVE") {
            await activateLicense(status.license);
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(FREE_PLAN_STORAGE_KEY);
              window.localStorage.removeItem(ACTIVATION_PENDING_STORAGE_KEY);
            }
            setActivationRewards([]);
            setActivationError(null);
            setActivationView("success");
          }
        } catch {
          setActivationState("ERROR", "Activation failed");
          setActivationError("Activation failed");
          setActivationView("error");
        }
        return;
      }
      if (status.status === "blocked") {
        setActivationState("ERROR", "Activation blocked");
        setActivationError(
          "This subscription is already active on another device."
        );
        setActivationView("error");
        return;
      }
      if (status.status === "expired") {
        setActivationState("EXPIRED", "Activation expired");
        setActivationError("Activation expired. Please contact support.");
        setActivationView("error");
        return;
      }
      if (status.status === "pending") {
        const shouldResume =
          typeof window !== "undefined" &&
          window.localStorage.getItem(ACTIVATION_PENDING_STORAGE_KEY) === "1";
        if (shouldResume) {
          setActivationState("ACTIVATING", null);
          setActivationView("waiting");
        }
      }
    };
    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [deviceId, licenseLoaded, licenseState, activateLicense, setActivationState]);

  useEffect(() => {
    if (!window.electronAPI?.onActivationUrl) return;
    // Register once; handler pulls latest deps from refs and cleans up on unmount.
    const unsubscribe = window.electronAPI.onActivationUrl(async (url) => {
      const rawUrl = String(url || "");
      if (!rawUrl) return;
      if (activationInFlightRef.current === rawUrl) return;
      activationInFlightRef.current = rawUrl;
      try {
        const {
          t: tActivation,
          activateLicense: activateLicenseCurrent,
          setActivationState: setActivationStateCurrent,
          licenseState: currentLicenseState,
          addAlert: addAlertCurrent,
        } = activationContextRef.current;
        const pendingReferral = extractPendingReferralFromUrl(rawUrl);
        if (pendingReferral) {
          storePendingReferralCode(pendingReferral);
          return;
        }
        let parsed: URL | null = null;
        try {
          parsed = new URL(rawUrl);
        } catch {
          parsed = null;
        }
        const params = parsed ? parsed.searchParams : new URLSearchParams();
        const hashParams = parsed
          ? new URLSearchParams(parsed.hash.replace(/^#/, ""))
          : new URLSearchParams();
        const getParam = (key: string) =>
          params.get(key) ?? hashParams.get(key);
        const licenseParam = getParam("license");
        const rewardsParam = getParam("rewards");
        const activationDeviceId =
          getParam("device_id") || (await getOrCreateDeviceId());

        // Determine if this is a plan change (user already ACTIVE) vs first activation
        const isPlanChange = currentLicenseState === "ACTIVE";

        if (!licenseParam) {
          console.warn("[License] Activation failed:", {
            url: rawUrl,
            device_id: activationDeviceId,
          });
          if (!isPlanChange) {
            setActivationStateCurrent("ERROR", "Activation failed");
            setActivationError("Missing license data in activation link.");
            setActivationView("error");
          }
          return;
        }
        const signedLicense = parseSignedLicenseFromUrl(licenseParam);
        if (!signedLicense) {
          console.warn("[License] Activation failed: invalid license payload");
          if (!isPlanChange) {
            setActivationStateCurrent("ERROR", "Activation failed");
            setActivationError("Activation license could not be parsed.");
            setActivationView("error");
          }
          return;
        }

        if (isPlanChange) {
          // Plan change: silently update license, show toast, do NOT show activation screen
          await activateLicenseCurrent(signedLicense);
          addAlertCurrent({
            type: "success",
            title: tActivation("planChange.toast.title", { defaultValue: "Plan updated" }),
            message: tActivation("planChange.toast.message", { defaultValue: "Your plan has been changed successfully." }),
            duration: 6000,
          });
          // Do NOT change activationView — user stays in the normal app flow
        } else {
          // First activation: full activation flow
          setActivationStateCurrent("ACTIVATING", null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(FREE_PLAN_STORAGE_KEY);
          }
          await activateLicenseCurrent(signedLicense);
          setActivationRewards(parseRewardsFromUrl(rewardsParam));
          const referralCode = getPendingReferralCode();
          const referralResult = await submitReferralOnActivation(
            activationDeviceId,
            referralCode
          );
          if (referralResult.ok) {
            clearPendingReferralCode();
          }
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(ACTIVATION_PENDING_STORAGE_KEY);
          }
          setActivationError(null);
          setActivationView("success");
        }
      } catch (error) {
        console.error("[License] Activation URL failed:", error);
        const {
          t: tActivation,
          setActivationState: setActivationStateCurrent,
          licenseState: currentLicenseState,
        } = activationContextRef.current;
        // Only show error screen for first activation, not plan changes
        if (currentLicenseState !== "ACTIVE") {
          setActivationStateCurrent("ERROR", "Activation failed");
          const message =
            error instanceof Error && error.message
              ? error.message
              : tActivation("errors.activationFailed");
          setActivationError(message);
          setActivationView("error");
        } else {
          console.warn("[License] Plan change failed silently:", error);
        }
      } finally {
        if (activationInFlightRef.current === rawUrl) {
          activationInFlightRef.current = null;
        }
      }
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (activationView !== "waiting" || !deviceId) {
      if (activationPollRef.current) {
        window.clearInterval(activationPollRef.current);
        activationPollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const status = await fetchActivationStatus(deviceId);
      if (!status.ok) {
        return;
      }
      if (status.status === "pending") {
        return;
      }
      if (status.status === "blocked") {
        setActivationState("ERROR", "Activation blocked");
        setActivationError("This subscription is already active on another device.");
        setActivationView("error");
        return;
      }
      if (status.status === "expired") {
        setActivationState("ERROR", "Activation expired");
        setActivationError("Activation expired. Please try again.");
        setActivationView("error");
        return;
      }
      if (status.status === "paid" && status.license) {
        try {
          await activateLicense(status.license);
          setActivationRewards([]);
          setActivationError(null);
            setActivationView("success");
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(FREE_PLAN_STORAGE_KEY);
              window.localStorage.removeItem(ACTIVATION_PENDING_STORAGE_KEY);
            }
          } catch (error) {
          setActivationState("ERROR", "Activation failed");
          setActivationError("Activation failed");
          setActivationView("error");
        }
      }
    };

    poll();
    activationPollRef.current = window.setInterval(poll, 4000);

    return () => {
      if (activationPollRef.current) {
        window.clearInterval(activationPollRef.current);
        activationPollRef.current = null;
      }
    };
  }, [activationView, deviceId, activateLicense, setActivationState]);

  useEffect(() => {
    if (!updateStatus) return;
    const status = updateStatus.status || "";

    if (
      status === "update-available" &&
      updateStatus.availableVersion &&
      updateAlertRef.current.lastVersionNotified !== updateStatus.availableVersion
    ) {
      addAlert({
        type: "info",
        title: tSettings("updates.notice.availableTitle"),
        message: tSettings("updates.notice.availableMessage"),
      });
      updateAlertRef.current.lastVersionNotified =
        updateStatus.availableVersion;
    }

    const isUpdateFailure = [
      "download-failed",
      "update-check-failed",
      "verification-failed",
      "install-blocked",
    ].includes(status);
    if (isUpdateFailure && updateAlertRef.current.lastStatus !== status) {
      addAlert({
        type: "error",
        title: tSettings("updates.notice.downloadFailedTitle"),
        message:
          updateStatus.lastError || tSettings("updates.notice.downloadFailedMessage"),
      });
    }

    updateAlertRef.current.lastStatus = status;
  }, [
    addAlert,
    tSettings,
    updateStatus,
    updateStatus.availableVersion,
    updateStatus.status,
  ]);

  if (!isInitialized) {
    return (
      <>
        <TitleBar />
        <SetupFlow />
      </>
    );
  }

  // Render lock screen if workspace is locked
  // This is a complete gate - no app data is rendered behind it
  if (isLocked) {
    return (
      <>
        <TitleBar />
        <LockScreen />
      </>
    );
  }

  const needsActivation = ["FREE", "UNACTIVATED", "EXPIRED", "ERROR"].includes(
    licenseState,
  );
  const hasFinishedOnboarding = hasCompletedOnboarding || hasSkippedOnboarding;
  const isOnboardingVisible = showWelcomeModal || isOnboardingActive;
  const isGuidedTutorialPending =
    isGuidedTutorialActive || (hasStartedGuidedTutorial && !hasCompletedGuidedTutorial);
  const shouldShowActivation =
    !isOnboardingVisible &&
    hasFinishedOnboarding &&
    !isGuidedTutorialPending &&
    ((!allowReadOnly && needsActivation) || activationView !== "choice");
  if (shouldShowActivation) {
    return (
      <>
        <TitleBar />
        <ActivationScreen
          licenseState={licenseState}
          licenseData={licenseData}
          activationView={activationView}
          activationError={activationError}
          activationRewards={activationRewards}
          onActivate={async () => {
            setActivationError(null);
            setActivationState("ACTIVATING", null);
            setActivationView("waiting");
            const id = deviceId || (await getOrCreateDeviceId());
            const pendingReferral = getPendingReferralCode();
            if (typeof window !== "undefined") {
              window.localStorage.setItem(ACTIVATION_PENDING_STORAGE_KEY, "1");
            }
            const startResult = await startActivationIntent(id, pendingReferral);
            if (startResult.ok && startResult.status === "paid" && startResult.license) {
              await activateLicense(startResult.license);
              setActivationRewards([]);
              setActivationError(null);
              setActivationView("success");
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(FREE_PLAN_STORAGE_KEY);
                window.localStorage.removeItem(ACTIVATION_PENDING_STORAGE_KEY);
              }
              return;
            }
            if (!startResult.ok || startResult.status === "blocked") {
              setActivationState("ERROR", "Activation blocked");
              setActivationError(startResult.error || "This subscription is already active on another device.");
              setActivationView("error");
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(ACTIVATION_PENDING_STORAGE_KEY);
              }
              return;
            }
            const url = startResult.payment_url || getActivationUrl(id, pendingReferral);
            await openExternalLink(url, "activation");
          }}
          onContinueReadOnly={() => {
            setActivationError(null);
            setActivationState("FREE", null); // Clear error and set state to FREE
            setActivationView("free_setup");
            setActivationRewards([]);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(FREE_PLAN_STORAGE_KEY, "1");
              window.localStorage.removeItem(ACTIVATION_PENDING_STORAGE_KEY);
            }
            window.setTimeout(() => {
              setAllowReadOnly(true);
              setActivationView("choice");
            }, 800);
          }}
          onContinueAfterSuccess={() => {
            setAllowReadOnly(true);
            setActivationView("choice");
          }}
          onRetryActivate={() => {
            setActivationError(null);
            setActivationView("choice");
            setActivationState("FREE", null);
            setActivationRewards([]);
          }}
          onCancelActivation={() => {
            setActivationError(null);
            setActivationView("choice");
            setActivationState("FREE", null);
            setActivationRewards([]);
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(ACTIVATION_PENDING_STORAGE_KEY);
            }
          }}
        />
      </>
    );
  }

  // Normal app flow
  return (
    <>
      <TitleBar />
      <LicenseBanner />
      <AppRouter />
      <OnboardingTutorial />
      <TutorialOverlay />
    </>
  );
}

export default App;

function ActivationScreen({
  licenseState,
  licenseData,
  activationView,
  activationError,
  activationRewards,
  onActivate,
  onContinueReadOnly,
  onContinueAfterSuccess,
  onRetryActivate,
  onCancelActivation,
}: {
  licenseState: LicenseState;
  licenseData: LicenseData | null;
  activationView: "choice" | "waiting" | "success" | "error" | "free_setup";
  activationError: string | null;
  activationRewards: ReferralRewardSummary[];
  onActivate: () => void | Promise<void>;
  onContinueReadOnly: () => void;
  onContinueAfterSuccess: () => void;
  onRetryActivate: () => void;
  onCancelActivation: () => void;
}) {
  const { t } = useTranslation("activation");
  const activationLabels: Record<string, string> = {
    LOADING: t("states.loading", { defaultValue: "Loading..." }),
    FREE: t("states.free"),
    UNACTIVATED: t("states.unactivated"),
    ACTIVATING: t("states.activating"),
    ACTIVE: t("states.active"),
    EXPIRED: t("states.expired"),
    ERROR: t("states.error"),
  };

  const viewTitle = () => {
    if (activationView === "waiting") return t("views.waiting.title");
    if (activationView === "success") return t("views.success.title");
    if (activationView === "error") return t("views.error.title");
    if (activationView === "free_setup") return t("views.freeSetup.title");
    if (activationView === "choice") return t("views.choice.title");
    return activationLabels[licenseState] || t("states.unactivated");
  };
  const viewSubtitle =
    activationView === "choice" ? t("views.choice.subtitle") : undefined;
  const headerIcon =
    activationView === "success"
      ? "fas fa-circle-check"
      : activationView === "error"
        ? "fas fa-triangle-exclamation"
        : activationView === "waiting" || activationView === "free_setup"
          ? "fas fa-spinner fa-spin"
          : "fas fa-key";

  const statusLabel = t("details.status", {
    status:
      licenseState === "ACTIVE"
        ? t("details.statusDefaults.active")
        : t("details.statusDefaults.inactive", { defaultValue: "inactive" }),
  });
  const planValue =
    licenseData?.license_type ||
    (licenseState === "FREE" ? "free" : "yearly");
  const planLabel = t("details.plan", {
    plan: t(`details.plans.${planValue}`, { defaultValue: planValue }),
  });
  const validUntilValue =
    licenseData?.license_type === "perpetual"
      ? t("details.validUntilValues.lifetime")
      : licenseState === "FREE"
        ? t("details.validUntilValues.unlimited")
        : licenseData?.expires_at || t("details.validUntilValues.fallbackDate");
  const validUntilLabel = t("details.validUntil", { date: validUntilValue });

  return (
    <OnboardingOverlay showEscHint={false}>
      <TutorialCard
        title={viewTitle()}
        subtitle={viewSubtitle}
        icon={headerIcon}
        showProgress={false}
        showNavigation={false}
      >
        {activationView === "waiting" ? (
          <div className="space-y-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("views.waiting.description")}
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-300">
              <i className="fas fa-spinner fa-spin text-blue-500" />
              {t("views.waiting.status")}
            </div>
            <div className="pt-4 border-t border-slate-200/70 dark:border-slate-700/60 space-y-3">
              <button
                onClick={onActivate}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition"
              >
                {t("actions.openActivation")}
              </button>
              <button
                onClick={onCancelActivation}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition"
              >
                {t("actions.back")}
              </button>
            </div>
          </div>
        ) : activationView === "success" ? (
          <div className="space-y-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("views.success.description")}
            </p>
            <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-600 dark:text-slate-200 space-y-1">
              <div>{statusLabel}</div>
              <div>{planLabel}</div>
              <div>{validUntilLabel}</div>
            </div>
            {activationRewards.length > 0 && (
              <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-100">
                <div className="font-semibold mb-1">
                  {t("views.success.rewardsTitle")}
                </div>
                {activationRewards.map((reward) => (
                  <div
                    key={reward.id}
                    className="flex items-center justify-between gap-4"
                  >
                    <span>
                      {reward.reward_type === "percentage"
                        ? t("views.success.rewards.percentage", {
                            value: reward.reward_value,
                          })
                        : reward.reward_type === "fixed_amount"
                          ? t("views.success.rewards.fixed", {
                              value: reward.reward_value,
                            })
                          : t("views.success.rewards.extraDays", {
                              value: reward.reward_value,
                            })}
                    </span>
                    <span>
                      {reward.expires_at
                        ? t("views.success.rewards.expires", {
                            date: reward.expires_at,
                          })
                        : t("views.success.rewards.noExpiry")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={onContinueAfterSuccess}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition"
            >
              {t("actions.continue")}
            </button>
          </div>
        ) : activationView === "error" ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-rose-200/70 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
              {activationError || t("errors.activationFailed")}
            </div>
            <div className="pt-4 border-t border-slate-200/70 dark:border-slate-700/60 space-y-3">
              <button
                onClick={onRetryActivate}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition"
              >
                {t("actions.tryAgain")}
              </button>
              <button
                onClick={onContinueReadOnly}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition"
              >
                {t("actions.continueFree")}
              </button>
            </div>
          </div>
        ) : activationView === "free_setup" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("views.freeSetup.description")}
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-300">
              <i className="fas fa-spinner fa-spin text-blue-500" />
              {t("views.freeSetup.status")}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("views.choice.description")}
            </p>
            <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/40 px-4 py-3">
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <i className="fas fa-check text-emerald-500 mt-0.5" />
                  <span>{t("views.choice.bullets.limits")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="fas fa-check text-emerald-500 mt-0.5" />
                  <span>{t("views.choice.bullets.manage")}</span>
                </li>
              </ul>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("views.choice.footer")}
            </p>
            <div className="pt-4 border-t border-slate-200/70 dark:border-slate-700/60 space-y-3">
              <button
                onClick={onActivate}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition"
              >
                {t("actions.activate")}
              </button>
              <button
                onClick={onContinueReadOnly}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition"
              >
                {t("actions.continueFree")}
              </button>
            </div>
          </div>
        )}
      </TutorialCard>
    </OnboardingOverlay>
  );
}
