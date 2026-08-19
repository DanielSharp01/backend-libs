import { expectTypeOf } from "vitest";

import { codecs, type CodecValue, type EntriesCodecInput, type EntriesOf, type EntriesShape } from "../src/codec";

const codec = codecs.entries({ name: codecs.string(), age: codecs.number() }).object();

expectTypeOf<CodecValue<typeof codec>>().toEqualTypeOf<{ name: string; age: number }>();
expectTypeOf<EntriesShape<typeof codec>>().toEqualTypeOf<{ name: string; age: number }>();
expectTypeOf<EntriesOf<typeof codec>>().toEqualTypeOf<
  readonly (readonly ["name", string] | readonly ["age", number])[]
>();

declare const input: EntriesCodecInput<typeof codec>;
codec.encode(input);
codec.encode({ name: "Ada", age: 42 });
codec.encode(
  new Map<"name" | "age", string | number>([
    ["name", "Ada"],
    ["age", 42],
  ]),
);

// @ts-expect-error fixed entry shapes reject unknown keys
codec.encode({ name: "Ada", missing: true });
// @ts-expect-error fixed entry shapes preserve value types
codec.encode({ name: "Ada", age: "42" });
