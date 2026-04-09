/**
 * API Client
 *
 * Centralized client for backend API calls.
 *
 * Transport strategy:
 *   - Electron desktop: uses IPC -> main process -> named pipe -> Express backend.
 *     No HTTP fetch to localhost, no TCP port, no Windows Firewall prompt.
 *   - Web / fallback: uses HTTP fetch to the configured API base URL.
 */

import { getApiBase, isElectron } from '../../lib/apiConfig';
import { getAppLicenseState } from '../licenseService';
import { emitEntityMutationFromApiResponse } from '../../core/mutationSync';

const isLicenseLocked = () =>
  ["ACTIVATING", "ERROR"].includes(getAppLicenseState());

// ---------------------------------------------------------------
// IPC transport (Electron desktop)
// ---------------------------------------------------------------

async function ipcRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const result = await window.electronAPI!.apiRequest(method, path, body);

  if (!result || typeof result.status !== "number") {
    throw new Error("IPC api-request returned an invalid response");
  }

  if (result.status >= 400) {
    const detail =
      typeof result.data === "object" && (result.data?.error || result.data?.message)
        ? (result.data.error || result.data.message)
        : typeof result.data === "string"
          ? result.data
          : "";
    const message = `API error ${result.status}${detail ? ": " + detail : ""}`;
    console.error(`[API-IPC] FAILED: ${message}`);
    throw new Error(message);
  }

  // 204 No Content (e.g. DELETE)
  if (result.status === 204 || result.data === null || result.data === "") {
    return {} as T;
  }

  return result.data as T;
}

// ---------------------------------------------------------------
// HTTP fetch transport (web / fallback)
// ---------------------------------------------------------------

async function httpRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBase = getApiBase();
  const url = `${apiBase}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    console.error(`[API-HTTP] FAILED: ${res.status} ${res.statusText} for ${url}`);
    let detail = "";
    try {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          detail = json.message || text;
        } catch {
          detail = text;
        }
      }
    } catch {
      // ignore parse errors
    }
    const message = `API error ${res.status}${detail ? ": " + detail : ""}`;
    throw new Error(message);
  }

  // Handle 204 No Content responses (e.g., DELETE operations)
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return {} as T;
  }

  return res.json();
}

// ---------------------------------------------------------------
// Unified request dispatcher
// ---------------------------------------------------------------

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (isElectron() && window.electronAPI?.apiRequest) {
    return ipcRequest<T>(method, path, body);
  }
  // Fallback to HTTP (web dev, or Electron without IPC support)
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return httpRequest<T>(path, init);
}

// ---------------------------------------------------------------
// Public API (same shape as before - drop-in replacement)
// ---------------------------------------------------------------

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) =>
    isLicenseLocked()
      ? Promise.reject(new Error("License inactive"))
      : request<T>("POST", path, body).then((response) => {
          emitEntityMutationFromApiResponse({ method: "POST", path, response, requestBody: body });
          return response;
        }),
  put: <T>(path: string, body: unknown) =>
    isLicenseLocked()
      ? Promise.reject(new Error("License inactive"))
      : request<T>("PUT", path, body).then((response) => {
          emitEntityMutationFromApiResponse({ method: "PUT", path, response, requestBody: body });
          return response;
        }),
  patch: <T>(path: string, body: unknown) =>
    isLicenseLocked()
      ? Promise.reject(new Error("License inactive"))
      : request<T>("PATCH", path, body).then((response) => {
          emitEntityMutationFromApiResponse({ method: "PATCH", path, response, requestBody: body });
          return response;
        }),
  delete: <T>(path: string, body?: unknown) =>
    isLicenseLocked()
      ? Promise.reject(new Error("License inactive"))
      : request<T>("DELETE", path, body).then((response) => {
          emitEntityMutationFromApiResponse({ method: "DELETE", path, response, requestBody: body });
          return response;
        }),
};
