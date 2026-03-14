import { ToolExecutionError } from "../errors";
import { ToolCategory, type ToolDefinition } from "./tool.types";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private frozen = false;

  register(tool: ToolDefinition): void {
    if (this.frozen) {
      throw new ToolExecutionError("Tool registry is frozen");
    }

    const name = this.normalizeName(tool.name);
    if (this.tools.has(name)) {
      throw new ToolExecutionError(`Duplicate tool registration: "${name}"`);
    }

    this.tools.set(name, tool);
  }

  get(name: string): ToolDefinition | null {
    const normalized = this.tryNormalizeName(name);
    if (!normalized) {
      return null;
    }
    return this.tools.get(normalized) ?? null;
  }

  require(name: string): ToolDefinition {
    const tool = this.get(name);
    if (!tool) {
      throw new ToolExecutionError(`Tool "${name}" is not registered`);
    }
    return tool;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listByCategory(category: ToolCategory): ToolDefinition[] {
    return this.list().filter((tool) => tool.category === category);
  }

  freeze(): void {
    this.frozen = true;
  }

  private normalizeName(name: string): string {
    const normalized = String(name ?? "").trim();
    if (normalized) {
      return normalized;
    }
    throw new ToolExecutionError("Tool name must be a non-empty string");
  }

  private tryNormalizeName(name: string): string | null {
    const normalized = String(name ?? "").trim();
    return normalized || null;
  }
}
