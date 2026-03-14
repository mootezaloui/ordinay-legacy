import { ToolCategory } from "./tool.types";

const READ_HINTS = ["get", "list", "search", "find", "fetch", "read"];
const WRITE_HINTS = ["create", "update", "delete", "set", "save", "add", "edit"];
const PLAN_HINTS = ["plan", "draft", "prepare", "propose"];
const EXECUTE_HINTS = ["execute", "commit", "confirm", "apply", "run"];
const EXTERNAL_HINTS = ["research", "web", "external", "api", "scrape"];

export function inferToolCategory(toolName: string): ToolCategory {
  const normalized = String(toolName ?? "").trim().toLowerCase();
  if (!normalized) {
    return ToolCategory.READ;
  }

  if (matchesHint(normalized, EXTERNAL_HINTS)) {
    return ToolCategory.EXTERNAL;
  }
  if (matchesHint(normalized, EXECUTE_HINTS)) {
    return ToolCategory.EXECUTE;
  }
  if (matchesHint(normalized, PLAN_HINTS)) {
    return ToolCategory.PLAN;
  }
  if (matchesHint(normalized, WRITE_HINTS)) {
    return ToolCategory.WRITE;
  }
  if (matchesHint(normalized, READ_HINTS)) {
    return ToolCategory.READ;
  }

  return ToolCategory.READ;
}

export function inferRiskLevel(category: ToolCategory): "low" | "medium" | "high" {
  switch (category) {
    case ToolCategory.READ:
      return "low";
    case ToolCategory.WRITE:
      return "medium";
    case ToolCategory.EXECUTE:
      return "high";
    case ToolCategory.EXTERNAL:
      return "medium";
    case ToolCategory.PLAN:
      return "medium";
    default:
      return "medium";
  }
}

export function inferSideEffects(category: ToolCategory): boolean {
  switch (category) {
    case ToolCategory.WRITE:
    case ToolCategory.EXECUTE:
      return true;
    case ToolCategory.READ:
    case ToolCategory.PLAN:
    case ToolCategory.EXTERNAL:
    default:
      return false;
  }
}

function matchesHint(value: string, hints: string[]): boolean {
  return hints.some((hint) => value.includes(hint));
}
