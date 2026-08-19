import { describe, expect, it, vi } from "vitest";

import { concurrently, ConcurrencyTimeout, Semaphore } from "../src/concurrency";
import { isPipelineStop, stop, typeline } from "../src/pipeline";

type Context = { requestId: string };
type Metadata = { name: string };

describe("Semaphore", () => {
  it("admits no more than the configured number of tasks", async () => {
    const semaphore = Semaphore(2);

    await semaphore.acquire();
    await semaphore.acquire();
    let acquired = false;
    const waiting = semaphore.acquire().then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    semaphore.release();
    await waiting;
    expect(acquired).toBe(true);
    semaphore.release();
    semaphore.release();
  });

  it("admits queued tasks in order", async () => {
    const semaphore = Semaphore(1);
    await semaphore.acquire();
    const order: number[] = [];
    const first = semaphore.acquire().then(() => order.push(1));
    const second = semaphore.acquire().then(() => order.push(2));

    semaphore.release();
    await first;
    expect(order).toEqual([1]);
    semaphore.release();
    await second;
    expect(order).toEqual([1, 2]);
    semaphore.release();
  });

  it("times out queued tasks without consuming a later release", async () => {
    vi.useFakeTimers();
    try {
      const semaphore = Semaphore(1, 20);
      await semaphore.acquire();
      const waiting = semaphore.acquire();
      const rejection = expect(waiting).rejects.toSatisfy(ConcurrencyTimeout.is);

      await vi.advanceTimersByTimeAsync(20);
      await rejection;
      semaphore.release();
      await expect(semaphore.acquire()).resolves.toBeUndefined();
      semaphore.release();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [0, undefined, "Semaphore max must be a positive safe integer."],
    [1.5, undefined, "Semaphore max must be a positive safe integer."],
    [1, -1, "Semaphore timeout must be a non-negative finite number."],
  ])("rejects invalid limits", (max, timeout, message) => {
    expect(() => Semaphore(max, timeout)).toThrow(message);
  });
});

describe("concurrently", () => {
  it("limits execution of a pipeline fragment", async () => {
    let active = 0;
    let maximum = 0;
    const releases: (() => void)[] = [];
    const wrapped = concurrently<number, number, Context, Metadata>(Semaphore(1), (line) =>
      line.pipe(async (value) => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
        return value * 2;
      }),
    );
    const line = typeline<number, number, Context, Metadata>().pipe(wrapped);

    const first = line.push(2, { requestId: "first" });
    const second = line.push(3, { requestId: "second" });
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()!();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()!();

    await expect(first).resolves.toBe(4);
    await expect(second).resolves.toBe(6);
    expect(maximum).toBe(1);
  });

  it("releases the semaphore when middleware rejects", async () => {
    const failure = new Error("failed");
    const wrapped = concurrently<number, number, Context, Metadata>(Semaphore(1), (line) =>
      line.pipe((value) => {
        if (value === 1) throw failure;
        return value;
      }),
    );
    const line = typeline<number, number, Context, Metadata>().pipe(wrapped);

    await expect(line.push(1, { requestId: "first" })).rejects.toBe(failure);
    await expect(line.push(2, { requestId: "second" })).resolves.toBe(2);
  });

  it("propagates stops, skips downstream middleware, and releases the semaphore", async () => {
    const semaphore = Semaphore(1);
    const downstream = vi.fn((value: number) => value);
    const wrapped = concurrently<number, number, Context, Metadata>(semaphore, (line) =>
      line.pipe((value) => {
        if (value === 1) return stop();
        return value;
      }),
    );
    const line = typeline<number, number, Context, Metadata>().pipe(wrapped).pipe(downstream);

    await expect(line.push(1, { requestId: "first" })).rejects.toSatisfy(isPipelineStop);
    expect(downstream).not.toHaveBeenCalled();
    await expect(line.push(2, { requestId: "second" })).resolves.toBe(2);
    expect(downstream).toHaveBeenCalledOnce();
  });

  it("copies metadata from the wrapped fragment", () => {
    const wrapped = concurrently<number, number, Context, Metadata>(Semaphore(1), (line) =>
      line.pipe({ mw: (value) => value, metadata: { name: "limited" } }),
    );

    expect(wrapped.metadata).toEqual([{ name: "limited" }]);
  });
});
