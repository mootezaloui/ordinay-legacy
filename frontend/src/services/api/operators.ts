import { apiClient } from "./client";
import { getApiBase, isElectron } from "../../lib/apiConfig";

export interface Operator {
  id: number;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  title?: string;
  office_name?: string;
  office_address?: string;
  email?: string;
  phone?: string;
  fax?: string;
  mobile?: string;
  specialization?: string;
  bar_number?: string;
  vpa?: string;
  office?: string;
  bio?: string;
  updated_at?: string;
}

export interface OperatorUpdatePayload {
  name?: string;
  title?: string;
  office_name?: string;
  office_address?: string;
  email?: string;
  phone?: string;
  fax?: string;
  mobile?: string;
  specialization?: string;
  bar_number?: string;
  vpa?: string;
  office?: string;
  bio?: string;
}

/**
 * Fetch the current operator from the backend.
 * For MVP, this always returns the single active operator.
 */
export async function getCurrentOperator(): Promise<Operator> {
  return apiClient.get<Operator>("/operators/current");
}

/**
 * List all operators.
 */
export async function listOperators(): Promise<Operator[]> {
  return apiClient.get<Operator[]>("/operators");
}

/**
 * Get operator by id.
 */
export async function getOperatorById(id: number): Promise<Operator> {
  return apiClient.get<Operator>(`/operators/${id}`);
}

/**
 * Update operator profile.
 * This is identity management, NOT authentication.
 */
export async function updateOperator(
  id: number,
  updates: OperatorUpdatePayload
): Promise<Operator> {
  return apiClient.put<Operator>(`/operators/${id}`, updates);
}

/**
 * Direct request that bypasses license gating (for initial setup).
 * Uses IPC when running in Electron, HTTP fetch otherwise.
 */
async function requestDirect<T>(method: string, path: string, body?: unknown): Promise<T> {
  // IPC transport (Electron)
  if (isElectron() && window.electronAPI?.apiRequest) {
    const result = await window.electronAPI.apiRequest(method, path, body);
    if (!result || typeof result.status !== "number") {
      throw new Error("IPC api-request returned an invalid response");
    }
    if (result.status >= 400) {
      const detail =
        typeof result.data === "object" && (result.data as Record<string, unknown>)?.message
          ? (result.data as Record<string, unknown>).message
          : "";
      throw new Error(`API error ${result.status}${detail ? ": " + detail : ""}`);
    }
    if (result.status === 204 || result.data === null) return {} as T;
    return result.data as T;
  }

  // HTTP fallback
  const url = `${getApiBase()}${path}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
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

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }

  return res.json();
}

/**
 * Update operator profile during setup.
 * Bypasses license gating to allow initial workspace setup.
 */
export async function updateOperatorForSetup(
  id: number,
  updates: OperatorUpdatePayload
): Promise<Operator> {
  return requestDirect<Operator>("PUT", `/operators/${id}`, updates);
}
