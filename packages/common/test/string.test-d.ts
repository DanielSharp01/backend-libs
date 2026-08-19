import { expectTypeOf } from "vitest";

import { capitalize } from "../src/string";

expectTypeOf(capitalize("value")).toEqualTypeOf<string>();
