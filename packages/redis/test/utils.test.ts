import { describe, expect, it } from "vitest";

import {
  booleanReply,
  combineRedisScope,
  keysArgument,
  scopedKey,
  scopedPattern,
  ttlReply,
  tupleArgToArray,
  unscopedKey,
} from "../src/utils";

describe("Redis utilities", () => {
  it("normalizes tuple arguments", () => {
    expect(tupleArgToArray("one")).toEqual(["one"]);
    expect(tupleArgToArray(["one", "two"] as const)).toEqual(["one", "two"]);
  });

  it("scopes keys and patterns", () => {
    expect(combineRedisScope("app", "tenant")).toBe("app.tenant");
    expect(scopedKey("key", "app")).toBe("app.key");
    expect(keysArgument(["one", "two"], "app")).toEqual(["app.one", "app.two"]);
    expect(scopedPattern("item:*", "app[1]")).toBe("app\\[1\\].item:*");
    expect(unscopedKey("app.key", "app")).toBe("key");
  });

  it("normalizes Redis integer replies", () => {
    expect(booleanReply(1)).toBe(true);
    expect(booleanReply(0)).toBe(false);
    expect(ttlReply(-2)).toBeNull();
    expect(ttlReply(-1)).toBe("no-expiry");
    expect(ttlReply(10)).toBe(10);
  });
});
