import { LOOP_GUARD_TIMEOUT_MS, MAX_TOOL_ITERATIONS } from "../config";
import { LoopGuardError } from "../errors";

export interface LoopBudget {
  maxIterations: number;
  timeoutMs: number;
}

export class LoopGuard {
  private readonly budget: LoopBudget;

  constructor(budget: Partial<LoopBudget> = {}) {
    this.budget = {
      maxIterations: budget.maxIterations ?? MAX_TOOL_ITERATIONS,
      timeoutMs: budget.timeoutMs ?? LOOP_GUARD_TIMEOUT_MS,
    };
  }

  assertIteration(iteration: number): void {
    if (iteration > this.budget.maxIterations) {
      throw new LoopGuardError(
        `Agentic loop exceeded maxIterations=${this.budget.maxIterations}`,
      );
    }
  }

  async wrapTimeout<T>(promise: Promise<T>, onTimeout?: () => void): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        if (onTimeout) {
          onTimeout();
        }
        reject(
          new LoopGuardError(
            `Agentic loop exceeded timeoutMs=${this.budget.timeoutMs}`,
          ),
        );
      }, this.budget.timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
