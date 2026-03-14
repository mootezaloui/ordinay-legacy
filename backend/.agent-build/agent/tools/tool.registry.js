"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const errors_1 = require("../errors");
class ToolRegistry {
    tools = new Map();
    frozen = false;
    register(tool) {
        if (this.frozen) {
            throw new errors_1.ToolExecutionError("Tool registry is frozen");
        }
        const name = this.normalizeName(tool.name);
        if (this.tools.has(name)) {
            throw new errors_1.ToolExecutionError(`Duplicate tool registration: "${name}"`);
        }
        this.tools.set(name, tool);
    }
    get(name) {
        const normalized = this.tryNormalizeName(name);
        if (!normalized) {
            return null;
        }
        return this.tools.get(normalized) ?? null;
    }
    require(name) {
        const tool = this.get(name);
        if (!tool) {
            throw new errors_1.ToolExecutionError(`Tool "${name}" is not registered`);
        }
        return tool;
    }
    list() {
        return [...this.tools.values()];
    }
    listByCategory(category) {
        return this.list().filter((tool) => tool.category === category);
    }
    freeze() {
        this.frozen = true;
    }
    normalizeName(name) {
        const normalized = String(name ?? "").trim();
        if (normalized) {
            return normalized;
        }
        throw new errors_1.ToolExecutionError("Tool name must be a non-empty string");
    }
    tryNormalizeName(name) {
        const normalized = String(name ?? "").trim();
        return normalized || null;
    }
}
exports.ToolRegistry = ToolRegistry;
