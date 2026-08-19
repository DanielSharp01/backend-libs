import { describe, expect, it, vi } from "vitest";

import { codecs, createRedisConnection } from "../src/index";

describe("Redis connection", () => {
  it("registers errors and composes scoped views", async () => {
    const onError = vi.fn();
    const client = {
      on: vi.fn(),
      get: vi.fn(async () => '{"id":1}'),
    };
    const connection = createRedisConnection(client as any, { onError, scope: "app" });

    await expect(connection.scope("tenant").get("profile", codecs.json<{ id: number }>())).resolves.toEqual({
      id: 1,
    });
    expect(client.on).toHaveBeenCalledWith("error", onError);
    expect(client.get).toHaveBeenCalledWith("app.tenant.profile");
  });

  it("creates executable transactions", async () => {
    const multi = {
      get: vi.fn(function (this: unknown) {
        return this;
      }),
      async exec() {
        return ["42"];
      },
    };
    const client = { on: vi.fn(), multi: () => multi };
    const connection = createRedisConnection(client as any, { onError: vi.fn(), scope: "app" });

    await expect(connection.multi().get("count", codecs.number()).exec()).resolves.toEqual([42]);
    expect(multi.get).toHaveBeenCalledWith("app.count");
  });
});
