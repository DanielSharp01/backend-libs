import { describe, expect, it, vi } from "vitest";

import { connectionGeneric, transactionGeneric, type RedisGenericClient } from "../../src/operations/generic";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

describe("generic Redis operations", () => {
  it("scopes key arguments and removes scope from returned keys", async () => {
    const client = {
      del: vi.fn(async () => 2),
      keys: vi.fn(async () => ["tenant.first", "tenant.second"]),
      scan: vi.fn(async () => ({ cursor: "0", keys: ["tenant.first"] })),
      exists: vi.fn(async () => 1),
      ttl: vi.fn(async () => -1),
    } as unknown as RedisGenericClient;
    const connection = connectionGeneric(client, { scope: "tenant" });

    await expect(connection.del(["first", "second"])).resolves.toBeUndefined();
    await expect(connection.keys("*")).resolves.toEqual(["first", "second"]);
    await expect(connection.scan("0", { match: "item:*", count: 5, type: "hash" })).resolves.toEqual({
      cursor: "0",
      items: ["first"],
    });
    await expect(connection.exists("first")).resolves.toBe(true);
    await expect(connection.ttl("first")).resolves.toBe("no-expiry");

    expect(client.del).toHaveBeenCalledWith(["tenant.first", "tenant.second"]);
    expect(client.scan).toHaveBeenCalledWith("0", { MATCH: "tenant.item:*", COUNT: 5, TYPE: "hash" });
  });

  it("transforms queued replies", async () => {
    const multi = {
      exists: vi.fn(function (this: unknown) {
        return this;
      }),
      ttl: vi.fn(function (this: unknown) {
        return this;
      }),
      keys: vi.fn(function (this: unknown) {
        return this;
      }),
      async exec() {
        return [1, -2, ["tenant.first"]];
      },
    };
    const operations = transactionOperations();
    transactionGeneric(operations, { scope: "tenant" }).exists("first").ttl("missing").keys("*");

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([
      true,
      null,
      ["first"],
    ]);
  });
});
