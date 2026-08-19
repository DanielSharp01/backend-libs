import { describe, expect, it } from "vitest";

import { codecs } from "../src/codec";

describe("Redis codecs", () => {
  it("encodes and decodes scalar values", () => {
    expect(codecs.string().decode("value")).toBe("value");
    expect(codecs.number().encode(42)).toBe("42");
    expect(codecs.number().decode("42.5")).toBe(42.5);
    expect(() => codecs.number().decode("nope")).toThrow(TypeError);
    expect(codecs.json<{ id: number }>().decode('{"id":1}')).toEqual({ id: 1 });
  });

  it("accepts objects, entries, and maps as entries-codec input", () => {
    const codec = codecs.entries({ name: codecs.string(), age: codecs.number() });

    expect(codec.object().encode({ name: "Ada", age: 42 })).toEqual([
      ["name", "Ada"],
      ["age", "42"],
    ]);
    expect(
      codec.entries().encode([
        ["name", "Ada"],
        ["age", 42],
      ]),
    ).toEqual([
      ["name", "Ada"],
      ["age", "42"],
    ]);
    expect(codec.map().encode(new Map([["age", 42]]))).toEqual([["age", "42"]]);
  });

  it("decodes entries into the selected representation", () => {
    const codec = codecs.entries({ name: codecs.string(), age: codecs.number() });
    const encoded = [
      ["name", "Ada"],
      ["age", "42"],
    ] as const;

    expect(codec.object().decode(encoded)).toEqual({ name: "Ada", age: 42 });
    expect(codec.entries().decode(encoded)).toEqual([
      ["name", "Ada"],
      ["age", 42],
    ]);
    expect(codec.map().decode(encoded)).toEqual(
      new Map<string, string | number>([
        ["name", "Ada"],
        ["age", 42],
      ]),
    );
  });

  it("supports JSON representation conversion", () => {
    const objectCodec = codecs.json.object<{ name: string; age: number }>("entries");
    const entriesCodec = codecs.json.entries<readonly [readonly ["name", string], readonly ["age", number]]>("object");

    expect(objectCodec.encode({ name: "Ada", age: 42 })).toBe('[["name","Ada"],["age",42]]');
    expect(objectCodec.decode('[["name","Ada"],["age",42]]')).toEqual({ name: "Ada", age: 42 });
    expect(
      entriesCodec.encode({
        name: "Ada",
        age: 42,
      }),
    ).toBe('{"name":"Ada","age":42}');
  });
});
