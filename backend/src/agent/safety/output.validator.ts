export interface OutputValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateAssistantOutput(text: string): OutputValidationResult {
  const warnings: string[] = [];
  if (typeof text !== "string" || text.trim().length === 0) {
    warnings.push("Assistant output is empty.");
    return {
      valid: warnings.length === 0,
      warnings,
    };
  }

  const normalized = text.replace(/\r\n?/g, "\n");
  const trimmed = normalized.trim();

  if (/[{[]\s*"type"\s*:\s*"text_delta"/i.test(trimmed)) {
    warnings.push("Assistant output appears to contain stream event fragments.");
  }

  if (/[{[]\s*"tool"\s*:\s*"[^"]+"\s*,\s*"result"\s*:/i.test(trimmed)) {
    warnings.push("Assistant output appears to contain raw tool payload JSON.");
  }

  if (/\.\.\.\s*truncated\s*\.\.\./i.test(trimmed)) {
    warnings.push("Assistant output includes truncated payload marker text.");
  }

  const duplicatedLineWarnings = findRepeatedLineWarnings(trimmed);
  warnings.push(...duplicatedLineWarnings);

  if (hasMixedTimeLabels(trimmed)) {
    warnings.push("Assistant output mixes multiple time label styles.");
  }
  return {
    valid: warnings.length === 0,
    warnings,
  };
}

export function validateToolExecutionResultShape(
  result: unknown,
): OutputValidationResult {
  const warnings: string[] = [];

  if (!isRecord(result)) {
    warnings.push("Tool execution result is not an object.");
    return { valid: false, warnings };
  }

  if (typeof result.ok !== "boolean") {
    warnings.push('Tool execution result is missing boolean field "ok".');
  }

  if (result.ok === false) {
    const hasErrorMessage = typeof result.errorMessage === "string";
    if (!hasErrorMessage) {
      warnings.push("Failed tool result is missing an error message.");
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findRepeatedLineWarnings(text: string): string[] {
  const warnings: string[] = [];
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 24);

  if (lines.length === 0) {
    return warnings;
  }

  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  const repeated = [...counts.entries()].filter(([, count]) => count >= 3);
  if (repeated.length > 0) {
    warnings.push("Assistant output contains repeated lines that may indicate formatting duplication.");
  }

  return warnings;
}

function hasMixedTimeLabels(text: string): boolean {
  const hasUtc = /\bUTC\b/i.test(text);
  const hasGmt = /\bGMT\b/i.test(text);
  const hasZulu = /\b\d{2}:\d{2}:\d{2}Z\b/.test(text);
  const hasOffset = /\b[+-]\d{2}:\d{2}\b/.test(text);

  const variants = [hasUtc, hasGmt, hasZulu, hasOffset].filter(Boolean).length;
  return variants >= 2;
}
