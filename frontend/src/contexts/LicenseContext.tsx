/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  activateLicense as writeLicense,
  getAppLicenseState,
  getLicenseStateFromData,
  getOrCreateDeviceId,
  loadLicenseFromDisk,
  readLicenseDataFromDisk,
  setAppLicenseState,
  type LicenseData,
  type LicenseState,
  type SignedLicense,
  verifyLicenseWithServer,
} from "../services/licenseService";

interface LicenseContextValue {
  licenseState: LicenseState;
  licenseData: LicenseData | null;
  licenseError: string | null;
  /** True once the initial license state has been resolved from disk. */
  licenseLoaded: boolean;
  refreshLicense: () => Promise<LicenseState>;
  activateLicense: (license: SignedLicense) => Promise<void>;
  setActivationState: (state: LicenseState, error?: string | null) => void;
}

const LicenseContext = createContext<LicenseContextValue | undefined>(
  undefined,
);

export function LicenseProvider({ children }: { children: ReactNode }) {
  // Initial state is LOADING (not FREE). No license UI renders until resolved.
  const [licenseState, setLicenseState] =
    useState<LicenseState>(getAppLicenseState());
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  // Derived from state: LOADING = not loaded, anything else = loaded.
  // Kept for backward compatibility with components that check licenseLoaded.
  const licenseLoaded = licenseState !== "LOADING";

  // One-way state transition: LOADING → resolved state (ACTIVE, FREE, etc.)
  // State only transitions once; no intermediate renders occur.
  useEffect(() => {
    let mounted = true;
    Promise.all([loadLicenseFromDisk(), readLicenseDataFromDisk()]).then(
      ([state, dataResult]) => {
        if (!mounted) return;
        // Single atomic state update: LOADING → resolved state
        setLicenseState(state);
        setLicenseData(dataResult.data);
        // Suppress error for FREE plan, even if license file is malformed
        if (state === "FREE") {
          setLicenseError(null);
        } else {
          setLicenseError(dataResult.error || null);
        }
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const refreshLicense = async () => {
    const [state, dataResult] = await Promise.all([
      loadLicenseFromDisk(),
      readLicenseDataFromDisk(),
    ]);
    setLicenseState(state);
    setLicenseData(dataResult.data);
    // Suppress error for FREE plan, even if license file is malformed
    if (state === "FREE") {
      setLicenseError(null);
    } else {
      setLicenseError(dataResult.error || null);
    }
    return state;
  };

  const setActivationState = (state: LicenseState, error?: string | null) => {
    setLicenseState(state);
    setAppLicenseState(state);
    if (error !== undefined) {
      setLicenseError(error);
    }
  };

  const activateLicense = async (license: SignedLicense) => {
    await writeLicense(license);
    const [nextState, dataResult] = await Promise.all([
      loadLicenseFromDisk(),
      readLicenseDataFromDisk(),
    ]);
    setLicenseState(nextState);
    setLicenseData(dataResult.data);
    // Suppress error for FREE plan, even if license file is malformed
    if (nextState === "FREE") {
      setLicenseError(null);
    } else {
      setLicenseError(dataResult.error || null);
    }
    setAppLicenseState(nextState);
  };

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    const verify = async () => {
      if (licenseState !== "ACTIVE") return;
      try {
        const deviceId = await getOrCreateDeviceId();
        const result = await verifyLicenseWithServer(deviceId, licenseData);
        if (cancelled) return;
        if (result.error) {
          setLicenseError(result.error);
          return;
        }
        if (result.data) {
          const nextState = getLicenseStateFromData(result.data);
          setLicenseData(result.data);
          setLicenseState(nextState);
          setAppLicenseState(nextState);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[License] Verification failed:", error);
        }
      }
    };

    intervalId = window.setInterval(verify, 12 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [licenseState, licenseData]);

  return (
    <LicenseContext.Provider
      value={{
        licenseState,
        licenseData,
        licenseError,
        licenseLoaded,
        refreshLicense,
        activateLicense,
        setActivationState,
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense(): LicenseContextValue {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error("useLicense must be used within LicenseProvider");
  }
  return context;
}
