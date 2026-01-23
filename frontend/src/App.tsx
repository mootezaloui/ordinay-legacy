import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLock } from "./contexts/lockContext";
import { useSetup } from "./contexts/SetupContext";
import SetupFlow from "./components/setup/SetupFlow";
import { useInactivityLock } from "./hooks/useInactivityLock";
import LockScreen from "./components/lock/LockScreen";
import AppRouter from "./routes/AppRouter";
import { OnboardingTutorial } from "./components/onboarding";
import TutorialOverlay from "./components/tutorial/TutorialOverlay";
import LicenseBanner from "./components/LicenseBanner";
import TitleBar from "./components/ui/TitleBar";
import { useLicense } from "./contexts/LicenseContext";
import {
  clearPendingReferralCode,
  extractPendingReferralFromUrl,
  getActivationUrl,
  getOrCreateDeviceId,
  getPendingReferralCode,
  storePendingReferralCode,
  submitReferralOnActivation,
  type LicenseState,
} from "./services/licenseService";

const FREE_PLAN_STORAGE_KEY = "organia_free_plan_continue";

function App() {
  const { t } = useTranslation("activation");
  const { isLocked } = useLock();
  const { isInitialized, completeSetup } = useSetup();
  const { licenseState, licenseData, activateLicense, setActivationState } =
    useLicense();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationView, setActivationView] = useState<
    "choice" | "waiting" | "success" | "error" | "free_setup"
  >("choice");
  const [allowReadOnly, setAllowReadOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FREE_PLAN_STORAGE_KEY) === "1";
  });
  // Monitor user activity for inactivity lock
  useInactivityLock();

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
    if (!window.electronAPI?.onActivationUrl) return;
    window.electronAPI.onActivationUrl(async (url) => {
      try {
        const rawUrl = String(url || "");
        const pendingReferral = extractPendingReferralFromUrl(rawUrl);
        if (pendingReferral) {
          storePendingReferralCode(pendingReferral);
          return;
        }
        setActivationState("ACTIVATING", null);
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
        const statusParam = getParam("status");
        const planParam =
          getParam("plan") ||
          getParam("license_plan") ||
          "";
        const licenseTypeParam = getParam("license_type");
        const planIndicators = `${planParam} ${licenseTypeParam ?? ""} ${statusParam ?? ""} ${rawUrl}`.toLowerCase();
        const validUntilParam =
          getParam("expires_at") || getParam("valid_until");
        let license_type = (licenseTypeParam || "yearly").toLowerCase();
        let expires_at = validUntilParam || "2026-12-31";
        const activationDeviceId =
          getParam("device_id") || (await getOrCreateDeviceId());
        // If the plan is free, set state and error to FREE (single block)
        const isFreeActivation =
          planIndicators.includes("free") || license_type === "free";
        if (isFreeActivation) {
          setActivationState("FREE", null);
          setActivationError(null);
          setActivationView("success");
          const freeLicenseData = {
            status: "active",
            license_type: "free",
            expires_at: null,
            device_id: activationDeviceId || "unknown",
            last_checked_at: new Date().toISOString(),
          };
          if (typeof window !== "undefined") {
            window.localStorage.setItem(FREE_PLAN_STORAGE_KEY, "1");
          }
          if (licenseData && typeof licenseData === "object") {
            Object.assign(licenseData, freeLicenseData);
          }
          return;
        }
        if (
          license_type === "perpetual" ||
          planIndicators.includes("lifetime") ||
          planIndicators.includes("perpetual")
        ) {
          license_type = "perpetual";
          expires_at = null;
        }
        const status = (statusParam || "active").toLowerCase();
        const activeStatuses = new Set([
          "active",
          "success",
          "ok",
          "paid",
          "complete",
          "completed",
        ]);
        if (!activationDeviceId || !activeStatuses.has(status)) {
          console.warn("[License] Activation failed:", {
            url: rawUrl,
            status,
            device_id: activationDeviceId,
            planParam,
            licenseTypeParam,
            validUntilParam,
          });
          setActivationState("ERROR", "Activation failed");
          setActivationError(t("errors.activationFailed"));
          setActivationView("error");
          return;
        }
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(FREE_PLAN_STORAGE_KEY);
        }
        await activateLicense({
          device_id: activationDeviceId,
          status: "active",
          license_type,
          expires_at,
          last_checked_at: new Date().toISOString(),
        });
        const referralCode = getPendingReferralCode();
        const referralResult = await submitReferralOnActivation(
          activationDeviceId,
          referralCode
        );
        if (referralResult.ok) {
          clearPendingReferralCode();
        }
        setActivationError(null);
        setActivationView("success");
      } catch (error) {
        console.error("[License] Activation URL failed:", error);
        setActivationState("ERROR", "Activation failed");
        setActivationError(t("errors.activationFailed"));
        setActivationView("error");
      }
    });
  }, [activateLicense, setActivationState, t]);

  if (!isInitialized) {
    return (
      <>
        <TitleBar />
        <SetupFlow onComplete={completeSetup} />
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
  const showActivation =
    (!allowReadOnly && needsActivation) || activationView !== "choice";
  if (showActivation) {
    return (
      <>
        <TitleBar />
        <ActivationScreen
          licenseState={licenseState}
          licenseData={licenseData}
          activationView={activationView}
          activationError={activationError}
          onActivate={async () => {
            setActivationError(null);
            setActivationState("ACTIVATING", null);
            setActivationView("waiting");
            const id = deviceId || (await getOrCreateDeviceId());
            const pendingReferral = getPendingReferralCode();
            const url = getActivationUrl(id, pendingReferral);
            if (window.electronAPI?.openExternal) {
              await window.electronAPI.openExternal(url);
            } else {
              window.open(url, "_blank");
            }
          }}
          onContinueReadOnly={() => {
            setActivationError(null);
            setActivationState("FREE", null); // Clear error and set state to FREE
            setActivationView("free_setup");
            if (typeof window !== "undefined") {
              window.localStorage.setItem(FREE_PLAN_STORAGE_KEY, "1");
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
          }}
          onCancelActivation={() => {
            setActivationError(null);
            setActivationView("choice");
            setActivationState("FREE", null);
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
  onActivate,
  onContinueReadOnly,
  onContinueAfterSuccess,
  onRetryActivate,
  onCancelActivation,
}: {
  licenseState: LicenseState;
  licenseData: any;
  activationView: "choice" | "waiting" | "success" | "error" | "free_setup";
  activationError: string | null;
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
    return activationLabels[licenseState] || t("states.unactivated");
  };

  const statusLabel = t("details.status", {
    status: licenseData?.status || t("details.statusDefaults.active"),
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
      : licenseData?.license_type === "free" || licenseState === "FREE"
        ? t("details.validUntilValues.unlimited")
        : licenseData?.expires_at || t("details.validUntilValues.fallbackDate");
  const validUntilLabel = t("details.validUntil", { date: validUntilValue });

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold mb-3">{viewTitle()}</h1>
        {activationView === "waiting" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              {t("views.waiting.description")}
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <i className="fas fa-spinner fa-spin"></i>
              {t("views.waiting.status")}
            </div>
            <div className="mt-6 space-y-3">
              <button
                onClick={onActivate}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
              >
                {t("actions.openActivation")}
              </button>
              <button
                onClick={onCancelActivation}
                className="w-full rounded-lg border border-slate-700 text-slate-200 py-2.5 hover:bg-slate-800 transition"
              >
                {t("actions.back")}
              </button>
            </div>
          </>
        ) : activationView === "success" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              {t("views.success.description")}
            </p>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-200 space-y-1">
              <div>{statusLabel}</div>
              <div>{planLabel}</div>
              <div>{validUntilLabel}</div>
            </div>
            <button
              onClick={onContinueAfterSuccess}
              className="mt-6 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
            >
              {t("actions.continue")}
            </button>
          </>
        ) : activationView === "error" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              {activationError || t("errors.activationFailed")}
            </p>
            <div className="space-y-3">
              <button
                onClick={onRetryActivate}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
              >
                {t("actions.tryAgain")}
              </button>
              <button
                onClick={onContinueReadOnly}
                className="w-full rounded-lg border border-slate-700 text-slate-200 py-2.5 hover:bg-slate-800 transition"
              >
                {t("actions.continueFree")}
              </button>
            </div>
          </>
        ) : activationView === "free_setup" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              {t("views.freeSetup.description")}
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <i className="fas fa-spinner fa-spin"></i>
              {t("views.freeSetup.status")}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-6">
              {t("views.choice.description")}
            </p>
            <div className="space-y-3">
              <button
                onClick={onActivate}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
              >
                {t("actions.activate")}
              </button>
              <button
                onClick={onContinueReadOnly}
                className="w-full rounded-lg border border-slate-700 text-slate-200 py-2.5 hover:bg-slate-800 transition"
              >
                {t("actions.continueFree")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
