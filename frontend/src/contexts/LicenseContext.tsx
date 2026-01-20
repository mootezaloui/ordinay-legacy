import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  activateLicense as writeLicense,
  getAppLicenseState,
  loadLicenseFromDisk,
  readLicenseDataFromDisk,
  setAppLicenseState,
  type LicenseData,
  type LicenseState,
} from "../services/licenseService";

interface LicenseContextValue {
  licenseState: LicenseState;
  licenseData: LicenseData | null;
  licenseError: string | null;
  refreshLicense: () => Promise<LicenseState>;
  activateLicense: (licenseData: LicenseData) => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | undefined>(undefined);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [licenseState, setLicenseState] = useState<LicenseState>(
    getAppLicenseState()
  );
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadLicenseFromDisk(), readLicenseDataFromDisk()]).then(
      ([state, dataResult]) => {
        if (!mounted) return;
        setLicenseState(state);
        setLicenseData(dataResult.data);
        setLicenseError(dataResult.error || null);
      }
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
    setLicenseError(dataResult.error || null);
    return state;
  };

  const activateLicense = async (licenseData: LicenseData) => {
    await writeLicense(licenseData);
    const [nextState, dataResult] = await Promise.all([
      loadLicenseFromDisk(),
      readLicenseDataFromDisk(),
    ]);
    setLicenseState(nextState);
    setLicenseData(dataResult.data);
    setLicenseError(dataResult.error || null);
    setAppLicenseState(nextState);
  };

  return (
    <LicenseContext.Provider
      value={{ licenseState, licenseData, licenseError, refreshLicense, activateLicense }}
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
