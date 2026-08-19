import { describe, expect, it, vi } from "vitest";

import { codecs } from "../../src/codec";
import { connectionList, transactionList, type RedisListClient } from "../../src/operations/list";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

const jobCodec = codecs.json<{ id: number }>();
const listsCodec = codecs.entries({ jobs: jobCodec, names: codecs.string() }).entries();

describe("list Redis operations", () => {
  it("defaults to strings and accepts a scalar codec for known-key commands", async () => {
    const client = {
      lPush: vi.fn(async () => 1),
      lRange: vi.fn(async () => ['{"id":1}']),
      lPop: vi.fn(async () => null),
      blPop: vi.fn(async () => ({ key: "tenant.jobs", element: '{"id":2}' })),
    } as unknown as RedisListClient;
    const connection = connectionList(client, { scope: "tenant" });

    await expect(connection.lPush("jobs", { id: 1 }, jobCodec)).resolves.toBe(1);
    await expect(connection.lRange("jobs", 0, -1, jobCodec)).resolves.toEqual([{ id: 1 }]);
    await expect(connection.lPop("jobs", undefined, jobCodec)).resolves.toBeNull();
    await expect(connection.blPop(["jobs", "names"], 1, jobCodec)).resolves.toEqual({
      key: "jobs",
      value: { id: 2 },
    });
    expect(client.lPush).toHaveBeenCalledWith("tenant.jobs", ['{"id":1}']);
  });

  it("uses an entries codec for MPOP replies selected by key", async () => {
    const client = {
      lmPop: vi.fn(async () => ["tenant.jobs", ['{"id":3}', '{"id":4}']]),
      blmPop: vi.fn(async () => ["tenant.names", ["Ada"]]),
    } as unknown as RedisListClient;
    const connection = connectionList(client, { scope: "tenant" });

    await expect(connection.lMPop(["jobs", "names"], "LEFT", listsCodec, 2)).resolves.toEqual({
      key: "jobs",
      values: [{ id: 3 }, { id: 4 }],
    });
    await expect(connection.blMPop(["jobs", "names"], "RIGHT", 5, listsCodec, 1)).resolves.toEqual({
      key: "names",
      values: ["Ada"],
    });
    expect(client.lmPop).toHaveBeenCalledWith(["tenant.jobs", "tenant.names"], "LEFT", { COUNT: 2 });
  });

  it("encodes queued writes and decodes queued replies", async () => {
    const calls: unknown[] = [];
    const multi = {
      lPush(key: string, values: string[]) {
        calls.push(["lPush", key, values]);
        return this;
      },
      lIndex(key: string, index: number) {
        calls.push(["lIndex", key, index]);
        return this;
      },
      lmPop(keys: string[], direction: string, opts: unknown) {
        calls.push(["lmPop", keys, direction, opts]);
        return this;
      },
      async exec() {
        return [1, '{"id":5}', ["tenant.names", ["Grace"]]];
      },
    };
    const operations = transactionOperations();
    transactionList(operations, { scope: "tenant" })
      .lPush("jobs", { id: 5 }, jobCodec)
      .lIndex("jobs", 0, jobCodec)
      .lMPop(["jobs", "names"], "LEFT", listsCodec, 1);

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([
      1,
      { id: 5 },
      { key: "names", values: ["Grace"] },
    ]);
    expect(calls[0]).toEqual(["lPush", "tenant.jobs", ['{"id":5}']]);
  });
});
