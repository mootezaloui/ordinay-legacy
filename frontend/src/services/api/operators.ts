import { apiClient } from "./client";
import { getApiBase } from "../../lib/apiConfig";

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
  bar_id?: string;
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
  bar_id?: string;
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

async function requestDirect<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
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
  return requestDirect<Operator>(`/operators/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}
