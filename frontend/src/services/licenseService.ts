export type LicenseType = "monthly" | "yearly" | "perpetual";
export type LicenseStatus = "active" | "expired";

export interface LicenseData {
  device_id: string;
  license_type: LicenseType;
  expires_at: string | null;
  status: LicenseStatus;
  last_checked_at?: string | null;
}

export type LicenseState =
  | "UNACTIVATED"
  | "ACTIVATING"
  | "ACTIVE"
  | "EXPIRED"
  | "ERROR";

export let appLicenseState: LicenseState = "UNACTIVATED";

const DEVICE_ID_STORAGE_KEY = "organia_device_id";

export function getAppLicenseState(): LicenseState {
  return appLicenseState;
}

export function setAppLicenseState(state: LicenseState): void {
  appLicenseState = state;
}

const bufferToHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hashDeviceSeed = async (seed: string): Promise<string> => {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return seed;
  }
  const data = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
};

const readDeviceIdFromDisk = async (): Promise<string | null> => {
  if (typeof window === "undefined") return null;
  if (!window.electronAPI?.readDeviceId) return null;
  try {
    const response = await window.electronAPI.readDeviceId();
    if (response?.exists && response.deviceId) {
      return response.deviceId;
    }
  } catch (error) {
    console.warn("[License] Failed to read device id from disk:", error);
  }
  return null;
};

const writeDeviceIdToDisk = async (deviceId: string): Promise<void> => {
  if (typeof window === "undefined") return;
  if (!window.electronAPI?.writeDeviceId) return;
  try {
    await window.electronAPI.writeDeviceId(deviceId);
  } catch (error) {
    console.warn("[License] Failed to write device id to disk:", error);
  }
};

const readStoredDeviceId = async (): Promise<string | null> => {
  const diskId = await readDeviceIdFromDisk();
  if (diskId) return diskId;
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
};

const persistDeviceId = async (deviceId: string): Promise<void> => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }
  await writeDeviceIdToDisk(deviceId);
};

export async function getOrCreateDeviceId(): Promise<string> {
  if (typeof window === "undefined") return "unknown";
  const existing = await readStoredDeviceId();
  if (existing) return existing;
  const raw =
    crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const hashed = await hashDeviceSeed(raw);
  await persistDeviceId(hashed);
  return hashed;
}

export function getActivationUrl(deviceId: string): string {
  return `https://organia.app/activate?device_id=${encodeURIComponent(deviceId)}`;
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

export function getLicenseStateFromData(
  licenseData: LicenseData | null
): LicenseState {
  if (!licenseData) return "UNACTIVATED";
  if (licenseData.status !== "active") return "EXPIRED";
  if (!["monthly", "yearly", "perpetual"].includes(licenseData.license_type)) {
    return "ERROR";
  }

  if (licenseData.license_type === "perpetual") {
    return licenseData.expires_at === null ? "ACTIVE" : "ERROR";
  }

  if (licenseData.expires_at === null || !isValidDateString(licenseData.expires_at)) {
    return "ERROR";
  }

  const expiresAt = new Date(`${licenseData.expires_at}T23:59:59`);
  const now = new Date();
  return now <= expiresAt ? "ACTIVE" : "EXPIRED";
}

export async function loadLicenseFromDisk(): Promise<LicenseState> {
  if (typeof window === "undefined" || !window.electronAPI?.readLicenseFile) {
    setAppLicenseState("ACTIVE");
    return "ACTIVE";
  }

  try {
    const storedDeviceId = await readStoredDeviceId();
    const response = await window.electronAPI.readLicenseFile();
    if (!response.exists || !response.contents) {
      setAppLicenseState("UNACTIVATED");
      return "UNACTIVATED";
    }

    const parsed = JSON.parse(response.contents) as LicenseData;
    if (!parsed.device_id) {
      setAppLicenseState("ERROR");
      return "ERROR";
    }
    if (!storedDeviceId) {
      await persistDeviceId(parsed.device_id);
    } else if (parsed.device_id !== storedDeviceId) {
      setAppLicenseState("ERROR");
      return "ERROR";
    }
    const nextState = getLicenseStateFromData(parsed);
    setAppLicenseState(nextState);
    return nextState;
  } catch (error) {
    console.error("[License] Failed to read license file:", error);
    setAppLicenseState("ERROR");
    return "ERROR";
  }
}

export async function readLicenseDataFromDisk(): Promise<LicenseReadResult> {
  if (typeof window === "undefined" || !window.electronAPI?.readLicenseFile) {
    return { data: null };
  }

  try {
    const storedDeviceId = await readStoredDeviceId();
    const response = await window.electronAPI.readLicenseFile();
    if (!response.exists || !response.contents) {
      return { data: null };
    }

    const parsed = JSON.parse(response.contents) as LicenseData;
    if (!parsed.device_id) {
      return { data: parsed, error: "Invalid license file" };
    }
    if (!storedDeviceId) {
      await persistDeviceId(parsed.device_id);
    } else if (parsed.device_id !== storedDeviceId) {
      return { data: parsed, error: "License bound to another device" };
    }
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

const mockActivationResponse = (deviceId: string): LicenseData => ({
  device_id: deviceId,
  status: "active",
  license_type: "yearly",
  expires_at: "2026-12-31",
  last_checked_at: new Date().toISOString(),
});

export async function requestActivationFromServer(
  deviceId: string
): Promise<LicenseData> {
  // TODO: Replace mock response with real activation server call.
  return mockActivationResponse(deviceId);
}

export async function verifyLicenseWithServer(
  _deviceId: string,
  cachedData: LicenseData | null
): Promise<LicenseReadResult> {
  // TODO: Replace with real server revalidation and offline handling.
  return { data: cachedData };
}
