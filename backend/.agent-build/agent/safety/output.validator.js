"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAssistantOutput = validateAssistantOutput;
exports.validateToolExecutionResultShape = validateToolExecutionResultShape;
function validateAssistantOutput(text) {
    const warnings = [];
    if (typeof text !== "string" || text.trim().length === 0) {
        warnings.push("Assistant output is empty.");
    }
    return {
        valid: warnings.length === 0,
        warnings,
    };
}
function validateToolExecutionResultShape(result) {
    const warnings = [];
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
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
