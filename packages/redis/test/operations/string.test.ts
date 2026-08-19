import { describe, expect, it, vi } from "vitest";

import { codecs } from "../../src/codec";
import { connectionString, transactionString, type RedisStringClient } from "../../src/operations/string";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

const valueCodec = codecs.json<{ id: number }>();
const valuesCodec = codecs.entries({ raw: codecs.string(), count: codecs.number() }).object();

describe("string Redis operations", () => {
  it("applies scalar codecs to reads and writes", async () => {
    const client = {
      get: vi.fn(async () => '{"id":1}'),
      set: vi.fn(async () => "OK"),
      getDel: vi.fn(async () => null),
    } as unknown as RedisStringClient;
    const connection = connectionString(client, { scope: "tenant" });

    await expect(connection.get("item", valueCodec)).resolves.toEqual({ id: 1 });
    await expect(
      connection.set("item", { id: 2 }, valueCodec, {
        condition: "IFEQ",
        matchValue: { id: 1 },
      }),
    ).resolves.toBeUndefined();
    await expect(connection.getDel("missing", valueCodec)).resolves.toBeNull();

    expect(client.get).toHaveBeenCalledWith("tenant.item");
    expect(client.set).toHaveBeenCalledWith("tenant.item", '{"id":2}', {
      condition: "IFEQ",
      matchValue: '{"id":1}',
    });
  });

  it("uses entries codecs for multi-key reads and writes", async () => {
    const client = {
      mGet: vi.fn(async () => ["value", "42"]),
      mSet: vi.fn(async () => "OK"),
    } as unknown as RedisStringClient;
    const connection = connectionString(client, { scope: "tenant" });

    await expect(connection.mGet(["raw", "count"] as const, valuesCodec)).resolves.toEqual({
      raw: "value",
      count: 42,
    });
    await expect(connection.mSet({ raw: "next", count: 43 }, valuesCodec)).resolves.toBeUndefined();

    expect(client.mGet).toHaveBeenCalledWith(["tenant.raw", "tenant.count"]);
    expect(client.mSet).toHaveBeenCalledWith([
      ["tenant.raw", "next"],
      ["tenant.count", "43"],
    ]);
  });

  it("decodes transaction replies with the same codecs", async () => {
    const multi = {
      get: vi.fn(function (this: unknown) {
        return this;
      }),
      mGet: vi.fn(function (this: unknown) {
        return this;
      }),
      set: vi.fn(function (this: unknown) {
        return this;
      }),
      async exec() {
        return ['{"id":1}', ["value", "42"], null];
      },
    };
    const operations = transactionOperations();
    transactionString(operations, { scope: "tenant" })
      .get("item", valueCodec)
      .mGet(["raw", "count"], valuesCodec)
      .getThenSet("item", { id: 2 }, valueCodec);

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([
      { id: 1 },
      { raw: "value", count: 42 },
      null,
    ]);
  });
});
