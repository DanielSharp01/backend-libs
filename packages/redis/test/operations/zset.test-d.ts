import { expectTypeOf } from "vitest";

import { codecs } from "../../src/codec";
import type { RedisZSetConnection } from "../../src/operations/zset";

declare const connection: RedisZSetConnection;
const codec = codecs.entries({ scores: codecs.json<{ id: number }>(), labels: codecs.string() }).entries();

expectTypeOf(connection.zMPop(["scores", "labels"] as const, "MIN", codec)).toEqualTypeOf<
  Promise<{
    key: "scores" | "labels";
    entries: Array<{ value: { id: number } | string; score: number }>;
  } | null>
>();
expectTypeOf(connection.bzMPop(["scores", "labels"] as const, "MAX", 1, codec)).toEqualTypeOf<
  Promise<{
    key: "scores" | "labels";
    entries: Array<{ value: { id: number } | string; score: number }>;
  } | null>
>();
