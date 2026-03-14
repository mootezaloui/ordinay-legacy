export interface OutputValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateAssistantOutput(text: string): OutputValidationResult {
  const warnings: string[] = [];
  if (typeof text !== "string" || text.trim().length === 0) {
    warnings.push("Assistant output is empty.");
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
