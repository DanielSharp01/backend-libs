import { describe, expect, it, vi } from "vitest";

import { codecs } from "../src/codec";
import { hScan, sScan, scan, scanIterable, zScan } from "../src/scan";

describe("scan iterators", () => {
  it("walks pages from an initial cursor", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ cursor: "2", items: [1, 2] })
      .mockResolvedValueOnce({ cursor: "0", items: [3] });

    await expect(Array.fromAsync(scanIterable(readPage, "1"))).resolves.toEqual([1, 2, 3]);
    expect(readPage.mock.calls).toEqual([["1"], ["2"]]);
  });

  it("passes codecs and command options through collection helpers", async () => {
    const scalarCodec = codecs.number();
    const hashCodec = codecs.entries({ count: codecs.number() }).object();
    const connection = {
      scan: vi.fn(async () => ({ cursor: "0", items: ["key"] })),
      hScan: vi.fn(async () => ({ cursor: "0", items: [["count", 1] as const] })),
      sScan: vi.fn(async () => ({ cursor: "0", items: [2] })),
      zScan: vi.fn(async () => ({ cursor: "0", items: [{ value: 3, score: 4 }] })),
    };

    await expect(Array.fromAsync(scan(connection, { initialCursor: "5", match: "*" }))).resolves.toEqual(["key"]);
    await expect(Array.fromAsync(hScan(connection as any, "hash", hashCodec, { count: 2 }))).resolves.toEqual([
      ["count", 1],
    ]);
    await expect(Array.fromAsync(sScan(connection as any, "set", scalarCodec, { count: 3 }))).resolves.toEqual([2]);
    await expect(Array.fromAsync(zScan(connection as any, "zset", scalarCodec))).resolves.toEqual([
      { value: 3, score: 4 },
    ]);

    expect(connection.scan).toHaveBeenCalledWith("5", { match: "*" });
    expect(connection.hScan).toHaveBeenCalledWith("hash", "0", hashCodec, { count: 2 });
    expect(connection.sScan).toHaveBeenCalledWith("set", "0", scalarCodec, { count: 3 });
  });
});
