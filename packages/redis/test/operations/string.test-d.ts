import { expectTypeOf } from "vitest";

import { codecs } from "../../src/codec";
import type { RedisStringConnection } from "../../src/operations/string";

declare const connection: RedisStringConnection;
const valueCodec = codecs.json<{ id: number }>();
const valuesCodec = codecs.entries({ raw: codecs.string(), count: codecs.number() }).object();

expectTypeOf(connection.get("item", valueCodec)).toEqualTypeOf<Promise<{ id: number } | null>>();
expectTypeOf(connection.mGet(["raw", "count"] as const, valuesCodec)).toEqualTypeOf<
  Promise<{ raw: string; count: number }>
>();
expectTypeOf(connection.mGet(["raw", "count"] as const)).toMatchTypeOf<
  Promise<{ raw: string | null; count: string | null }>
>();

connection.set("item", { id: 1 }, valueCodec);
connection.mSet({ raw: "value", count: 42 }, valuesCodec);

// @ts-expect-error scalar values follow the codec
connection.set("item", { id: "1" }, valueCodec);
// @ts-expect-error entries values follow the per-key codec
connection.mSet({ raw: "value", count: "42" }, valuesCodec);
