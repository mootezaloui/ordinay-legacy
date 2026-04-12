import nacl from "tweetnacl";

export type LicenseType = "monthly" | "yearly" | "perpetual";
export type PlanChoice = "free" | "trial" | "monthly" | "yearly" | "perpetual";

export interface LicenseData {
  license_id: string;
  device_id: string;
  license_type: LicenseType;
  expires_at: string | null;
  issued_at: string;
}

export interface SignedLicense {
  payload: LicenseData;
  signature: string;
}

export type LicenseState =
  | "LOADING" // Uninitialized: license not yet resolved. No license UI may render.
  | "FREE"
  | "UNACTIVATED"
  | "ACTIVATING"
  | "ACTIVE"
  | "EXPIRED"
  | "ERROR";

// Default to LOADING, not FREE. Unknown ≠ locked. No UI renders until resolved.
export let appLicenseState: LicenseState = "LOADING";

const DEVICE_ID_STORAGE_KEY = "ordinay_device_id";
const PENDING_REFERRAL_STORAGE_KEY = "ordinay_pending_referral_code";

const LICENSE_PUBLIC_KEY_BASE64 =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_LICENSE_PUBLIC_KEY) ||
  "REPLACE_WITH_ED25519_PUBLIC_KEY_BASE64";

const LICENSE_FILE_KEYS = ["payload", "signature"] as const;
const LICENSE_PAYLOAD_KEYS = [
  "license_id",
  "device_id",
  "license_type",
  "expires_at",
  "issued_at",
] as const;

const LICENSE_ID_PATTERN = /^LIC-ORG-\d{4}-[A-Z0-9]{4}$/;

const getActivationBaseUrl = (): string =>
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_ACTIVATION_BASE_URL) ||
  "https://ordinay.app/activate";

