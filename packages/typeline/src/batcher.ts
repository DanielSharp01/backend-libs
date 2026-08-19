import type { Awaitable } from "@danielsharp/common";
import { typeline, type Typeline } from "./pipeline";

export interface BatcherOptions<TItem, TItemContext, TStoredItem, TBatchInput, TBatchContext, TMeta = unknown> {
  readonly onError?: (error: unknown, input: unknown, context: TBatchContext) => Awaitable<any>;
  readonly metadata?: TMeta;
  readonly mapItem: (item: TItem, context: TItemContext) => TStoredItem;
  readonly mapBatch: (
    firstItem: TItem,
    firstContext: TItemContext,
    storedItems: TStoredItem[],
  ) => { input: TBatchInput; context: TBatchContext };
  readonly debouncedBatchInterval?: number;
  readonly maxBatchInterval?: number;
  readonly batchSize?: number;
}

export function withMeta<TMeta = unknown>(metadata: TMeta) {
  return {
    batchOptions<TItem, TItemContext, TStoredItem, TBatchInput, TBatchContext>(
      options: Omit<BatcherOptions<TItem, TItemContext, TStoredItem, TBatchInput, TBatchContext, TMeta>, "metadata">,
    ) {
      return { ...options, metadata };
    },
  };
}

export interface Batcher<TItem, TItemContext, TBatchInput, TBatchContext, TMeta>
  extends Omit<Typeline<TBatchInput, TBatchInput, TBatchContext, TMeta>, "push"> {
  push(item: TItem, context: TItemContext): void;
  flush(): Promise<unknown | undefined>;
}

export function batcher<TItem, TItemContext, TStoredItem, TBatchInput, TBatchContext, TMeta>(
  options: BatcherOptions<TItem, TItemContext, TStoredItem, TBatchInput, TBatchContext, TMeta>,
): Batcher<TItem, TItemContext, TBatchInput, TBatchContext, TMeta> {
  validateOptions(options);
  const { mapItem, mapBatch, batchSize, debouncedBatchInterval, maxBatchInterval } = options;
  const pipeline = typeline<TBatchInput, TBatchInput, TBatchContext, TMeta>({ onError: options.onError });
  if (options.metadata !== undefined) {
    pipeline.metadata.push(options.metadata);
  }
  const pushBatch = pipeline.push;

  let hasItems = false;
  let firstItem: TItem;
  let firstContext: TItemContext;
  let storedItems: TStoredItem[] = [];
  let batchId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maximumTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimers() {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    if (maximumTimer !== undefined) {
      clearTimeout(maximumTimer);
      maximumTimer = undefined;
    }
  }

  function schedule(timer: "debounce" | "maximum", interval: number, expectedBatchId: number) {
    const handle = setTimeout(() => {
      void flush(expectedBatchId).catch(() => undefined);
    }, interval);

    if (timer === "debounce") {
      debounceTimer = handle;
    } else {
      maximumTimer = handle;
    }
  }

  async function flush(expectedBatchId?: number): Promise<unknown | undefined> {
    if (!hasItems || (expectedBatchId !== undefined && expectedBatchId !== batchId)) {
      return undefined;
    }

    clearTimers();
    const batchFirstItem = firstItem!;
    const batchStoredItems = storedItems;
    hasItems = false;
    storedItems = [];

    try {
      const { input, context } = mapBatch(batchFirstItem, firstContext, batchStoredItems);
      return await pushBatch(input, context);
    } catch (error) {
      throw error;
    }
  }

  const result = {
    ...pipeline,
    push(item, context) {
      if (!hasItems) {
        firstItem = item;
        firstContext = context;
        hasItems = true;
        batchId++;
      }
      storedItems.push(mapItem(item, context));

      if (batchSize !== undefined && storedItems.length >= batchSize) {
        flush(batchId).catch(() => undefined);
        return result;
      }

      if (debouncedBatchInterval !== undefined) {
        if (debounceTimer !== undefined) {
          clearTimeout(debounceTimer);
        }
        schedule("debounce", debouncedBatchInterval, batchId);
      }
      if (maxBatchInterval !== undefined && maximumTimer === undefined) {
        schedule("maximum", maxBatchInterval, batchId);
      }

      return result;
    },
    flush,
  } as Batcher<TItem, TItemContext, TBatchInput, TBatchContext, TMeta>;
  return result;
}

function validateOptions(
  options: Pick<
    BatcherOptions<unknown, unknown, unknown, unknown, unknown, unknown>,
    "batchSize" | "debouncedBatchInterval" | "maxBatchInterval"
  >,
) {
  if (options.batchSize !== undefined && (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1)) {
    throw new RangeError("Batch size must be a positive safe integer.");
  }

  for (const [name, interval] of [
    ["Debounced batch interval", options.debouncedBatchInterval],
    ["Maximum batch interval", options.maxBatchInterval],
  ] as const) {
    if (interval !== undefined && (!Number.isFinite(interval) || interval < 0)) {
      throw new RangeError(`${name} must be a non-negative finite number.`);
    }
  }
}
