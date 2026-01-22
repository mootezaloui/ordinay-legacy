export type LicenseType = "monthly" | "yearly" | "perpetual";
export type LicenseStatus = "active" | "expired";
export type PlanChoice = "free" | "trial" | "monthly" | "yearly" | "perpetual";

export interface LicenseData {
  device_id: string;
  license_type: LicenseType;
  expires_at: string | null;
  status: LicenseStatus;
  last_checked_at?: string | null;
}

export type LicenseState =
  | "FREE"
  | "UNACTIVATED"
  | "ACTIVATING"
  | "ACTIVE"
  | "EXPIRED"
  | "ERROR";

export let appLicenseState: LicenseState = "FREE";

const DEVICE_ID_STORAGE_KEY = "organia_device_id";
const PENDING_REFERRAL_STORAGE_KEY = "organia_pending_referral_code";

const getActivationBaseUrl = (): string =>
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_ACTIVATION_BASE_URL) ||
  "https://organia.app/activate";

const getLicenseServerOrigin = (): string => {
  const base = getActivationBaseUrl();
  try {
    return new URL(base).origin;
  } catch {
    return "https://organia.app";
  }
};

const getPlanManagementBaseUrl = (): string =>
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_PLAN_MANAGEMENT_URL) ||
  getActivationBaseUrl();

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

export function getActivationUrl(
  deviceId: string,
  pendingReferralCode?: string | null
): string {
  const base = getActivationBaseUrl();
  const separator = base.includes("?") ? "&" : "?";
  const referralSuffix = pendingReferralCode
    ? `&ref=${encodeURIComponent(pendingReferralCode)}`
    : "";
  return `${base}${separator}device_id=${encodeURIComponent(deviceId)}${referralSuffix}`;
}

export function getPlanManagementUrl({
  deviceId,
  currentPlan,
  targetPlan,
  licenseState,
  action,
}: {
  deviceId?: string | null;
  currentPlan?: string | null;
  targetPlan?: string | null;
  licenseState?: LicenseState | null;
  action?: "manage" | "change" | "upgrade";
}): string {
  const base = getPlanManagementBaseUrl();
  try {
    const url = new URL(base);
    if (deviceId) url.searchParams.set("device_id", deviceId);
    if (currentPlan) url.searchParams.set("current_plan", currentPlan);
    if (targetPlan) url.searchParams.set("target_plan", targetPlan);
    if (licenseState) url.searchParams.set("license_state", licenseState.toLowerCase());
    if (action) url.searchParams.set("action", action);
    url.searchParams.set("source", "organia_app");
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    if (deviceId) params.set("device_id", deviceId);
    if (currentPlan) params.set("current_plan", currentPlan);
    if (targetPlan) params.set("target_plan", targetPlan);
    if (licenseState) params.set("license_state", licenseState.toLowerCase());
    if (action) params.set("action", action);
    params.set("source", "organia_app");
    const suffix = params.toString();
    const separator = base.includes("?") ? "&" : "?";
    return suffix ? `${base}${separator}${suffix}` : base;
  }
}

export function storePendingReferralCode(code: string): void {
  if (typeof window === "undefined") return;
  const normalized = String(code || "").trim();
  if (!normalized) return;
  window.localStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, normalized);
}

export function getPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
}

export function clearPendingReferralCode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
}

export function extractPendingReferralFromUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    parsed = null;
  }
  if (!parsed) return null;
  const params = parsed.searchParams;
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const getParam = (key: string) => params.get(key) ?? hashParams.get(key);
  const refParam =
    getParam("ref") || getParam("referral") || getParam("referral_code");
  const isInstall =
    parsed.hostname === "install" ||
    parsed.pathname === "/install" ||
    parsed.pathname.startsWith("/install/");
  if (!refParam || !isInstall) return null;
  return refParam.trim();
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
  if (!licenseData) return "FREE";
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
      setAppLicenseState("FREE");
      return "FREE";
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

export type ReferralLinkResult = {
  link: string | null;
  error?: string;
};

