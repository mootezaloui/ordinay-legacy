import type { ToolDefinition } from "../tool.types";
import { proposeCreateTool } from "./proposeCreate.tool";
import { proposeUpdateTool } from "./proposeUpdate.tool";
import { proposeDeleteTool } from "./proposeDelete.tool";

export function getPlanTools(): ToolDefinition[] {
  return [proposeCreateTool, proposeUpdateTool, proposeDeleteTool];
}

export {
  proposeCreateTool,
  proposeUpdateTool,
  proposeDeleteTool,
};
