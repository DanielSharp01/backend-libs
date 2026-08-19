import { expectTypeOf } from "vitest";

import { codecs } from "../../src/codec";
import type { RedisStreamConnection } from "../../src/operations/stream";

declare const connection: RedisStreamConnection;
const codec = codecs.entries({ events: codecs.json<{ id: number }>(), logs: codecs.string() }).entries();

const streams = [
  { key: "events", after: "0-0" },
  { key: "logs", after: "$" },
] as const;

expectTypeOf(connection.xRead(streams, codec)).toMatchTypeOf<
  Promise<Array<{
    key: "events" | "logs";
    entries: Array<{ id: string; value: { id: number } | string }>;
  }> | null>
>();
const groupRead = connection.xReadGroup(
  "workers",
  "one",
  [
    { key: "events", after: ">" },
    { key: "logs", after: "0-0" },
  ] as const,
  codec,
);
type GroupBatch = NonNullable<Awaited<typeof groupRead>>[number];
expectTypeOf<GroupBatch["key"]>().toEqualTypeOf<"events" | "logs">();
