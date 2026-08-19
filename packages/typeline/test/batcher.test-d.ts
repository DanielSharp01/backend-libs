import { expectTypeOf } from "vitest";

import { batcher, withMeta, type Batcher, type BatcherOptions, type Typeline } from "../src/index";

type Item = { value: number };
type ItemContext = { tenant: string };
type StoredItem = number;
type BatchInput = { tenant: string; values: number[] };
type BatchContext = { tenant: string; batchId: number };
type Metadata = { name: string };

const options: BatcherOptions<Item, ItemContext, StoredItem, BatchInput, BatchContext, Metadata> = {
  mapItem(item, context) {
    expectTypeOf(item).toEqualTypeOf<Item>();
    expectTypeOf(context).toEqualTypeOf<ItemContext>();
    return item.value;
  },
  mapBatch(firstItem, firstContext, items) {
    expectTypeOf(firstItem).toEqualTypeOf<Item>();
    expectTypeOf(firstContext).toEqualTypeOf<ItemContext>();
    expectTypeOf(items).toEqualTypeOf<number[]>();
    return {
      input: { tenant: firstContext.tenant, values: items },
      context: { tenant: firstContext.tenant, batchId: firstItem.value },
    };
  },
  metadata: { name: "batch" },
};

const batches = batcher(options);
expectTypeOf(batches).toEqualTypeOf<Batcher<Item, ItemContext, BatchInput, BatchContext, Metadata>>();
expectTypeOf(batches.push).returns.toEqualTypeOf<void>();
expectTypeOf(batches.flush).returns.toEqualTypeOf<Promise<unknown | undefined>>();

const processed = batches.pipe((batch, context) => {
  expectTypeOf(batch).toEqualTypeOf<BatchInput>();
  expectTypeOf(context).toEqualTypeOf<BatchContext>();
  return batch.values.length;
});
expectTypeOf(processed).toEqualTypeOf<Typeline<BatchInput, number, BatchContext, Metadata>>();

batches.push({ value: 1 }, { tenant: "acme" });
// @ts-expect-error Item context is required.
batches.push({ value: 1 });
// @ts-expect-error The public push accepts items, not assembled batches.
batches.push({ tenant: "acme", values: [1] }, { tenant: "acme" });

const configured = withMeta<Metadata>({ name: "events" }).batchOptions({
  mapItem: (item: Item, context: ItemContext) => `${context.tenant}:${item.value}`,
  mapBatch: (firstItem, firstContext, items) => ({
    input: { firstItem, items },
    context: { tenant: firstContext.tenant },
  }),
});
expectTypeOf(configured.metadata).toEqualTypeOf<Metadata>();
expectTypeOf(configured.mapItem).returns.toEqualTypeOf<string>();

// @ts-expect-error Metadata is fixed by withMeta.
withMeta<Metadata>({ name: "events" }).batchOptions({ ...options, metadata: { name: "duplicate" } });
