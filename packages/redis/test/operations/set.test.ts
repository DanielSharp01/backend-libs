import { describe, expect, it, vi } from "vitest";

import { codecs } from "../../src/codec";
import { transactionList } from "../../src/operations/list";
import { connectionSet, transactionSet, type RedisSetClient } from "../../src/operations/set";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

const itemCodec = codecs.json<{ id: number }>();

describe("set Redis operations", () => {
  it("encodes members, scopes keys, and decodes results", async () => {
    const client = {
      sAdd: vi.fn(async () => 2),
      sMembers: vi.fn(async () => ['{"id":1}']),
      sScan: vi.fn(async () => ({ cursor: "0", members: ['{"id":2}'] })),
      sIsMember: vi.fn(async () => 1),
      sDiff: vi.fn(async () => ['{"id":3}']),
    } as unknown as RedisSetClient;
    const connection = connectionSet(client, { scope: "tenant" });

    await expect(connection.sAdd("objects", [{ id: 1 }, { id: 2 }], itemCodec)).resolves.toBe(2);
    await expect(connection.sMembers("objects", itemCodec)).resolves.toEqual([{ id: 1 }]);
    await expect(connection.sScan("objects", "0", itemCodec, { match: "*", count: 5 })).resolves.toEqual({
      cursor: "0",
      items: [{ id: 2 }],
    });
    await expect(connection.sIsMember("objects", { id: 1 }, itemCodec)).resolves.toBe(true);
    await expect(connection.sDiff(["left", "right"], itemCodec)).resolves.toEqual([{ id: 3 }]);

    expect(client.sAdd).toHaveBeenCalledWith("tenant.objects", ['{"id":1}', '{"id":2}']);
    expect(client.sScan).toHaveBeenCalledWith("tenant.objects", "0", { MATCH: "*", COUNT: 5 });
    expect(client.sDiff).toHaveBeenCalledWith(["tenant.left", "tenant.right"]);
  });

  it("applies codecs to queued replies", async () => {
    const calls: unknown[] = [];
    const multi = {
      sAdd(key: string, members: string[]) {
        calls.push(["sAdd", key, members]);
        return this;
      },
      sMembers(key: string) {
        calls.push(["sMembers", key]);
        return this;
      },
      sPop(key: string) {
        calls.push(["sPop", key]);
        return this;
      },
      async exec() {
        return [1, ['{"id":3}'], '{"id":4}'];
      },
    };
    const operations = transactionOperations();
    transactionSet(operations, { scope: "tenant" })
      .sAdd("objects", { id: 3 }, itemCodec)
      .sMembers("objects", itemCodec)
      .sPop("objects", itemCodec);

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([
      1,
      [{ id: 3 }],
      { id: 4 },
    ]);
    expect(calls).toEqual([
      ["sAdd", "tenant.objects", ['{"id":3}']],
      ["sMembers", "tenant.objects"],
      ["sPop", "tenant.objects"],
    ]);
  });

  it("returns the composed transaction receiver when chaining families", () => {
    const operations = transactionOperations();
    const transaction = {
      ...transactionSet(operations),
      ...transactionList(operations),
      exec: vi.fn(),
    };
    expect(transaction.sCard("tags")).toBe(transaction);
    expect(transaction.lLen("names")).toBe(transaction);
  });
});
