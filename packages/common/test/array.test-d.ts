import { expectTypeOf } from "vitest";

import { addUnique, unique } from "../src/array";

expectTypeOf(addUnique([1, 2], 2, 3)).toEqualTypeOf<void>();
expectTypeOf(unique([1, 2, 1] as const)).toEqualTypeOf<(1 | 2)[]>();
expectTypeOf(unique(new Set<string>())).toEqualTypeOf<string[]>();
