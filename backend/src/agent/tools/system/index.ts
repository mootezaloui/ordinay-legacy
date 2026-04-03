import type { ToolDefinition } from "../tool.types";
import { suggestActionTool } from "./suggestAction.tool";

export function getSystemTools(): ToolDefinition[] {
  return [suggestActionTool];
}

export { suggestActionTool };

