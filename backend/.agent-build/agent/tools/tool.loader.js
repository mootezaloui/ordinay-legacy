"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapTools = bootstrapTools;
function bootstrapTools(registry, tools) {
    for (const tool of tools) {
        registry.register(tool);
    }
    registry.freeze();
}