export async function requestReferralLink(
  deviceId: string
): Promise<ReferralLinkResult> {
  const origin = getLicenseServerOrigin();
  const endpoint = `${origin}/api/referrals/link?device_id=${encodeURIComponent(deviceId)}`;
  try {
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return { link: null, error: "Referral link unavailable" };
    }
    const payload = await response.json();
    if (payload?.referral_link) {
      return { link: String(payload.referral_link) };
    }
    if (payload?.referral_code) {
      return {
        link: `${origin}/install?ref=${encodeURIComponent(payload.referral_code)}`,
      };
    }
    return { link: null, error: "Referral link unavailable" };
  } catch (error) {
    console.warn("[Referral] Failed to fetch referral link:", error);
    return { link: null, error: "Referral link unavailable" };
  }
}

export type ReferralSubmitResult = {
  ok: boolean;
  error?: string;
};

export async function submitReferralOnActivation(
  deviceId: string,
  pendingReferralCode?: string | null
): Promise<ReferralSubmitResult> {
  if (!pendingReferralCode) {
    return { ok: true };
  }
  const origin = getLicenseServerOrigin();
  const endpoint = `${origin}/api/activations/referral`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId,
        pending_referral_code: pendingReferralCode,
      }),
    });
    if (!response.ok) {
      return { ok: false, error: "Referral submission failed" };
    }
    return { ok: true };
  } catch (error) {
    console.warn("[Referral] Failed to submit referral:", error);
    return { ok: false, error: "Referral submission failed" };
  }
}

export async function verifyLicenseWithServer(
  _deviceId: string,
  cachedData: LicenseData | null
): Promise<LicenseReadResult> {
  // TODO: Replace with real server revalidation and offline handling.
  return { data: cachedData };
}

export const FREE_PLAN_LIMITS = {
  clients: 3,
  dossiers: 3,
  casesPerDossier: 1,
  activeTasks: 10,
};

export type FreeLimitResult = {
  allowed: boolean;
  limit?: number;
  current?: number;
  label?: string;
  message?: string;
};

const isFreePlanState = (state: LicenseState) =>
  state === "FREE" || state === "EXPIRED" || state === "UNACTIVATED";

const isTaskActive = (status: string) =>
  !["Done", "Cancelled"].includes(status || "");

export function checkFreePlanLimit({
  licenseState,
  clients,
  dossiers,
  cases,
  tasks,
  entityType,
  entityData,
}: {
  licenseState: LicenseState;
  clients: Array<any>;
  dossiers: Array<any>;
  cases: Array<any>;
  tasks: Array<any>;
  entityType: "client" | "dossier" | "case" | "task";
  entityData?: any;
}): FreeLimitResult {
  if (!isFreePlanState(licenseState)) {
    return { allowed: true };
  }

  if (entityType === "client") {
    const current = clients.length;
    if (current >= FREE_PLAN_LIMITS.clients) {
      return {
        allowed: false,
        limit: FREE_PLAN_LIMITS.clients,
        current,
        label: "Clients",
      };
    }
  }

  if (entityType === "dossier") {
    const current = dossiers.length;
    if (current >= FREE_PLAN_LIMITS.dossiers) {
      return {
        allowed: false,
        limit: FREE_PLAN_LIMITS.dossiers,
        current,
        label: "Dossiers",
      };
    }
  }

  if (entityType === "case") {
    const dossierId = entityData?.dossierId ?? entityData?.dossier_id ?? null;
    if (dossierId) {
      const current = cases.filter((item) => String(item.dossierId) === String(dossierId)).length;
      if (current >= FREE_PLAN_LIMITS.casesPerDossier) {
        return {
          allowed: false,
          limit: FREE_PLAN_LIMITS.casesPerDossier,
          current,
          label: "Cases per dossier",
        };
      }
    }
  }

  if (entityType === "task") {
    if (!isTaskActive(entityData?.status)) {
      return { allowed: true };
    }
    const current = tasks.filter((task) => isTaskActive(task.status)).length;
    if (current >= FREE_PLAN_LIMITS.activeTasks) {
      return {
        allowed: false,
        limit: FREE_PLAN_LIMITS.activeTasks,
        current,
        label: "Active tasks",
      };
    }
  }

  return { allowed: true };
}
