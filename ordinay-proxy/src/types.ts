export interface JwtPayload {
  lid: string;   // license_id
  did: string;   // device_id hash
  tier: "monthly" | "yearly" | "perpetual";
  iat: number;
  exp: number;
}

export interface ProxiedRequest {
  licenseHash: string;
  deviceHash: string;
  tier: JwtPayload["tier"];
  appVersion: string;
  body: Record<string, unknown>;
}

export interface AnalyticsRow {
  timestamp: string;
  license_hash: string;
  device_hash: string;
  tier: string;
  app_version: string;
  tool_count: number;
  message_count: number;
  has_tools: number;
  prompt_tokens: number;
  compl_tokens: number;
  total_tokens: number;
  latency_ms: number;
  backend: string;
  model: string;
  finish_reason: string;
  is_error: number;
  error_type: string | null;
}

export interface QuotaLimits {
  monthly: number;
  yearly: number;
  perpetual: number;
}
