import { apiClient } from "./client";

export interface DashboardSummary {
  totalClients: number;
  clientsDelta: number;
  activeDossiers: number;
  newDossiersThisWeek: number;
  pendingTasks: number;
  tasksDueToday: number;
  revenue: number;
  revenueDelta: number;
}

/**
  * Fetch aggregated dashboard metrics from the backend.
  * Values are raw numbers (no formatting) ready for UI presentation.
  */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiClient.get<DashboardSummary>("/dashboard/summary");
}
