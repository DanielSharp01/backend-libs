import { describe, expect, it } from "vitest";

import { ZodError, ZodSchemaConversionError } from "../src/errors";

describe("Zod errors", () => {
  it("recognizes the package error family and conversion code", () => {
    const error = new ZodSchemaConversionError("unrepresentable", "Conversion failed.");

    expect(ZodError.is(error)).toBe(true);
    expect(ZodSchemaConversionError.is(error)).toBe(true);
    expect(error).toMatchObject({ code: ZodSchemaConversionError.code, reason: "unrepresentable" });
  });
});
