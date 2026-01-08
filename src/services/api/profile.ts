import { apiClient } from "./client";

export interface ProfileStats {
  activeDossiers: number;
  totalClients: number;
  resolvedDossiers: number;
}

/**
 * Fetch profile statistics from the backend.
 * Returns real, computed values from the database.
 */
export async function getProfileStats(): Promise<ProfileStats> {
  return apiClient.get<ProfileStats>("/profile/stats");
}
