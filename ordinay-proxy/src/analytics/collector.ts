import { insertAnalytics } from "./store";
import type { AnalyticsRow } from "../types";

/**
 * Extracts metadata from the proxied request/response without reading message content.
 */
export function collectAnalytics(params: {
  licenseHash: string;
  deviceHash: string;
  tier: string;
  appVersion: string;
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown> | null;
  backend: string;
  model: string;
  latencyMs: number;
  isError: boolean;
  errorType?: string;
}): void {
  const messages = Array.isArray(params.requestBody.messages) ? params.requestBody.messages : [];
  const tools = Array.isArray(params.requestBody.tools) ? params.requestBody.tools : [];

  const usage = params.responseBody?.usage as Record<string, unknown> | undefined;
  const promptTokens = Number(usage?.prompt_tokens ?? 0);
  const complTokens = Number(usage?.completion_tokens ?? 0);

  const choices = Array.isArray(params.responseBody?.choices) ? params.responseBody!.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const finishReason = String(firstChoice?.finish_reason ?? "unknown");
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const hasToolCalls = Array.isArray(message?.tool_calls) && message!.tool_calls.length > 0;

  const row: AnalyticsRow = {
    timestamp: new Date().toISOString(),
    license_hash: params.licenseHash,
    device_hash: params.deviceHash,
    tier: params.tier,
    app_version: params.appVersion,
    tool_count: tools.length,
    message_count: messages.length,
    has_tools: hasToolCalls ? 1 : 0,
    prompt_tokens: promptTokens,
    compl_tokens: complTokens,
    total_tokens: promptTokens + complTokens,
    latency_ms: params.latencyMs,
    backend: params.backend,
    model: params.model,
    finish_reason: finishReason,
    is_error: params.isError ? 1 : 0,
    error_type: params.errorType ?? null,
  };

  insertAnalytics(row);
}
