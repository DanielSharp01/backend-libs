import { expectTypeOf } from "vitest";

import type { Awaitable, Prettify } from "../src/types";

expectTypeOf<Prettify<{ id: number } & { name: string }>>().toEqualTypeOf<{
  id: number;
  name: string;
}>();

expectTypeOf<Awaitable<number>>().toEqualTypeOf<number | PromiseLike<number>>();
