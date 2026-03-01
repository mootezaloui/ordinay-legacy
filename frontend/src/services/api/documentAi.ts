import { apiClient } from './client';

export interface DocumentAiSettings {
  document_ai_enabled: boolean;
  document_ai_provider: string;
  document_ai_redaction_mode: 'none' | 'basic' | 'strict' | string;
  document_ai_retain_artifacts_days: number;
  document_output_format_preference: 'auto' | 'pdf' | 'docx' | 'xlsx' | 'html';
}

export interface DocumentAiAuditLog {
  id: number;
  document_id: number | null;
  provider: string;
  policy_mode: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export async function getDocumentAiSettings(): Promise<DocumentAiSettings> {
  const server = await apiClient.get<DocumentAiSettings>('/documents/ai/settings');
  return {
    ...server,
    document_ai_enabled: false,
    document_ai_provider: 'local',
    document_output_format_preference:
      server?.document_output_format_preference || 'auto',
  };
}

export async function updateDocumentAiSettings(
  patch: Partial<DocumentAiSettings>,
): Promise<DocumentAiSettings> {
  const nextPatch: Partial<DocumentAiSettings> = {
    ...patch,
    document_ai_enabled: false,
    document_ai_provider: 'local',
  };
  const server = await apiClient.put<DocumentAiSettings>('/documents/ai/settings', nextPatch);
  return {
    ...server,
    document_ai_enabled: false,
    document_ai_provider: 'local',
    document_output_format_preference:
      server?.document_output_format_preference || 'auto',
  };
}

export async function listDocumentAiAuditLogs(limit = 20): Promise<DocumentAiAuditLog[]> {
  const res = await apiClient.get<{ logs: DocumentAiAuditLog[] }>(
    `/documents/ai/audit?limit=${encodeURIComponent(String(limit))}`,
  );
  return res.logs || [];
}
