import { useEffect, useState } from "react";
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
  getActivationUrl,
  getOrCreateDeviceId,
  type LicenseState,
} from "./services/licenseService";

const FREE_PLAN_STORAGE_KEY = "organia_free_plan_continue";

function App() {
  const { isLocked } = useLock();
  const { isInitialized, completeSetup } = useSetup();
  const { licenseState, licenseData, activateLicense, setActivationState } = useLicense();
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
        setActivationState("ACTIVATING", null);
        const parsed = new URL(url);
        const params = parsed.searchParams;
        const device_id = params.get("device_id");
        const status = params.get("status") || "active";
        const license_type = params.get("license_type") || "yearly";
        const expires_at = params.get("expires_at") || "2026-12-31";
        if (!device_id || status !== "active") {
          setActivationState("ERROR", "Activation failed");
          setActivationError("Activation failed. Please try again.");
          setActivationView("error");
          return;
        }
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(FREE_PLAN_STORAGE_KEY);
        }
        await activateLicense({
          device_id,
          status: "active",
          license_type,
          expires_at,
          last_checked_at: new Date().toISOString(),
        });
        setActivationError(null);
        setActivationView("success");
      } catch (error) {
        console.error("[License] Activation URL failed:", error);
        setActivationState("ERROR", "Activation failed");
        setActivationError("Activation failed. Please try again.");
        setActivationView("error");
      }
    });
  }, [activateLicense, setActivationState]);

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

  const needsActivation = ["FREE", "UNACTIVATED", "EXPIRED", "ERROR"].includes(licenseState);
  const showActivation = (!allowReadOnly && needsActivation) || activationView !== "choice";
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
            const url = getActivationUrl(id);
            if (window.electronAPI?.openExternal) {
              await window.electronAPI.openExternal(url);
            } else {
              window.open(url, "_blank");
            }
          }}
          onContinueReadOnly={() => {
            setActivationError(null);
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
}: {
  licenseState: LicenseState;
  licenseData: any;
  activationView: "choice" | "waiting" | "success" | "error" | "free_setup";
  activationError: string | null;
  onActivate: () => void | Promise<void>;
  onContinueReadOnly: () => void;
  onContinueAfterSuccess: () => void;
  onRetryActivate: () => void;
}) {
  const activationLabels = {
    FREE: "Free plan limits apply",
    UNACTIVATED: "Activate Organia on this device",
    ACTIVATING: "Activation in progress",
    ACTIVE: "Activation complete",
    EXPIRED: "License expired - Reactivate this device",
    ERROR: "Activation error - Try again",
  };

  const viewTitle = () => {
    if (activationView === "waiting") return "Activating Organia";
    if (activationView === "success") return "Activation complete";
    if (activationView === "error") return "Activation failed";
    if (activationView === "free_setup") return "Setting up free plan";
    return activationLabels[licenseState] || "Activate Organia on this device";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold mb-3">
          {viewTitle()}
        </h1>
        {activationView === "waiting" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              Complete payment in your browser. This app will activate automatically when payment finishes.
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <i className="fas fa-spinner fa-spin"></i>
              Waiting for activation...
            </div>
          </>
        ) : activationView === "success" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              Your device is now activated. License details are ready.
            </p>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-200 space-y-1">
              <div>Status: {licenseData?.status || "active"}</div>
              <div>Plan: {licenseData?.license_type || "yearly"}</div>
              <div>Valid Until: {licenseData?.expires_at || "2027-01-20"}</div>
              <div>Device ID: {licenseData?.device_id || "-"}</div>
            </div>
            <button
              onClick={onContinueAfterSuccess}
              className="mt-6 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
            >
              Continue to Organia
            </button>
          </>
        ) : activationView === "error" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              {activationError || "Activation failed. Please try again."}
            </p>
            <div className="space-y-3">
              <button
                onClick={onRetryActivate}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
              >
                Try again
              </button>
              <button
                onClick={onContinueReadOnly}
                className="w-full rounded-lg border border-slate-700 text-slate-200 py-2.5 hover:bg-slate-800 transition"
              >
                Continue with free plan
              </button>
            </div>
          </>
        ) : activationView === "free_setup" ? (
          <>
            <p className="text-sm text-slate-300 mb-6">
              Setting up your free plan. One moment...
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <i className="fas fa-spinner fa-spin"></i>
              Preparing free plan...
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-6">
              This device must be verified with the Organia activation server before write access is unlocked.
            </p>
            <div className="space-y-3">
              <button
                onClick={onActivate}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
              >
                Activate
              </button>
              <button
                onClick={onContinueReadOnly}
                className="w-full rounded-lg border border-slate-700 text-slate-200 py-2.5 hover:bg-slate-800 transition"
              >
                Continue with free plan
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
