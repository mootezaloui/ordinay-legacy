"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopGuard = void 0;
const config_1 = require("../config");
const errors_1 = require("../errors");
class LoopGuard {
    budget;
    constructor(budget = {}) {
        this.budget = {
            maxIterations: budget.maxIterations ?? config_1.MAX_TOOL_ITERATIONS,
            timeoutMs: budget.timeoutMs ?? config_1.LOOP_GUARD_TIMEOUT_MS,
        };
    }
    assertIteration(iteration) {
        if (iteration > this.budget.maxIterations) {
            throw new errors_1.LoopGuardError(`Agentic loop exceeded maxIterations=${this.budget.maxIterations}`);
        }
    }
    async wrapTimeout(promise, onTimeout) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                if (onTimeout) {
                    onTimeout();
                }
                reject(new errors_1.LoopGuardError(`Agentic loop exceeded timeoutMs=${this.budget.timeoutMs}`));
            }, this.budget.timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        }
        finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        }
    }
}
exports.LoopGuard = LoopGuard;
