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

export interface ProviderModelsPayload {
  provider_type: string;
  base_url?: string;
  api_key?: string;
}

export interface ProviderModelsResult {
  ok: boolean;
  models: Array<{
    id: string;
    source?: 'cloud' | 'local';
    owned_by?: string;
    supports_tools?: boolean;
    capability_source?: string;
    checked_at?: string;
  }>;
  source?: 'cloud' | 'local' | 'ollama' | 'anthropic' | 'gemini';
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
  launched?: 'desktop' | 'app' | 'serve' | 'already_running';
  message?: string;
  error?: string;
  ready?: boolean;
  models?: string[];
  elapsed_ms?: number;
}

export interface OllamaModelsResult {
  ok: boolean;
  models: string[];
  error?: string;
}

export interface OllamaCatalogResult {
  ok: boolean;
  models: Array<{
    name: string;
    source: 'local' | 'cloud';
    downloadable: boolean;
    installed: boolean;
    size_label?: string | null;
    context_length?: string | null;
    input_modalities?: string | null;
    capabilities?: string[];
    supports_tools?: boolean | null;
    capability_source?: string;
    compatibility?: {
      level: 'good' | 'limited' | 'unlikely' | 'unknown' | 'cloud';
      message: string;
      estimated_min_ram_gb: number | null;
      estimated_min_vram_gb: number | null;
      param_b: number | null;
    };
  }>;
  hardware?: {
    ram_gb: number;
    cpu_cores: number;
    gpu_max_vram_gb: number;
  };
  error?: string;
}

export interface OllamaPullStartResult {
  ok: boolean;
  job_id?: string;
  model?: string;
  error?: string;
}

export interface OllamaPullJob {
  id: string;
  model: string;
  base_url: string;
  status: string;
  progress: number;
  total: number;
  completed: number;
  digest?: string;
  done: boolean;
  error?: string | null;
  started_at: number;
  updated_at: number;
  ended_at?: number | null;
}

export interface OllamaPullJobResult {
  ok: boolean;
  job?: OllamaPullJob;
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

export async function getProviderModels(
  payload: ProviderModelsPayload,
): Promise<ProviderModelsResult> {
  return apiClient.post<ProviderModelsResult>(
    '/settings/ai-provider/models',
    payload,
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

export async function getOllamaModels(baseUrl?: string): Promise<OllamaModelsResult> {
  const query = baseUrl && baseUrl.trim().length > 0
    ? `?base_url=${encodeURIComponent(baseUrl.trim())}`
    : '';
  return apiClient.get<OllamaModelsResult>(`/settings/ai-provider/ollama/models${query}`);
}

export async function getOllamaCatalog(
  queryText = "",
  limit = 80,
  baseUrl?: string,
): Promise<OllamaCatalogResult> {
  const query = `?query=${encodeURIComponent(String(queryText || "").trim())}&limit=${Math.max(1, Math.min(limit, 200))}${baseUrl && baseUrl.trim() ? `&base_url=${encodeURIComponent(baseUrl.trim())}` : ""}`;
  return apiClient.get<OllamaCatalogResult>(`/settings/ai-provider/ollama/catalog${query}`);
}

export async function startOllamaPull(
  model: string,
  baseUrl?: string,
): Promise<OllamaPullStartResult> {
  return apiClient.post<OllamaPullStartResult>("/settings/ai-provider/ollama/pull", {
    model,
    base_url: baseUrl || "",
  });
}

export async function getOllamaPullJob(jobId: string): Promise<OllamaPullJobResult> {
  return apiClient.get<OllamaPullJobResult>(`/settings/ai-provider/ollama/pull/${encodeURIComponent(jobId)}`);
}

// ── Ordinay AI agent token ────────────────────────────────

export interface AgentTokenStatus {
  has_token: boolean;
  expired?: boolean;
  expires_in_ms?: number;
}

export async function pushAgentToken(
  token: string,
  expiresIn: number,
): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>('/settings/ai-provider/agent-token', {
    token,
    expires_in: expiresIn,
  });
}

export async function getAgentTokenStatus(): Promise<AgentTokenStatus> {
  return apiClient.get<AgentTokenStatus>('/settings/ai-provider/agent-token/status');
}

export async function clearAgentToken(): Promise<{ ok: boolean }> {
  return apiClient.delete<{ ok: boolean }>('/settings/ai-provider/agent-token');
}
