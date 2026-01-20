export type LicenseType = "monthly" | "yearly" | "perpetual";
export type LicenseStatus = "active";

export interface LicenseData {
  type: LicenseType;
  expires_at: string | null;
  status: LicenseStatus;
}

export type LicenseState = "ACTIVE" | "LOCKED";

export let appLicenseState: LicenseState = "LOCKED";

export function getAppLicenseState(): LicenseState {
  return appLicenseState;
}

export function setAppLicenseState(state: LicenseState): void {
  appLicenseState = state;
}

const isValidDateString = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
};

export interface LicenseReadResult {
  data: LicenseData | null;
  error?: string;
}

export function isLicenseActive(licenseData: LicenseData): boolean {
  if (!licenseData || licenseData.status !== "active") return false;
  if (!["monthly", "yearly", "perpetual"].includes(licenseData.type)) {
    return false;
  }

  if (licenseData.type === "perpetual") {
    return licenseData.expires_at === null;
  }

  if (licenseData.expires_at === null || !isValidDateString(licenseData.expires_at)) {
    return false;
  }

  const expiresAt = new Date(`${licenseData.expires_at}T23:59:59`);
  const now = new Date();
  return now <= expiresAt;
}

export async function loadLicenseFromDisk(): Promise<LicenseState> {
  if (typeof window === "undefined" || !window.electronAPI?.readLicenseFile) {
    setAppLicenseState("ACTIVE");
    return "ACTIVE";
  }

  try {
    const response = await window.electronAPI.readLicenseFile();
    if (!response.exists || !response.contents) {
      setAppLicenseState("LOCKED");
      return "LOCKED";
    }

    const parsed = JSON.parse(response.contents) as LicenseData;
    const nextState: LicenseState = isLicenseActive(parsed) ? "ACTIVE" : "LOCKED";
    setAppLicenseState(nextState);
    return nextState;
  } catch (error) {
    console.error("[License] Failed to read license file:", error);
    setAppLicenseState("LOCKED");
    return "LOCKED";
  }
}

export async function readLicenseDataFromDisk(): Promise<LicenseReadResult> {
  if (typeof window === "undefined" || !window.electronAPI?.readLicenseFile) {
    return { data: null };
  }

  try {
    const response = await window.electronAPI.readLicenseFile();
    if (!response.exists || !response.contents) {
      return { data: null };
    }

    const parsed = JSON.parse(response.contents) as LicenseData;
    return { data: parsed };
  } catch (error) {
    console.error("[License] Failed to parse license file:", error);
    return { data: null, error: "Invalid license file" };
  }
}

export async function activateLicense(licenseData: LicenseData): Promise<void> {
  if (typeof window === "undefined" || !window.electronAPI?.writeLicenseFile) {
    return;
  }

  await window.electronAPI.writeLicenseFile(licenseData);
}
