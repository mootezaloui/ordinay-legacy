/**
 * API Client
 * 
 * Centralized HTTP client for backend API calls.
 * Uses dynamic configuration for Electron desktop app.
 */

import { getApiBase } from '../../lib/apiConfig';
import { getAppLicenseState } from '../licenseService';

const isLicenseLocked = () =>
  ["ACTIVATING", "ERROR"].includes(getAppLicenseState());

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBase = getApiBase();
  const url = `${apiBase}${path}`;
  console.log(`[API] ${init?.method || 'GET'} ${url}`);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    console.error(`[API] FAILED: ${res.status} ${res.statusText} for ${url}`);
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

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    isLicenseLocked()
      ? Promise.reject(new Error("License inactive"))
      : request<T>(path, {
          method: "POST",
          body: JSON.stringify(body),
        }),
  put: <T>(path: string, body: unknown) =>
    isLicenseLocked()
      ? Promise.reject(new Error("License inactive"))
      : request<T>(path, {
          method: "PUT",
          body: JSON.stringify(body),
        }),
  delete: <T>(path: string) =>
    isLicenseLocked()
      ? Promise.reject(new Error("License inactive"))
      : request<T>(path, {
          method: "DELETE",
        }),
};
