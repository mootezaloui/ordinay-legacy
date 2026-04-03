"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestActionTool = void 0;
exports.getSystemTools = getSystemTools;
const suggestAction_tool_1 = require("./suggestAction.tool");
Object.defineProperty(exports, "suggestActionTool", { enumerable: true, get: function () { return suggestAction_tool_1.suggestActionTool; } });
function getSystemTools() {
    return [suggestAction_tool_1.suggestActionTool];
}
