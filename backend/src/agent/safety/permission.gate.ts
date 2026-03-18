import { AgentMode } from "../types";
import { ToolCategory, type ToolDefinition } from "../tools";

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
}

export class PermissionGate {
  evaluate(mode: AgentMode, tool: ToolDefinition): PermissionDecision {
    switch (mode) {
      case AgentMode.READ_ONLY:
        return this.evaluateReadOnly(tool);
      case AgentMode.DRAFT:
        return this.evaluateDraft(tool);
      case AgentMode.EXECUTE:
        return this.evaluateExecute(tool);
      case AgentMode.AUTONOMOUS:
        return this.evaluateAutonomous(tool);
      default:
        return this.deny(mode, tool, "Unknown agent mode");
    }
  }

  private evaluateReadOnly(tool: ToolDefinition): PermissionDecision {
    if (tool.category === ToolCategory.READ || tool.category === ToolCategory.EXTERNAL) {
      return { allowed: true, requiresConfirmation: false };
    }
    return this.deny(
      AgentMode.READ_ONLY,
      tool,
      "READ_ONLY mode only allows READ and EXTERNAL tools",
    );
  }

  private evaluateDraft(tool: ToolDefinition): PermissionDecision {
    if (tool.category === ToolCategory.EXECUTE) {
      return this.deny(
        AgentMode.DRAFT,
        tool,
        "DRAFT mode does not allow EXECUTE tools",
      );
    }

    if (
      tool.category === ToolCategory.READ ||
      tool.category === ToolCategory.DRAFT ||
      tool.category === ToolCategory.EXTERNAL ||
      tool.category === ToolCategory.PLAN
    ) {
      return { allowed: true, requiresConfirmation: false };
    }

    if (tool.category === ToolCategory.WRITE) {
      return { allowed: true, requiresConfirmation: true };
    }

    return this.deny(AgentMode.DRAFT, tool, "Tool category is not supported in DRAFT mode");
  }

  private evaluateExecute(tool: ToolDefinition): PermissionDecision {
    if (tool.category === ToolCategory.WRITE || tool.category === ToolCategory.EXECUTE) {
      return { allowed: true, requiresConfirmation: true };
    }
    return { allowed: true, requiresConfirmation: false };
  }

  private evaluateAutonomous(tool: ToolDefinition): PermissionDecision {
    if (tool.category === ToolCategory.WRITE || tool.category === ToolCategory.EXECUTE) {
      return { allowed: true, requiresConfirmation: true };
    }
    return { allowed: true, requiresConfirmation: false };
  }

  private deny(mode: AgentMode, tool: ToolDefinition, reason: string): PermissionDecision {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `${reason}. Tool "${tool.name}" (${tool.category}) is blocked in ${mode} mode.`,
    };
  }
}
