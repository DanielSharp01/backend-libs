import { describe, expect, it } from "vitest";

import * as common from "../src/index";

describe("public API", () => {
  it("exposes the curated runtime surface", () => {
    expect(Object.keys(common).sort()).toEqual([
      "addUnique",
      "capitalize",
      "consoleLogger",
      "err",
      "groupManyToMap",
      "groupToMap",
      "isErr",
      "isKeyOf",
      "isOk",
      "logger",
      "mask",
      "maskOut",
      "ok",
      "omit",
      "omitFalsy",
      "omitNullish",
      "omitUndefined",
      "pick",
      "unique",
    ]);
  });
});
