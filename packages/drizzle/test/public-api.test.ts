import { describe, expect, it } from "vitest";

import * as drizzle from "../src/index";

describe("public API", () => {
  it("exposes the curated runtime surface", () => {
    expect(Object.keys(drizzle).sort()).toEqual([
      "builtinOperationForSchema",
      "builtinOperations",
      "filterResolver",
      "filterSchema",
      "flattenColumns",
      "getLikeStrategy",
      "multiFilterSchema",
      "sortResolver",
      "sortSchema",
      "sqlFilterForDialect",
      "sqlSort",
    ]);
  });
});
