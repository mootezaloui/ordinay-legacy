import { apiClient } from './client';

export interface AIProviderConfig {
  configured: boolean;
  source?: 'database' | 'native_fallback';
  persisted?: boolean;
  provider_display?: 'openai' | 'custom' | 'ollama' | 'anthropic' | 'gemini';
  provider_preset?: 'openrouter' | 'groq' | 'openai' | 'manual';
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

export interface OllamaStatusResult {
  base_url: string;
  installed: boolean | null;
  installation_relevant?: boolean;
  running: boolean;
  models: string[];
  model_count: number;
  status: 'not_installed' | 'not_running' | 'running_no_models' | 'ready' | 'api_mismatch';
  error?: string;
}

export interface OllamaStartResult {
  ok: boolean;
  launched?: 'desktop' | 'app' | 'serve';
  message?: string;
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

export async function getOllamaStatus(baseUrl?: string): Promise<OllamaStatusResult> {
  const query = baseUrl && baseUrl.trim().length > 0
    ? `?base_url=${encodeURIComponent(baseUrl.trim())}`
    : '';
  return apiClient.get<OllamaStatusResult>(`/settings/ai-provider/ollama-status${query}`);
}

export async function startOllamaRuntime(): Promise<OllamaStartResult> {
  return apiClient.post<OllamaStartResult>('/settings/ai-provider/ollama/start', {});
}
