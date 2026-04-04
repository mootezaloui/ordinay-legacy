import { apiClient } from './client';

export interface AIProviderConfig {
  configured: boolean;
  provider_type?: string;
  base_url?: string;
  api_key_masked?: string;
  model?: string;
}

export interface AIProviderSavePayload {
  provider_type: string;
  base_url: string;
  api_key: string;
  model: string;
}

export interface AIProviderTestResult {
  ok: boolean;
  latency_ms?: number;
  error?: string;
}

export async function getAIProviderConfig(): Promise<AIProviderConfig> {
  return apiClient.get<AIProviderConfig>('/settings/ai-provider');
}

export async function saveAIProviderConfig(
  payload: AIProviderSavePayload,
): Promise<{ ok: boolean }> {
  return apiClient.put<{ ok: boolean }>('/settings/ai-provider', payload);
}

export async function testAIProviderConfig(
  payload?: AIProviderSavePayload,
): Promise<AIProviderTestResult> {
  return apiClient.post<AIProviderTestResult>(
    '/settings/ai-provider/test',
    payload || {},
  );
}
