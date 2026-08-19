import { describe, expect, it, vi } from "vitest";

import { codecs } from "../../src/codec";
import { connectionStream, transactionStream, type RedisStreamClient } from "../../src/operations/stream";
import { execTransactionOperations, transactionOperations } from "../../src/transaction";

const eventCodec = codecs.json<{ type: string; count: number }>();
const streamsCodec = codecs.entries({ events: eventCodec, logs: codecs.string() }).entries();

describe("stream Redis operations", () => {
  it("uses a scalar codec for known-stream writes and reads", async () => {
    const client = {
      xAdd: vi.fn(async () => "1-0"),
      xRange: vi.fn(async () => [{ id: "1-0", message: { value: '{"type":"up","count":1}' } }]),
    } as unknown as RedisStreamClient;
    const connection = connectionStream(client, { scope: "tenant" });

    await expect(connection.xAdd("events", { type: "up", count: 1 }, eventCodec)).resolves.toBe("1-0");
    await expect(connection.xRange("events", "-", "+", eventCodec)).resolves.toEqual([
      { id: "1-0", value: { type: "up", count: 1 } },
    ]);
    expect(client.xAdd).toHaveBeenCalledWith("tenant.events", "*", { value: '{"type":"up","count":1}' }, undefined);
  });

  it("uses an entries codec for multi-stream reads and group reads", async () => {
    const client = {
      xRead: vi.fn(async () => [
        {
          name: "tenant.events",
          messages: [{ id: "2-0", message: new Map([["value", '{"type":"down","count":2}']]) }],
        },
        { name: "tenant.logs", messages: [{ id: "3-0", message: ["value", "ready"] }] },
      ]),
      xReadGroup: vi.fn(async () => [
        {
          name: "tenant.events",
          messages: [
            { id: "4-0", message: null },
            { id: "5-0", message: { value: '{"type":"group","count":5}' } },
          ],
        },
      ]),
    } as unknown as RedisStreamClient;
    const connection = connectionStream(client, { scope: "tenant" });

    await expect(
      connection.xRead(
        [
          { key: "events", after: "0" },
          { key: "logs", after: "$" },
        ],
        streamsCodec,
        { count: 2 },
      ),
    ).resolves.toEqual([
      { key: "events", entries: [{ id: "2-0", value: { type: "down", count: 2 } }] },
      { key: "logs", entries: [{ id: "3-0", value: "ready" }] },
    ]);
    await expect(
      connection.xReadGroup("group", "worker", { key: "events", after: ">" }, streamsCodec),
    ).resolves.toEqual([
      {
        key: "events",
        entries: [
          { id: "4-0", value: null },
          { id: "5-0", value: { type: "group", count: 5 } },
        ],
      },
    ]);
    expect(client.xRead).toHaveBeenCalledWith(
      [
        { key: "tenant.events", id: "0" },
        { key: "tenant.logs", id: "$" },
      ],
      { COUNT: 2 },
    );
  });

  it("normalizes XINFO STREAM FULL with a scalar codec", async () => {
    const sendCommand = vi.fn(async () => [
      "length",
      1,
      "radix-tree-keys",
      1,
      "radix-tree-nodes",
      2,
      "last-generated-id",
      "1-0",
      "max-deleted-entry-id",
      "0-0",
      "entries-added",
      1,
      "recorded-first-entry-id",
      "1-0",
      "entries",
      [["1-0", ["value", '{"type":"up","count":1}']]],
      "groups",
      [],
    ]);
    const connection = connectionStream({ sendCommand } as unknown as RedisStreamClient, { scope: "tenant" });

    await expect(connection.xInfoStream("events", eventCodec, { full: true, count: 10 })).resolves.toMatchObject({
      length: 1,
      entries: [{ id: "1-0", value: { type: "up", count: 1 } }],
      groups: [],
    });
    expect(sendCommand).toHaveBeenCalledWith(["XINFO", "STREAM", "tenant.events", "FULL", "COUNT", "10"]);
  });

  it("applies codecs to queued writes and group reads", async () => {
    const multi = {
      xAdd() {
        return this;
      },
      xReadGroup() {
        return this;
      },
      async exec() {
        return ["6-0", [{ name: "tenant.logs", messages: [{ id: "6-0", message: { value: "queued" } }] }]];
      },
    };
    const operations = transactionOperations();
    transactionStream(operations, { scope: "tenant" })
      .xAdd("events", { type: "queued", count: 6 }, eventCodec)
      .xReadGroup("group", "worker", { key: "logs", after: ">" }, streamsCodec);

    await expect(execTransactionOperations({ multi: () => multi } as any, operations)).resolves.toEqual([
      "6-0",
      [{ key: "logs", entries: [{ id: "6-0", value: "queued" }] }],
    ]);
  });
});
