import { describe, expect, it } from "vitest";

import * as drizzle from "../src/index";

describe("public API", () => {
  it("exposes the curated runtime surface", () => {
    expect(Object.keys(drizzle).sort()).toEqual([
      "builtinOperations",
      "filterResolver",
      "filterSchema",
      "flattenColumns",
      "getLikeStrategy",
      "multiFilterSchema",
      "safeForBuiltin",
      "sortResolver",
      "sortSchema",
      "sqlFilterForDialect",
      "sqlSort",
    ]);
  });
});