const getLicenseServerOrigin = (): string => {
  const base = getActivationBaseUrl();
  try {
    return new URL(base).origin;
  } catch {
    return "https://ordinay.app";
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

export type ActivationStartResult = {
  ok: boolean;
  status: "pending" | "paid" | "blocked" | "expired";
  payment_url?: string | null;
  license?: SignedLicense;
  error?: string;
};

export type ActivationStatusResult = ActivationStartResult;

export async function startActivationIntent(
  deviceId: string,
  pendingReferralCode?: string | null,
): Promise<ActivationStartResult> {
  const origin = getLicenseServerOrigin();
  try {
    const response = await fetch(`${origin}/api/activation/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId,
        pending_referral_code: pendingReferralCode ?? null,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as ActivationStartResult;
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        status: payload.status ?? "expired",
        error: payload.error || "Activation failed",
      };
    }
    return payload;
  } catch (error) {
    return { ok: false, status: "expired", error: "Activation failed" };
  }
}

export async function fetchActivationStatus(
  deviceId: string,
): Promise<ActivationStatusResult> {
  const origin = getLicenseServerOrigin();
  try {
    const response = await fetch(
      `${origin}/api/activation/status?device_id=${encodeURIComponent(deviceId)}`,
      { method: "GET" },
    );
    const payload = (await response.json().catch(() => ({}))) as ActivationStatusResult;
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        status: payload.status ?? "expired",
        error: payload.error || "Activation failed",
      };
    }
    return payload;
  } catch {
    return { ok: false, status: "expired", error: "Activation failed" };
  }
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
    url.searchParams.set("source", "ordinay_app");
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    if (deviceId) params.set("device_id", deviceId);
    if (currentPlan) params.set("current_plan", currentPlan);
    if (targetPlan) params.set("target_plan", targetPlan);
    if (licenseState) params.set("license_state", licenseState.toLowerCase());
    if (action) params.set("action", action);
    params.set("source", "ordinay_app");
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

// ── Ordinay AI Agent Token ────────────────────────────────

export interface AgentTokenResult {
  ok: boolean;
  token?: string;
  expires_in?: number;
  error?: string;
}

interface AgentTokenCacheRecord {
  token: string;
  expiresAt: number;
}

const MAX_AGENT_TOKEN_LENGTH = 16_384;
let inMemoryAgentTokenCache: AgentTokenCacheRecord | null = null;

const normalizeAgentTokenCacheRecord = (
  value: unknown,
): AgentTokenCacheRecord | null => {
  if (!isPlainObject(value)) return null;
  const token = typeof value.token === "string" ? value.token.trim() : "";
  const expiresAt = Number(value.expiresAt);
  if (!token || token.length > MAX_AGENT_TOKEN_LENGTH) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return { token, expiresAt };
};

const calculateTokenExpiry = (expiresIn: number): number => {
  const seconds = Number.isFinite(expiresIn) ? Math.max(0, expiresIn) : 0;
  return Date.now() + seconds * 1000;
};

const cacheAgentTokenSecurely = async (
  token: string,
  expiresIn: number,
): Promise<void> => {
  const record = normalizeAgentTokenCacheRecord({
    token,
    expiresAt: calculateTokenExpiry(expiresIn),
  });
  if (!record) return;
  inMemoryAgentTokenCache = record;
  if (typeof window === "undefined") return;
  const bridge = window.electronAPI;
  if (!bridge?.writeAgentTokenCache) return;
  try {
    const writeResult = await bridge.writeAgentTokenCache(
      record.token,
      record.expiresAt,
    );
    if (!writeResult?.ok) {
      console.warn(
        "[License] Failed to persist secure agent token cache:",
        writeResult?.error || "write failed",
      );
    }
  } catch (error) {
    console.warn("[License] Failed to persist secure agent token cache:", error);
  }
};

const readAgentTokenCacheRecord = async (): Promise<AgentTokenCacheRecord | null> => {
  if (inMemoryAgentTokenCache) {
    return inMemoryAgentTokenCache;
  }
  if (typeof window === "undefined") return null;
  const bridge = window.electronAPI;
  if (!bridge?.readAgentTokenCache) return null;
  try {
    const readResult = await bridge.readAgentTokenCache();
    if (!readResult?.exists) return null;
    const record = normalizeAgentTokenCacheRecord({
      token: readResult.token,
      expiresAt: readResult.expiresAt,
    });
    if (!record) return null;
    inMemoryAgentTokenCache = record;
    return record;
  } catch (error) {
    console.warn("[License] Failed to read secure agent token cache:", error);
    return null;
  }
};

export async function fetchAgentToken(
  deviceId: string,
  licenseId: string,
): Promise<AgentTokenResult> {
  const origin = getLicenseServerOrigin();
  try {
    const response = await fetch(`${origin}/api/agent-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, license_id: licenseId }),
    });
    const payload = (await response.json().catch(() => ({}))) as AgentTokenResult;
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        error: payload.error || `License server returned ${response.status}`,
      };
    }
    if (payload.token) {
      await cacheAgentTokenSecurely(payload.token, payload.expires_in || 3600);
    }
    return payload;
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message || "Failed to contact license server",
    };
  }
}

export async function getCachedAgentToken(): Promise<{ token: string; expired: boolean } | null> {
  const record = await readAgentTokenCacheRecord();
  if (!record) return null;
  return { token: record.token, expired: Date.now() >= record.expiresAt };
}

export async function clearCachedAgentToken(): Promise<void> {
  inMemoryAgentTokenCache = null;
  if (typeof window === "undefined") return;
  const bridge = window.electronAPI;
  if (!bridge?.clearAgentTokenCache) return;
  try {
    const clearResult = await bridge.clearAgentTokenCache();
    if (!clearResult?.ok) {
      console.warn(
        "[License] Failed to clear secure agent token cache:",
        clearResult?.error || "clear failed",
      );
    }
  } catch (error) {
    console.warn("[License] Failed to clear secure agent token cache:", error);
  }
}

export async function isAgentTokenNearExpiry(
  thresholdMs = 5 * 60 * 1000,
): Promise<boolean> {
  const record = await readAgentTokenCacheRecord();
  if (!record) return true;
  return Date.now() >= record.expiresAt - thresholdMs;
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const valueKeys = Object.keys(value);
  if (valueKeys.length !== keys.length) return false;
  const keySet = new Set(valueKeys);
  return keys.every((key) => keySet.has(key));
};

