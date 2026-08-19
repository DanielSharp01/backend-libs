import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { BodySizeError, HeaderFormatError } from "../src/errors";
import { httpRequest, parseHttpCookies, setRequestDefaults } from "../src/request";

describe("HTTP request", () => {
  it("starts with a safe body-size default and applies partial request defaults in place", () => {
    const req = request();
    const input = { marker: true };

    expect(req.defaults).toEqual({ bodySize: 100 * 1024 });
    expect(setRequestDefaults({ bodySize: null })(input, { req })).toBe(input);
    expect(req.defaults).toEqual({ bodySize: null });
  });

  it("rejects invalid request defaults", () => {
    expect(() => setRequestDefaults({ bodySize: -1 })).toThrow(TypeError);
    expect(() => setRequestDefaults({ bodySize: 1.5 })).toThrow(TypeError);
  });

  it("exposes request headers through a read-only case-insensitive lowercase-keyed map", () => {
    const req = request([], { "x-api-key": "secret" });

    expect(req.headers["X-API-Key"]).toBe("secret");
    expect("X-API-Key" in req.headers).toBe(true);
    expect(Object.keys(req.headers)).toEqual(["x-api-key"]);
    expect(Object.isFrozen(req.headers)).toBe(true);
  });

  it("enforces body size without caching partial bytes", async () => {
    const req = request(["123", "45"]);
    setRequestDefaults({ bodySize: 4 })({}, { req });

    await expect(req.readBody()).rejects.toMatchObject({
      code: BodySizeError.code,
      maximumBodySize: 4,
    });
    expect(req.body).toBeUndefined();
  });

  it("allows an explicitly unlimited body and caches its exact bytes", async () => {
    const req = request(["123", "45"]);
    setRequestDefaults({ bodySize: null })({}, { req });

    await expect(req.readBody()).resolves.toEqual(Buffer.from("12345"));
    expect(req.body).toEqual(Buffer.from("12345"));
  });

  it("keeps the first duplicate cookie value", () => {
    expect(parseHttpCookies("session=first; session=second")).toEqual({ session: "first" });
  });

  it("preserves malformed percent encoding as its raw cookie value", () => {
    expect(parseHttpCookies("session=%E0%A4%A")).toEqual({ session: "%E0%A4%A" });
  });

  it("rejects a structurally malformed cookie header", () => {
    expect(() => parseHttpCookies("session=valid; malformed")).toThrow(
      expect.objectContaining({ code: HeaderFormatError.code, headerName: "cookie" }),
    );
  });
});

function request(chunks: string[] = [], headers: IncomingMessage["headers"] = {}) {
  const raw = Object.assign(Readable.from(chunks), {
    headers,
    method: "POST",
    socket: {},
    url: "/",
  }) as unknown as IncomingMessage;
  return httpRequest(raw);
}
