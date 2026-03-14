"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToolInput = validateToolInput;
exports.validateToolOutput = validateToolOutput;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateValueAgainstType(expectedType, value) {
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
function validateSchema(schema, value) {
    if (!schema) {
        return true;
    }
    if (!isRecord(schema)) {
        return true;
    }
    const expectedType = typeof schema.type === "string" ? schema.type.toLowerCase() : undefined;
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
function validateToolInput(schema, input) {
    return validateSchema(schema, input);
}
function validateToolOutput(schema, output) {
    return validateSchema(schema, output);
}
