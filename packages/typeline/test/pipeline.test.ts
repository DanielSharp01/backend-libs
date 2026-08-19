import { describe, expect, it, vi } from "vitest";

import { isPipelineStop, stop, typeline } from "../src/pipeline";

type Context = { requestId: string };
type Metadata = { name: string };

describe("typeline", () => {
  it("runs synchronous and asynchronous middleware in order", async () => {
    const line = typeline<number, number, Context, Metadata>()
      .pipe((value, context) => value + context.requestId.length)
      .pipe(async (value) => `value:${value}`);

    await expect(line.push(2, { requestId: "abc" })).resolves.toBe("value:5");
  });

  it("keeps earlier pipelines unchanged", async () => {
    const root = typeline<number, number, Context, Metadata>();
    const incremented = root.pipe((value) => value + 1);
    const formatted = incremented.pipe((value) => `value:${value}`);

    await expect(root.push(2, { requestId: "a" })).resolves.toBe(2);
    await expect(incremented.push(2, { requestId: "a" })).resolves.toBe(3);
    await expect(formatted.push(2, { requestId: "a" })).resolves.toBe("value:3");
  });

  it("composes another typeline", async () => {
    const child = typeline<number, number, Context, Metadata>().pipe((value) => String(value));
    const line = typeline<number, number, Context, Metadata>()
      .pipe((value) => value * 2)
      .pipe(child);

    await expect(line.push(3, { requestId: "a" })).resolves.toBe("6");
  });

  it("collects middleware metadata without mutating earlier pipelines", () => {
    const root = typeline<number, number, Context, Metadata>();
    const first = root.pipe({ mw: (value) => value + 1, metadata: { name: "increment" } });
    const second = first.pipe({ metadata: [{ name: "audit" }, { name: "metrics" }] });

    expect(root.metadata).toEqual([]);
    expect(first.metadata).toEqual([{ name: "increment" }]);
    expect(second.metadata).toEqual([{ name: "increment" }, { name: "audit" }, { name: "metrics" }]);
  });

  it("propagates a stop without running later middleware or the error handler", async () => {
    const downstream = vi.fn();
    const onError = vi.fn();
    const line = typeline<number, number, Context, Metadata>({ onError })
      .pipe((value) => value + 1)
      .pipe(() => stop())
      .pipe(downstream);

    await expect(line.push(2, { requestId: "a" })).rejects.toSatisfy(isPipelineStop);
    expect(downstream).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("recognizes only the value thrown by stop as a pipeline stop", () => {
    let thrown: unknown;
    try {
      stop();
    } catch (error) {
      thrown = error;
    }

    expect(isPipelineStop(thrown)).toBe(true);
    expect(isPipelineStop(new Error("stop"))).toBe(false);
  });

  it("reports middleware errors with the current input and context", async () => {
    const failure = new Error("broken middleware");
    const onError = vi.fn();
    const context = { requestId: "request-1" };
    const line = typeline<number, number, Context, Metadata>({ onError })
      .pipe((value) => value + 1)
      .pipe(() => {
        throw failure;
      });

    await expect(line.push(2, context)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, 3, context);
  });

  it("rethrows middleware errors when there is no error handler", async () => {
    const failure = new Error("broken middleware");
    const line = typeline<number, number, Context, Metadata>().pipe(() => {
      throw failure;
    });

    await expect(line.push(2, { requestId: "a" })).rejects.toBe(failure);
  });
});
