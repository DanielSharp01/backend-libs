import { expectTypeOf } from "vitest";
import { z } from "zod";

import { zodJsonify, zodStringify } from "../src/index";

const stringified = zodStringify(z.number().prefault(5));
expectTypeOf<z.input<typeof stringified>>().toEqualTypeOf<string | undefined>();
expectTypeOf<z.output<typeof stringified>>().toEqualTypeOf<number>();

const jsonified = zodJsonify(z.date().prefault(new Date("2026-08-19")));
expectTypeOf<z.input<typeof jsonified>>().toEqualTypeOf<string | undefined>();
expectTypeOf<z.output<typeof jsonified>>().toEqualTypeOf<Date>();
