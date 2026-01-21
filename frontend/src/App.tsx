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
  requestActivationFromServer,
  type LicenseState,
} from "./services/licenseService";

const READ_ONLY_STORAGE_KEY = "organia_readonly_mode";

function App() {
  const { isLocked } = useLock();
  const { isInitialized, completeSetup } = useSetup();
  const { licenseState, activateLicense, setActivationState } = useLicense();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [allowReadOnly, setAllowReadOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(READ_ONLY_STORAGE_KEY) === "1";
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

  const needsActivation = licenseState !== "ACTIVE";
  if (needsActivation && !allowReadOnly) {
    return (
      <>
        <TitleBar />
        <ActivationScreen
          licenseState={licenseState}
          activationError={activationError}
          onActivate={async () => {
            setActivationError(null);
            setActivationState("ACTIVATING", null);
            const id = deviceId || (await getOrCreateDeviceId());
            const url = getActivationUrl(id);
            if (window.electronAPI?.openExternal) {
              await window.electronAPI.openExternal(url);
            } else {
              window.open(url, "_blank");
            }
          }}
          onContinueReadOnly={() => {
            if (typeof window !== "undefined") {
              window.localStorage.setItem(READ_ONLY_STORAGE_KEY, "1");
            }
            setAllowReadOnly(true);
          }}
          onSimulateActivation={async () => {
            setActivationError(null);
            setActivationState("ACTIVATING", null);
            try {
              const id = deviceId || (await getOrCreateDeviceId());
              const licenseData = await requestActivationFromServer(id);
              await activateLicense(licenseData);
            } catch (error) {
              console.error("[License] Activation failed:", error);
              setActivationError("Activation failed. Please try again.");
              setActivationState("ERROR", "Activation failed");
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
  activationError,
  onActivate,
  onContinueReadOnly,
  onSimulateActivation,
}: {
  licenseState: LicenseState;
  activationError: string | null;
  onActivate: () => void | Promise<void>;
  onContinueReadOnly: () => void;
  onSimulateActivation: () => void | Promise<void>;
}) {
  const activationLabels = {
    UNACTIVATED: "Activate Organia on this device",
    ACTIVATING: "Activation in progress",
    ACTIVE: "Activation complete",
    EXPIRED: "License expired - Reactivate this device",
    ERROR: "Activation error - Try again",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold mb-3">
          {activationLabels[licenseState] || "Activate Organia on this device"}
        </h1>
        <p className="text-sm text-slate-300 mb-6">
          This device must be verified with the Organia activation server before write access is unlocked.
        </p>
        <div className="space-y-3">
          <button
            onClick={onActivate}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 transition"
            disabled={licenseState === "ACTIVATING"}
          >
            Activate
          </button>
          <button
            onClick={onContinueReadOnly}
            className="w-full rounded-lg border border-slate-700 text-slate-200 py-2.5 hover:bg-slate-800 transition"
          >
            Continue in read-only mode
          </button>
          {import.meta.env.DEV && (
            <button
              onClick={onSimulateActivation}
              className="w-full rounded-lg border border-amber-500 text-amber-200 py-2.5 hover:bg-amber-500/10 transition"
            >
              Simulate successful activation
            </button>
          )}
        </div>
        {activationError && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {activationError}
          </div>
        )}
      </div>
    </div>
  );
}
