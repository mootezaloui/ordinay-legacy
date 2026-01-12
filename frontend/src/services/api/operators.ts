import { apiClient } from "./client";

export interface Operator {
  id: number;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  email?: string;
  phone?: string;
  specialization?: string;
  bar_number?: string;
  office?: string;
  bio?: string;
  updated_at?: string;
}

export interface OperatorUpdatePayload {
  name?: string;
  email?: string;
  phone?: string;
  specialization?: string;
  bar_number?: string;
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
