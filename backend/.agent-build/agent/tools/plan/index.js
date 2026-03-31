"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposeDeleteTool = exports.proposeUpdateTool = exports.proposeCreateTool = void 0;
exports.getPlanTools = getPlanTools;
const proposeCreate_tool_1 = require("./proposeCreate.tool");
Object.defineProperty(exports, "proposeCreateTool", { enumerable: true, get: function () { return proposeCreate_tool_1.proposeCreateTool; } });
const proposeUpdate_tool_1 = require("./proposeUpdate.tool");
Object.defineProperty(exports, "proposeUpdateTool", { enumerable: true, get: function () { return proposeUpdate_tool_1.proposeUpdateTool; } });
const proposeDelete_tool_1 = require("./proposeDelete.tool");
Object.defineProperty(exports, "proposeDeleteTool", { enumerable: true, get: function () { return proposeDelete_tool_1.proposeDeleteTool; } });
function getPlanTools() {
    return [proposeCreate_tool_1.proposeCreateTool, proposeUpdate_tool_1.proposeUpdateTool, proposeDelete_tool_1.proposeDeleteTool];
}
