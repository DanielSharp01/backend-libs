import { describe, expect, it, vi } from "vitest";

import { codecs } from "../../src/codec";
import { connectionPublish, transactionPublish, type RedisPublishClient } from "../../src/operations/publish";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

describe("publish Redis operations", () => {
  it("encodes messages and scopes channels", async () => {
    const client = { publish: vi.fn(async () => 2) } as unknown as RedisPublishClient;
    const connection = connectionPublish(client, { scope: "tenant" });

    await expect(connection.publish("updated", { id: 1 }, codecs.json<{ id: number }>())).resolves.toBe(2);
    expect(client.publish).toHaveBeenCalledWith("tenant.updated", '{"id":1}');
  });

  it("queues encoded messages", async () => {
    const multi = {
      publish: vi.fn(function (this: unknown) {
        return this;
      }),
      async exec() {
        return [3];
      },
    };
    const operations = transactionOperations();
    transactionPublish(operations, { scope: "tenant" }).publish("updated", { id: 1 }, codecs.json<{ id: number }>());

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([3]);
    expect(multi.publish).toHaveBeenCalledWith("tenant.updated", '{"id":1}');
  });
});
