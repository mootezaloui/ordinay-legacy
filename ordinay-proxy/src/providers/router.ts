import {
  LLM_BASE_URL, LLM_API_KEY, LLM_MODEL,
  LLM_FAST_BASE_URL, LLM_FAST_API_KEY, LLM_FAST_MODEL,
  LLM_CAPABLE_BASE_URL, LLM_CAPABLE_API_KEY, LLM_CAPABLE_MODEL,
  ROUTE_COMPLEX_MSG_THRESHOLD, ROUTE_COMPLEX_TOOL_THRESHOLD,
} from "../config";

export interface BackendTarget {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

// ── Backend instances (built once at startup) ────────────

const primary: BackendTarget = {
  name: "primary",
  baseUrl: LLM_BASE_URL.replace(/\/+$/, ""),
  apiKey: LLM_API_KEY,
  model: LLM_MODEL,
};

const fast: BackendTarget | null =
  LLM_FAST_BASE_URL && LLM_FAST_API_KEY && LLM_FAST_MODEL
    ? { name: "fast", baseUrl: LLM_FAST_BASE_URL.replace(/\/+$/, ""), apiKey: LLM_FAST_API_KEY, model: LLM_FAST_MODEL }
    : null;

const capable: BackendTarget | null =
  LLM_CAPABLE_BASE_URL && LLM_CAPABLE_API_KEY && LLM_CAPABLE_MODEL
    ? { name: "capable", baseUrl: LLM_CAPABLE_BASE_URL.replace(/\/+$/, ""), apiKey: LLM_CAPABLE_API_KEY, model: LLM_CAPABLE_MODEL }
    : null;

// ── Request classification ───────────────────────────────

type RequestComplexity = "simple" | "complex";

function classifyRequest(body: Record<string, unknown>): RequestComplexity {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : [];

  if (messages.length >= ROUTE_COMPLEX_MSG_THRESHOLD || tools.length >= ROUTE_COMPLEX_TOOL_THRESHOLD) {
    return "complex";
  }
  return "simple";
}

// ── Backend selection ────────────────────────────────────

/**
 * Returns an ordered list of backends to try for this request.
 * First entry is the preferred backend based on request classification.
 * Remaining entries are fallbacks (tried on 5xx from upstream).
 *
 * If only primary is configured (no fast/capable env vars), returns [primary].
 */
export function selectBackends(body: Record<string, unknown>): BackendTarget[] {
  if (!fast && !capable) {
    return [primary];
  }

  const complexity = classifyRequest(body);
  const backends: BackendTarget[] = [];

  if (complexity === "simple" && fast) {
    backends.push(fast);
  } else if (complexity === "complex" && capable) {
    backends.push(capable);
  }

  // Primary always available as fallback
  if (!backends.some((b) => b.name === primary.name)) {
    backends.push(primary);
  }

  // Remaining configured backends as final fallback
  if (fast && !backends.some((b) => b.name === fast.name)) {
    backends.push(fast);
  }
  if (capable && !backends.some((b) => b.name === capable.name)) {
    backends.push(capable);
  }

  return backends;
}

/**
 * Single-backend selection (backward compat).
 * Used by code that doesn't need fallback.
 */
export function selectBackend(): BackendTarget {
  return primary;
}

/**
 * Returns all configured backends (for health probes).
 */
export function getAllBackends(): BackendTarget[] {
  const all: BackendTarget[] = [primary];
  if (fast) all.push(fast);
  if (capable) all.push(capable);
  return all;
}
