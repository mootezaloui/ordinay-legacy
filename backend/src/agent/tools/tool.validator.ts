function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateValueAgainstType(expectedType: string, value: unknown): boolean {
  switch (expectedType) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function validateSchema(schema: object | undefined, value: unknown): boolean {
  if (!schema) {
    return true;
  }

  if (!isRecord(schema)) {
    return true;
  }

  const expectedType =
    typeof schema.type === "string" ? schema.type.toLowerCase() : undefined;
  if (expectedType && !validateValueAgainstType(expectedType, value)) {
    return false;
  }

  if (!isRecord(value)) {
    return true;
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (typeof key !== "string") {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return false;
    }
  }

  return true;
}

export function validateToolInput(
  schema: object | undefined,
  input: unknown,
): boolean {
  return validateSchema(schema, input);
}

export function validateToolOutput(
  schema: object | undefined,
  output: unknown,
): boolean {
  return validateSchema(schema, output);
}
