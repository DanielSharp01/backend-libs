import { expectTypeOf } from "vitest";

import { codecs } from "../../src/codec";
import { connectionHash, type RedisHashClient } from "../../src/operations/hash";

declare const client: RedisHashClient;
const connection = connectionHash(client);
const objectCodec = codecs.entries({ name: codecs.string(), age: codecs.number() }).object();
const mapCodec = codecs.entries(codecs.number()).map();

expectTypeOf(connection.hGet("profile", "age", objectCodec)).toEqualTypeOf<Promise<number | null>>();
expectTypeOf(connection.hGetAll("profile", objectCodec)).toEqualTypeOf<Promise<{ name: string; age: number }>>();
expectTypeOf(connection.hGetAll("values", mapCodec)).toEqualTypeOf<Promise<Map<string, number>>>();
expectTypeOf(connection.hVals("profile", objectCodec)).toEqualTypeOf<Promise<Array<string | number>>>();

connection.hSet("profile", { name: "Ada", age: 42 }, objectCodec);
connection.hSetNx("profile", "age", 43, objectCodec);

// @ts-expect-error unknown fields are rejected by a fixed entries codec
connection.hGet("profile", "missing", objectCodec);
// @ts-expect-error field values follow the entries codec
connection.hSetNx("profile", "age", "43", objectCodec);
