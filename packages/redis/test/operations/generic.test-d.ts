import { expectTypeOf } from "vitest";

import type { RedisGenericConnection } from "../../src/operations/generic";

declare const connection: RedisGenericConnection;

expectTypeOf(connection.exists("key")).toEqualTypeOf<Promise<boolean>>();
expectTypeOf(connection.exists(["one", "two"])).toEqualTypeOf<Promise<number>>();
expectTypeOf(connection.keys("*")).toEqualTypeOf<Promise<string[]>>();
expectTypeOf(connection.ttl("key")).toEqualTypeOf<Promise<number | "no-expiry" | null>>();
