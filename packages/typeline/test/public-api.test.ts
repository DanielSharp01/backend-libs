import { describe, expect, it } from "vitest";

import * as typeline from "../src/index";

describe("public API", () => {
  it("exports the supported runtime API", () => {
    expect(Object.keys(typeline).sort()).toEqual([
      "ConcurrencyTimeout",
      "DispatcherNoMatchError",
      "Semaphore",
      "TypelineError",
      "batcher",
      "branch",
      "branchOn",
      "branchOnContext",
      "catchErr",
      "concurrently",
      "dispatcher",
      "extendInput",
      "isPipelineStop",
      "mapDispatcher",
      "mergeInput",
      "moveInput",
      "omitInput",
      "pickInput",
      "predicateDispatcher",
      "selectInput",
      "stop",
      "tapInput",
      "typeline",
      "withMeta",
    ]);
  });
});
