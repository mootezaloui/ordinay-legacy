import type { ToolDefinition } from "./tool.types";
import { ToolRegistry } from "./tool.registry";

export function bootstrapTools(
  registry: ToolRegistry,
  tools: ToolDefinition[],
): void {
  for (const tool of tools) {
    registry.register(tool);
  }
  registry.freeze();
}
