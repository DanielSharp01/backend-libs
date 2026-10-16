import { describe, expect, it } from "vitest";

import * as zod from "../src/index";

describe("public API", () => {
  it("exposes the curated runtime surface", () => {
    expect(Object.keys(zod).sort()).toEqual([
      "ZodError",
      "ZodSchemaConversionError",
      "zodFlatten",
      "zodJsonSchemas",
      "zodJsonString",
      "zodJsonify",
      "zodMapEachKey",
      "zodReferences",
      "zodStringify",
    ]);
  });
});
