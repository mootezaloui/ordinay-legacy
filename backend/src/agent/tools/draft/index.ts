import type { ToolDefinition } from "../tool.types";
import { generateDraftTool } from "./generateDraft.tool";

export function getDraftTools(): ToolDefinition[] {
  return [generateDraftTool];
}

export { generateDraftTool };
