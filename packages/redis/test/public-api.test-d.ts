import { expectTypeOf } from "vitest";

import {
  codecs,
  createRedisConnection,
  type EntriesOf,
  type RedisConnection,
  type RedisEntriesCodec,
  type TupleShape,
} from "../src/index";

const connection = createRedisConnection({ on() {} } as any, { onError() {} });
expectTypeOf(connection).toEqualTypeOf<RedisConnection>();
expectTypeOf(connection.get("count", codecs.number())).toEqualTypeOf<Promise<number | null>>();

type Shape = TupleShape<readonly ["first", "second"], number>;
expectTypeOf<Shape>().toMatchTypeOf<{ first: number; second: number }>();

declare const entriesCodec: RedisEntriesCodec<{ first: string }, { first: string }>;
expectTypeOf<EntriesOf<typeof entriesCodec>>().toEqualTypeOf<readonly (readonly ["first", string])[]>();
