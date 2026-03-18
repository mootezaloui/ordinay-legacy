"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDraftTool = void 0;
exports.getDraftTools = getDraftTools;
const generateDraft_tool_1 = require("./generateDraft.tool");
Object.defineProperty(exports, "generateDraftTool", { enumerable: true, get: function () { return generateDraft_tool_1.generateDraftTool; } });
function getDraftTools() {
    return [generateDraft_tool_1.generateDraftTool];
}
