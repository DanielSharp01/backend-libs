import { describe, expect, it, vi } from "vitest";

import { codecs } from "../../src/codec";
import { connectionZSet, transactionZSet, type RedisZSetClient } from "../../src/operations/zset";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

const memberCodec = codecs.json<{ id: number }>();
const setsCodec = codecs.entries({ scores: memberCodec, labels: codecs.string() }).entries();

describe("sorted-set Redis operations", () => {
  it("uses a scalar codec for known-key member commands", async () => {
    const client = {
      zAdd: vi.fn(async () => 1),
      zRangeWithScores: vi.fn(async () => [{ value: '{"id":1}', score: 2 }]),
      zScan: vi.fn(async () => ({ cursor: "0", members: [{ value: '{"id":2}', score: 3 }] })),
    } as unknown as RedisZSetClient;
    const connection = connectionZSet(client, { scope: "tenant" });

    await expect(connection.zAdd("scores", { value: { id: 1 }, score: 2 }, memberCodec)).resolves.toBe(1);
    await expect(
      connection.zRange("scores", { by: "rank", start: 0, stop: -1 }, memberCodec, { withScores: true }),
    ).resolves.toEqual([{ value: { id: 1 }, score: 2 }]);
    await expect(connection.zScan("scores", "0", memberCodec)).resolves.toEqual({
      cursor: "0",
      items: [{ value: { id: 2 }, score: 3 }],
    });
    expect(client.zAdd).toHaveBeenCalledWith("tenant.scores", [{ value: '{"id":1}', score: 2 }], undefined);
  });

  it("uses an entries codec for ZMPOP and BZMPOP", async () => {
    const client = {
      zmPop: vi.fn(async () => ({
        key: "tenant.scores",
        members: [{ value: '{"id":3}', score: 4 }],
      })),
      bzmPop: vi.fn(async () => ({
        key: "tenant.labels",
        members: [{ value: "ready", score: 5 }],
      })),
    } as unknown as RedisZSetClient;
    const connection = connectionZSet(client, { scope: "tenant" });

    await expect(connection.zMPop(["scores", "labels"], "MIN", setsCodec, 1)).resolves.toEqual({
      key: "scores",
      entries: [{ value: { id: 3 }, score: 4 }],
    });
    await expect(connection.bzMPop(["scores", "labels"], "MAX", 5, setsCodec, 1)).resolves.toEqual({
      key: "labels",
      entries: [{ value: "ready", score: 5 }],
    });
    expect(client.bzmPop).toHaveBeenCalledWith(5, ["tenant.scores", "tenant.labels"], "MAX", { COUNT: 1 });
  });

  it("decodes queued scored and runtime-key replies", async () => {
    const multi = {
      zRangeWithScores() {
        return this;
      },
      bzmPop() {
        return this;
      },
      async exec() {
        return [[{ value: '{"id":7}', score: 8 }], { key: "tenant.labels", members: [{ value: "queued", score: 9 }] }];
      },
    };
    const operations = transactionOperations();
    transactionZSet(operations, { scope: "tenant" })
      .zRange("scores", { by: "rank", start: 0, stop: -1 }, memberCodec, { withScores: true })
      .bzMPop(["scores", "labels"], "MIN", 2, setsCodec, 1);

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([
      [{ value: { id: 7 }, score: 8 }],
      { key: "labels", entries: [{ value: "queued", score: 9 }] },
    ]);
  });
});
