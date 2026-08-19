import { describe, expect, it, vi } from "vitest";

import { codecs } from "../../src/codec";
import { connectionHash, transactionHash, type RedisHashClient } from "../../src/operations/hash";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

const profileCodec = codecs.entries({ name: codecs.string(), age: codecs.number() }).object();

describe("hash Redis operations", () => {
  it("uses an entries codec for field and whole-hash reads", async () => {
    const client = {
      hGet: vi.fn(async () => "42"),
      hmGet: vi.fn(async () => ["Ada", "42"]),
      hGetAll: vi.fn(async () => ({ name: "Ada", age: "42" })),
      hVals: vi.fn(),
    } as unknown as RedisHashClient;
    const connection = connectionHash(client, { scope: "tenant" });

    await expect(connection.hGet("profile", "age", profileCodec)).resolves.toBe(42);
    await expect(connection.hMGet("profile", ["name", "age"], profileCodec)).resolves.toEqual({
      name: "Ada",
      age: 42,
    });
    await expect(connection.hGetAll("profile", profileCodec)).resolves.toEqual({ name: "Ada", age: 42 });
    await expect(connection.hVals("profile", profileCodec)).resolves.toEqual(["Ada", 42]);
    expect(client.hGet).toHaveBeenCalledWith("tenant.profile", "age");
  });

  it("encodes hash writes through the entries codec", async () => {
    const hSet = vi.fn(async () => 2);
    const sendCommand = vi.fn(async () => "1");
    const client = { hSet, hSetNX: vi.fn(async () => 1), sendCommand } as unknown as RedisHashClient;
    const connection = connectionHash(client, { scope: "tenant" });

    await expect(connection.hSet("profile", { name: "Ada", age: 42 }, profileCodec)).resolves.toBe(2);
    await expect(connection.hSetNx("profile", "age", 43, profileCodec)).resolves.toBe(true);
    await expect(
      connection.hSetEx("profile", { name: "Grace", age: 44 }, profileCodec, {
        condition: "NX",
        expiration: { type: "PX", value: 500 },
      }),
    ).resolves.toBe(true);

    expect(hSet).toHaveBeenCalledWith("tenant.profile", [
      ["name", "Ada"],
      ["age", "42"],
    ]);
    expect(sendCommand).toHaveBeenCalledWith([
      "HSETEX",
      "tenant.profile",
      "NX",
      "PX",
      "500",
      "FIELDS",
      "2",
      "name",
      "Grace",
      "age",
      "44",
    ]);
  });

  it("decodes scans and maps field TTL replies", async () => {
    const client = {
      hScan: vi.fn(async () => ({
        cursor: "0",
        entries: [
          { field: "name", value: "Ada" },
          { field: "age", value: "42" },
        ],
      })),
      hScanNoValues: vi.fn(async () => ({ cursor: "0", fields: ["name", "age"] })),
      hTTL: vi.fn(async () => [-1, -2]),
    } as unknown as RedisHashClient;
    const connection = connectionHash(client);

    await expect(connection.hScan("profile", "0", profileCodec)).resolves.toEqual({
      cursor: "0",
      items: [
        ["name", "Ada"],
        ["age", 42],
      ],
    });
    await expect(connection.hScan("profile", "0", undefined, { noValues: true })).resolves.toEqual({
      cursor: "0",
      items: ["name", "age"],
    });
    await expect(connection.hTtl("profile", ["name", "age"])).resolves.toEqual({
      name: "no-expiry",
      age: null,
    });
  });

  it("applies the same codec transforms to transactions", async () => {
    const calls: unknown[] = [];
    const multi = {
      hSet(key: string, entries: [string, string][]) {
        calls.push(["hSet", key, entries]);
        return this;
      },
      hGet(key: string, field: string) {
        calls.push(["hGet", key, field]);
        return this;
      },
      hGetAll(key: string) {
        calls.push(["hGetAll", key]);
        return this;
      },
      async exec() {
        return [2, "45", { name: "Lin", age: "45" }];
      },
    };
    const operations = transactionOperations();
    transactionHash(operations, { scope: "tenant" })
      .hSet("profile", { name: "Lin", age: 45 }, profileCodec)
      .hGet("profile", "age", profileCodec)
      .hGetAll("profile", profileCodec);

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([
      2,
      45,
      { name: "Lin", age: 45 },
    ]);
    expect(calls[0]).toEqual([
      "hSet",
      "tenant.profile",
      [
        ["name", "Lin"],
        ["age", "45"],
      ],
    ]);
  });
});
