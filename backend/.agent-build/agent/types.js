"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TurnType = exports.AgentMode = void 0;
var AgentMode;
(function (AgentMode) {
    AgentMode["READ_ONLY"] = "READ_ONLY";
    AgentMode["DRAFT"] = "DRAFT";
    AgentMode["EXECUTE"] = "EXECUTE";
    AgentMode["AUTONOMOUS"] = "AUTONOMOUS";
})(AgentMode || (exports.AgentMode = AgentMode = {}));
var TurnType;
(function (TurnType) {
    TurnType["NEW"] = "NEW";
    TurnType["CONFIRMATION"] = "CONFIRMATION";
    TurnType["REJECTION"] = "REJECTION";
    TurnType["AMENDMENT"] = "AMENDMENT";
})(TurnType || (exports.TurnType = TurnType = {}));
