import { describe, expect, it } from "vitest";

import { addUnique, unique } from "../src/array";

describe("addUnique", () => {
  it("appends only values not already present", () => {
    const values = ["first", "second"];

    addUnique(values, "second", "third", "first", "fourth");

    expect(values).toEqual(["first", "second", "third", "fourth"]);
  });
});

describe("unique", () => {
  it("keeps the first occurrence of each value in iteration order", () => {
    expect(unique(["second", "first", "second", "third", "first"])).toEqual(["second", "first", "third"]);
  });

  it("accepts any iterable and compares values with Set semantics", () => {
    const shared = { id: 1 };
    expect(unique(new Set([shared, shared, { id: 1 }]))).toEqual([shared, { id: 1 }]);
  });
});
