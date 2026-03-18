"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionGate = void 0;
const types_1 = require("../types");
const tools_1 = require("../tools");
class PermissionGate {
    evaluate(mode, tool) {
        switch (mode) {
            case types_1.AgentMode.READ_ONLY:
                return this.evaluateReadOnly(tool);
            case types_1.AgentMode.DRAFT:
                return this.evaluateDraft(tool);
            case types_1.AgentMode.EXECUTE:
                return this.evaluateExecute(tool);
            case types_1.AgentMode.AUTONOMOUS:
                return this.evaluateAutonomous(tool);
            default:
                return this.deny(mode, tool, "Unknown agent mode");
        }
    }
    evaluateReadOnly(tool) {
        if (tool.category === tools_1.ToolCategory.READ || tool.category === tools_1.ToolCategory.EXTERNAL) {
            return { allowed: true, requiresConfirmation: false };
        }
        return this.deny(types_1.AgentMode.READ_ONLY, tool, "READ_ONLY mode only allows READ and EXTERNAL tools");
    }
    evaluateDraft(tool) {
        if (tool.category === tools_1.ToolCategory.EXECUTE) {
            return this.deny(types_1.AgentMode.DRAFT, tool, "DRAFT mode does not allow EXECUTE tools");
        }
        if (tool.category === tools_1.ToolCategory.READ ||
            tool.category === tools_1.ToolCategory.DRAFT ||
            tool.category === tools_1.ToolCategory.EXTERNAL ||
            tool.category === tools_1.ToolCategory.PLAN) {
            return { allowed: true, requiresConfirmation: false };
        }
        if (tool.category === tools_1.ToolCategory.WRITE) {
            return { allowed: true, requiresConfirmation: true };
        }
        return this.deny(types_1.AgentMode.DRAFT, tool, "Tool category is not supported in DRAFT mode");
    }
    evaluateExecute(tool) {
        if (tool.category === tools_1.ToolCategory.WRITE || tool.category === tools_1.ToolCategory.EXECUTE) {
            return { allowed: true, requiresConfirmation: true };
        }
        return { allowed: true, requiresConfirmation: false };
    }
    evaluateAutonomous(tool) {
        if (tool.category === tools_1.ToolCategory.WRITE || tool.category === tools_1.ToolCategory.EXECUTE) {
            return { allowed: true, requiresConfirmation: true };
        }
        return { allowed: true, requiresConfirmation: false };
    }
    deny(mode, tool, reason) {
        return {
            allowed: false,
            requiresConfirmation: false,
            reason: `${reason}. Tool "${tool.name}" (${tool.category}) is blocked in ${mode} mode.`,
        };
    }
}
exports.PermissionGate = PermissionGate;
