import { apiClient } from "./client";

export async function fetchEntityCounts() {
  // Adjust endpoints as needed to match your backend API
  const [dossiers, clients, tasks, sessions, documents] = await Promise.all([
    apiClient.get<{ count: number }>("/dossiers/count"),
    apiClient.get<{ count: number }>("/clients/count"),
    apiClient.get<{ count: number }>("/tasks/count"),
    apiClient.get<{ count: number }>("/sessions/count"),
    apiClient.get<{ count: number }>("/documents/count"),
  ]);
  return {
    dossiers: dossiers.count,
    clients: clients.count,
    tasks: tasks.count,
    sessions: sessions.count,
    documents: documents.count,
  };
}
