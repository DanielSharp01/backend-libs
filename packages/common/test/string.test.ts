import { describe, expect, it } from "vitest";

import { capitalize } from "../src/string";

describe("capitalize", () => {
  it("uppercases the first character", () => {
    expect(capitalize("value")).toBe("Value");
    expect(capitalize("Value")).toBe("Value");
  });

  it("keeps an empty string empty", () => {
    expect(capitalize("")).toBe("");
  });
});
