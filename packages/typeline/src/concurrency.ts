import type { Awaitable } from "../../common/src/types";
import { ConcurrencyTimeout } from "./errors";
import { typeline, type TypelineBuilder } from "./pipeline";

export { ConcurrencyTimeout } from "./errors";

type Waiter = {
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
};

export interface Semaphore {
  acquire(): Promise<void>;
  release(): void;
}

export function Semaphore(max: number, timeout?: number): Semaphore {
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new RangeError("Semaphore max must be a positive safe integer.");
  }
  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
    throw new RangeError("Semaphore timeout must be a non-negative finite number.");
  }

  let active = 0;
  const queue: Waiter[] = [];

  return {
    acquire() {
      if (active < max) {
        active++;
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const waiter: Waiter = { resolve };
        if (timeout !== undefined) {
          waiter.timer = setTimeout(() => {
            const index = queue.indexOf(waiter);
            if (index >= 0) {
              queue.splice(index, 1);
            }
            reject(new ConcurrencyTimeout(timeout));
          }, timeout);
        }
        queue.push(waiter);
      });
    },
    release() {
      const next = queue.shift();
      if (next) {
        if (next.timer !== undefined) {
          clearTimeout(next.timer);
        }
        next.resolve();
      } else if (active > 0) {
        active--;
      }
    },
  };
}

async function runWithSemaphore<T>(semaphore: Semaphore, task: () => Awaitable<T>): Promise<T> {
  await semaphore.acquire();
  try {
    return await task();
  } finally {
    semaphore.release();
  }
}

export function concurrently<TInput, TOutput, TContext, TMeta>(
  semaphore: Semaphore,
  build: TypelineBuilder<TInput, TOutput, TContext, TMeta>,
) {
  const pipeline = typeline<TInput, TInput, TContext, TMeta>();
  const line = build(pipeline);

  return {
    mw: (input: TInput, context: TContext) => {
      return runWithSemaphore(semaphore, () => line.push(input, context));
    },
    metadata: line.metadata,
  };
}
