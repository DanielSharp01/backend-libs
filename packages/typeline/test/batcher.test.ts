import { describe, expect, it, vi } from "vitest";

import { batcher, withMeta, type BatcherOptions } from "../src/batcher";

type Item = { value: number };
type ItemContext = { tenant: string; traceId: string };
type StoredItem = { value: number; tenant: string };
type BatchInput = { tenant: string; values: number[] };
type BatchContext = { traceId: string };
type Metadata = { name: string };

function options(
  scheduling: Partial<
    Pick<
      BatcherOptions<Item, ItemContext, StoredItem, BatchInput, BatchContext, Metadata>,
      "batchSize" | "debouncedBatchInterval" | "maxBatchInterval"
    >
  > = {},
) {
  return {
    mapItem: (item: Item, context: ItemContext) => ({ value: item.value, tenant: context.tenant }),
    mapBatch: (firstItem: Item, firstContext: ItemContext, items: StoredItem[]) => ({
      input: { tenant: firstContext.tenant, values: items.map(({ value }) => value) },
      context: { traceId: `${firstContext.traceId}:${firstItem.value}` },
    }),
    ...scheduling,
  };
}

describe("batcher", () => {
  it("maps queued items and flushes them as one batch", async () => {
    const mapItem = vi.fn(options().mapItem);
    const mapBatch = vi.fn(options().mapBatch);
    const batches = batcher({ ...options(), mapItem, mapBatch });
    const firstContext = { tenant: "acme", traceId: "trace-1" };

    batches.push({ value: 1 }, firstContext);
    batches.push({ value: 2 }, { tenant: "other", traceId: "trace-2" });

    await expect(batches.flush()).resolves.toEqual({ tenant: "acme", values: [1, 2] });
    expect(mapItem).toHaveBeenNthCalledWith(1, { value: 1 }, firstContext);
    expect(mapItem).toHaveBeenNthCalledWith(2, { value: 2 }, { tenant: "other", traceId: "trace-2" });
    expect(mapBatch).toHaveBeenCalledExactlyOnceWith({ value: 1 }, firstContext, [
      { value: 1, tenant: "acme" },
      { value: 2, tenant: "other" },
    ]);
    await expect(batches.flush()).resolves.toBeUndefined();
  });

  it("flushes when the batch reaches its size limit", async () => {
    const mapBatch = vi.fn(options().mapBatch);
    const batches = batcher({ ...options({ batchSize: 2 }), mapBatch });

    batches.push({ value: 1 }, { tenant: "acme", traceId: "trace-1" });
    batches.push({ value: 2 }, { tenant: "acme", traceId: "trace-2" });

    await vi.waitFor(() => expect(mapBatch).toHaveBeenCalledOnce());
    await expect(batches.flush()).resolves.toBeUndefined();
  });

  it("debounces an automatic flush from the newest item", async () => {
    vi.useFakeTimers();
    try {
      const mapBatch = vi.fn(options().mapBatch);
      const batches = batcher({ ...options({ debouncedBatchInterval: 20 }), mapBatch });

      batches.push({ value: 1 }, { tenant: "acme", traceId: "trace-1" });
      await vi.advanceTimersByTimeAsync(15);
      batches.push({ value: 2 }, { tenant: "acme", traceId: "trace-2" });
      await vi.advanceTimersByTimeAsync(19);
      expect(mapBatch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mapBatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps debounce resets with the maximum interval", async () => {
    vi.useFakeTimers();
    try {
      const mapBatch = vi.fn(options().mapBatch);
      const batches = batcher({
        ...options({ debouncedBatchInterval: 20, maxBatchInterval: 30 }),
        mapBatch,
      });

      batches.push({ value: 1 }, { tenant: "acme", traceId: "trace-1" });
      await vi.advanceTimersByTimeAsync(15);
      batches.push({ value: 2 }, { tenant: "acme", traceId: "trace-2" });
      await vi.advanceTimersByTimeAsync(14);
      expect(mapBatch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mapBatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels automatic flushes after a manual flush", async () => {
    vi.useFakeTimers();
    try {
      const mapBatch = vi.fn(options().mapBatch);
      const batches = batcher({
        ...options({ debouncedBatchInterval: 20, maxBatchInterval: 30 }),
        mapBatch,
      });

      batches.push({ value: 1 }, { tenant: "acme", traceId: "trace-1" });
      await batches.flush();

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(30);
      expect(mapBatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes batch metadata", () => {
    const batches = batcher({ ...options(), metadata: { name: "users" } });
    const configured = withMeta<Metadata>({ name: "events" }).batchOptions(options());

    expect(batches.metadata).toEqual([{ name: "users" }]);
    expect(configured.metadata).toEqual({ name: "events" });
  });

  it.each([
    [{ batchSize: 0 }, "Batch size must be a positive safe integer."],
    [{ batchSize: 1.5 }, "Batch size must be a positive safe integer."],
    [{ debouncedBatchInterval: -1 }, "Debounced batch interval must be a non-negative finite number."],
    [{ maxBatchInterval: Number.POSITIVE_INFINITY }, "Maximum batch interval must be a non-negative finite number."],
  ])("rejects invalid scheduling options", (scheduling, message) => {
    expect(() => batcher({ ...options(), ...scheduling })).toThrow(message);
  });

  it("propagates batch construction errors from manual flush", async () => {
    const failure = new Error("cannot build batch");
    const batches = batcher({
      ...options(),
      mapBatch() {
        throw failure;
      },
    });
    batches.push({ value: 1 }, { tenant: "acme", traceId: "trace-1" });

    await expect(batches.flush()).rejects.toBe(failure);
    await expect(batches.flush()).resolves.toBeUndefined();
  });
});
