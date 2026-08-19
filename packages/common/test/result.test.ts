import { describe, expect, it } from "vitest";

import { err, isErr, isOk, ok } from "../src/result";

describe("Result", () => {
  it("constructs successful results", () => {
    const result = ok(42);

    expect(result).toEqual({ ok: 42 });
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it("constructs error results", () => {
    const error = new Error("failed");
    const result = err(error);

    expect(result).toEqual({ err: error });
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });
});
