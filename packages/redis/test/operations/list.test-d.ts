import { expectTypeOf } from "vitest";

import { codecs } from "../../src/codec";
import type { RedisListConnection } from "../../src/operations/list";

declare const connection: RedisListConnection;
const codec = codecs.entries({ jobs: codecs.json<{ id: number }>(), names: codecs.string() }).entries();

expectTypeOf(connection.lMPop(["jobs", "names"] as const, "LEFT", codec)).toEqualTypeOf<
  Promise<{ key: "jobs" | "names"; values: Array<{ id: number } | string> } | null>
>();
expectTypeOf(connection.blMPop(["jobs", "names"] as const, "RIGHT", 1, codec)).toEqualTypeOf<
  Promise<{ key: "jobs" | "names"; values: Array<{ id: number } | string> } | null>
>();
