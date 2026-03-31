export const MAX_TOOL_ITERATIONS = readPositiveInt(
  process.env.AGENT_MAX_TOOL_ITERATIONS,
  15,
);
export const LOOP_GUARD_TIMEOUT_MS = readPositiveInt(
  process.env.AGENT_LOOP_GUARD_TIMEOUT_MS,
  90_000,
);
export const ENABLE_STRICT_VALIDATION = true;
export const ENABLE_COMPAT_EVENTS = false;
export const ENABLE_AUDIT_LOGGING = true;

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
