import { describe, expect, it } from "vitest";

import * as redis from "../src/index";

describe("public API", () => {
  it("exports codec-based connection, subscriber, scan, and stream APIs", () => {
    expect(redis.codecs).toBeDefined();
    expect(redis.createRedisConnection).toBeTypeOf("function");
    expect(redis.createRedisSubscriber).toBeTypeOf("function");
    expect(redis.scan).toBeTypeOf("function");
    expect(redis.consumeStream).toBeTypeOf("function");
  });
});
