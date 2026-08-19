import { describe, expect, it, vi } from "vitest";

import { codecs } from "../src/codec";
import { consumeGroup, consumeStream, toNodeReadable } from "../src/stream";

const streamCodec = codecs.entries({ events: codecs.json<{ id: number }>() }).entries();

describe("stream consumers", () => {
  it("advances stream positions between reads", async () => {
    const controller = new AbortController();
    let receivedPositions: unknown;
    const xRead = vi.fn(async (positions: unknown) => {
      receivedPositions = structuredClone(positions);
      return [
        {
          key: "events",
          entries: [{ id: "1-0", value: { id: 1 } }],
        },
      ];
    });
    const iterator = consumeStream({ xRead } as any, { key: "events", after: "0-0" }, streamCodec, {
      blockMs: 25,
      signal: controller.signal,
    });

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { key: "events", entries: [{ id: "1-0", value: { id: 1 } }] },
    });
    controller.abort();
    await iterator.return(undefined);
    expect(receivedPositions).toEqual([{ key: "events", after: "0-0" }]);
    expect(xRead.mock.calls[0]?.slice(1)).toEqual([streamCodec, { blockMs: 25 }]);
  });

  it("builds group positions and options", async () => {
    const controller = new AbortController();
    const xReadGroup = vi.fn(async () => [{ key: "events", entries: [] }]);
    const iterator = consumeGroup({ xReadGroup } as any, ["events"] as const, streamCodec, {
      group: "workers",
      consumer: "one",
      count: 2,
      noAck: true,
      signal: controller.signal,
    });

    await iterator.next();
    controller.abort();
    await iterator.return(undefined);
    expect(xReadGroup).toHaveBeenCalledWith("workers", "one", [{ key: "events", after: ">" }], streamCodec, {
      blockMs: 5_000,
      count: 2,
      noAck: true,
    });
  });

  it("creates object-mode Node streams", () => {
    expect(
      toNodeReadable(
        (async function* () {
          yield { id: 1 };
        })(),
      ).readableObjectMode,
    ).toBe(true);
  });
});