const base64ToBytes = (value: string): Uint8Array | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  try {
    if (typeof atob === "function") {
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
  } catch {
    return null;
  }
  return null;
};

const canonicalizeJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`)
    .join(",")}}`;
};

const parseIsoTimestamp = (value: string): Date | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const parseExpiryInstant = (value: string): Date | null => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T23:59:59.999`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return parseIsoTimestamp(value);
};

const validateLicensePayload = (payload: unknown): { ok: boolean; payload?: LicenseData; error?: string } => {
  if (!isPlainObject(payload)) {
    return { ok: false, error: "Invalid license payload" };
  }
  if (!hasExactKeys(payload, LICENSE_PAYLOAD_KEYS)) {
    return { ok: false, error: "Invalid license payload" };
  }
  const licenseId = payload.license_id;
  if (typeof licenseId !== "string" || !LICENSE_ID_PATTERN.test(licenseId)) {
    return { ok: false, error: "Invalid license id" };
  }
  const deviceId = payload.device_id;
  if (typeof deviceId !== "string" || !deviceId.trim()) {
    return { ok: false, error: "Invalid license device" };
  }
  const licenseType = payload.license_type;
  if (licenseType !== "monthly" && licenseType !== "yearly" && licenseType !== "perpetual") {
    return { ok: false, error: "Invalid license type" };
  }
  const expiresAt = payload.expires_at;
  if (expiresAt !== null && typeof expiresAt !== "string") {
    return { ok: false, error: "Invalid license expiration" };
  }
  if (licenseType === "perpetual" && expiresAt !== null) {
    return { ok: false, error: "Perpetual licenses must not expire" };
  }
  if (licenseType !== "perpetual" && (!expiresAt || typeof expiresAt !== "string")) {
    return { ok: false, error: "Expiring licenses must include expires_at" };
  }
  if (expiresAt && !parseExpiryInstant(expiresAt)) {
    return { ok: false, error: "Invalid expires_at" };
  }
  const issuedAt = payload.issued_at;
  if (typeof issuedAt !== "string" || !parseIsoTimestamp(issuedAt)) {
    return { ok: false, error: "Invalid issued_at" };
  }
  const normalizedPayload: LicenseData = {
    license_id: licenseId,
    device_id: deviceId,
    license_type: licenseType,
    expires_at: expiresAt ?? null,
    issued_at: issuedAt,
  };
  return { ok: true, payload: normalizedPayload };
};

const verifySignedLicense = (signed: unknown): { ok: boolean; payload?: LicenseData; error?: string } => {
  if (!isPlainObject(signed)) {
    return { ok: false, error: "Invalid license file" };
  }
  if (!hasExactKeys(signed, LICENSE_FILE_KEYS)) {
    return { ok: false, error: "Invalid license file" };
  }
  const signature = signed.signature;
  if (typeof signature !== "string" || !signature.trim()) {
    return { ok: false, error: "Missing license signature" };
  }
  const payloadResult = validateLicensePayload(signed.payload);
  if (!payloadResult.ok || !payloadResult.payload) {
    return payloadResult;
  }
  const publicKeyBytes = base64ToBytes(LICENSE_PUBLIC_KEY_BASE64);
  if (!publicKeyBytes || publicKeyBytes.length !== 32) {
    return { ok: false, error: "License public key not configured" };
  }
  const signatureBytes = base64ToBytes(signature);
  if (!signatureBytes || signatureBytes.length !== 64) {
    return { ok: false, error: "Invalid license signature" };
  }
  const canonicalPayload = canonicalizeJson(payloadResult.payload);
  const message = new TextEncoder().encode(canonicalPayload);
  const verified = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
  if (!verified) {
    return { ok: false, error: "Invalid license signature" };
  }
  return { ok: true, payload: payloadResult.payload };
};

export interface LicenseReadResult {
  data: LicenseData | null;
  error?: string;
}

export function getLicenseStateFromData(
  licenseData: LicenseData | null
): LicenseState {
  if (!licenseData) return "FREE";
  if (!licenseData.license_id || !licenseData.device_id) return "ERROR";
  if (!licenseData.issued_at) return "ERROR";
  if (!licenseData.license_type) return "ERROR";

  if (licenseData.license_type === "perpetual") {
    return licenseData.expires_at === null ? "ACTIVE" : "ERROR";
  }

  if (!licenseData.expires_at) {
    return "ERROR";
  }

  const expiresAt = parseExpiryInstant(licenseData.expires_at);
  if (!expiresAt) return "ERROR";
  const now = new Date();
  return now <= expiresAt ? "ACTIVE" : "EXPIRED";
}

const readSignedLicenseFile = async (): Promise<{ signed: SignedLicense | null; error?: string }> => {
  if (typeof window === "undefined" || !window.electronAPI?.readLicenseFile) {
    return { signed: null };
  }
  try {
    const response = await window.electronAPI.readLicenseFile();
    if (!response.exists || !response.contents) {
      return { signed: null };
    }
    const parsed = JSON.parse(response.contents) as SignedLicense;
    return { signed: parsed };
  } catch (error) {
    console.error("[License] Failed to parse license file:", error);
    return { signed: null, error: "Invalid license file" };
  }
};

export async function loadLicenseFromDisk(): Promise<LicenseState> {
  if (typeof window === "undefined" || !window.electronAPI?.readLicenseFile) {
    setAppLicenseState("ACTIVE");
    return "ACTIVE";
  }

  try {
    const { signed, error } = await readSignedLicenseFile();
    if (!signed) {
      if (error) {
        setAppLicenseState("ERROR");
        return "ERROR";
      }
      setAppLicenseState("FREE");
      return "FREE";
    }

    const verification = verifySignedLicense(signed);
    if (!verification.ok || !verification.payload) {
      setAppLicenseState("ERROR");
      return "ERROR";
    }

    const deviceId = await getOrCreateDeviceId();
    if (verification.payload.device_id !== deviceId) {
      setAppLicenseState("ERROR");
      return "ERROR";
    }

    const nextState = getLicenseStateFromData(verification.payload);
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

  const { signed, error } = await readSignedLicenseFile();
  if (!signed) {
    return { data: null, error };
  }

  const verification = verifySignedLicense(signed);
  if (!verification.ok || !verification.payload) {
    return { data: null, error: verification.error || "Invalid license file" };
  }

  const deviceId = await getOrCreateDeviceId();
  if (verification.payload.device_id !== deviceId) {
    return { data: null, error: "License bound to another device" };
  }

  return { data: verification.payload };
}

export async function activateLicense(signedLicense: SignedLicense): Promise<void> {
  if (typeof window === "undefined" || !window.electronAPI?.writeLicenseFile) {
    return;
  }

  const verification = verifySignedLicense(signedLicense);
  if (!verification.ok || !verification.payload) {
    throw new Error(verification.error || "Invalid license file");
  }

  const deviceId = await getOrCreateDeviceId();
  if (verification.payload.device_id !== deviceId) {
    throw new Error("License bound to another device");
  }

  await window.electronAPI.writeLicenseFile(signedLicense);
}

export async function requestActivationFromServer(
  _deviceId: string
): Promise<SignedLicense> {
  throw new Error("Activation must be completed on the Ordinay website.");
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

// ── Referral & Rewards Types ──────────────────────────────────────────

export type ReferralRewardType =
  | "percentage"
  | "fixed_amount"
  | "extra_days"
  | "extra_device"
  | "extended_support"
  | "feature_unlock";

export type ReferralRewardStatus = "unused" | "applied" | "expired";

export interface ReferralReward {
  id: string;
  reward_type: ReferralRewardType;
  reward_value: number;
  status: ReferralRewardStatus;
  expires_at: string | null;
  created_at: string;
  applies_to: string | null;
  referrer_plan: string | null;
}

export interface ReferralDashboard {
  referral_link: string | null;
  referral_code: string | null;
  total_referrals: number;
  rewards: ReferralReward[];
}

export type ReferralDashboardResult = {
  ok: boolean;
  data?: ReferralDashboard;
  error?: string;
};

export async function fetchReferralDashboard(
  deviceId: string,
): Promise<ReferralDashboardResult> {
  const origin = getLicenseServerOrigin();
  const endpoint = `${origin}/api/referrals/dashboard?device_id=${encodeURIComponent(deviceId)}`;
  try {
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return { ok: false, error: "Referral data unavailable" };
    }
    const payload = await response.json();
    return {
      ok: true,
      data: {
        referral_link: payload.referral_link ?? null,
        referral_code: payload.referral_code ?? null,
        total_referrals: payload.total_referrals ?? 0,
        rewards: Array.isArray(payload.rewards) ? payload.rewards : [],
      },
    };
  } catch (error) {
    console.warn("[Referral] Failed to fetch dashboard:", error);
    return { ok: false, error: "Referral data unavailable" };
  }
}

export type PendingRewardsResult = {
  ok: boolean;
  rewards: ReferralReward[];
  error?: string;
};

export async function fetchPendingReferralRewards(
  deviceId: string,
): Promise<PendingRewardsResult> {
  const origin = getLicenseServerOrigin();
  const endpoint = `${origin}/api/referrals/pending-rewards?device_id=${encodeURIComponent(deviceId)}`;
  try {
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      return { ok: false, rewards: [], error: "Pending rewards unavailable" };
    }
    const payload = await response.json();
    return {
      ok: true,
      rewards: Array.isArray(payload.rewards) ? payload.rewards : [],
    };
  } catch (error) {
    console.warn("[Referral] Failed to fetch pending rewards:", error);
    return { ok: false, rewards: [], error: "Pending rewards unavailable" };
  }
}

export async function verifyLicenseWithServer(
  _deviceId: string,
  cachedData: LicenseData | null
): Promise<LicenseReadResult> {
  try {
    const deviceId = _deviceId;
    if (!deviceId) {
      return { data: cachedData };
    }
    const status = await fetchActivationStatus(deviceId);
    if (!status.ok) {
      return { data: cachedData, error: status.error || undefined };
    }
    if (status.status === "paid" && status.license) {
      return { data: status.license.payload };
    }
    if (status.status === "blocked") {
      return { data: null, error: "Activation blocked" };
    }
    if (status.status === "expired") {
      return { data: null, error: "Activation expired" };
    }
    return { data: cachedData };
  } catch {
    return { data: cachedData };
  }
}

export const FREE_PLAN_LIMITS = {
  clients: 3,
  dossiers: 3,
  lawsuitsPerDossier: 1,
  activeTasks: 10,
};

export type FreeLimitResult = {
  allowed: boolean;
  limit?: number;
  current?: number;
  label?: string;
  message?: string;
};

type FreeLimitEntity = {
  status?: string;
  dossierId?: string | number;
  dossier_id?: string | number;
};

const isFreePlanState = (state: LicenseState) =>
  state === "FREE" || state === "EXPIRED" || state === "UNACTIVATED";

const isTaskActive = (status?: string | null) =>
  !["Done", "Cancelled"].includes(status || "");

export function checkFreePlanLimit({
  licenseState,
  clients,
  dossiers,
  lawsuits,
  tasks,
  entityType,
  entityData,
}: {
  licenseState: LicenseState;
  clients: Array<FreeLimitEntity>;
  dossiers: Array<FreeLimitEntity>;
  lawsuits: Array<FreeLimitEntity>;
  tasks: Array<FreeLimitEntity>;
  entityType: "client" | "dossier" | "lawsuit" | "task";
  entityData?: FreeLimitEntity;
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

  if (entityType === "lawsuit") {
    const dossierId = entityData?.dossierId ?? entityData?.dossier_id ?? null;
    if (dossierId) {
      const current = lawsuits.filter((item) => String(item.dossierId) === String(dossierId)).length;
      if (current >= FREE_PLAN_LIMITS.lawsuitsPerDossier) {
        return {
          allowed: false,
          limit: FREE_PLAN_LIMITS.lawsuitsPerDossier,
          current,
          label: "Lawsuits per dossier",
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
