import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  ConnectionAbortedError,
  FileNotFoundError,
  InvalidResponseHeadersError,
  ResponseAlreadyCommittedError,
  ResponseAlreadyEndedError,
} from "../src/errors";
import { httpResponse } from "../src/response";

describe("HTTP response", () => {
  it("flushes headers explicitly and remains chainable", () => {
    const raw = writableResponse();
    const response = httpResponse(raw.value);

    expect(response.flushHeaders()).toBe(response);
    expect(response.flushHeaders()).toBe(response);
    expect(raw.flushHeaders).toHaveBeenCalledTimes(2);
  });

  it("classifies invalid response headers separately from connection abortions", () => {
    const failure = new Error("headers already sent");
    const raw = writableResponse();
    raw.flushHeaders.mockImplementation(() => {
      throw failure;
    });

    expect(() => httpResponse(raw.value).flushHeaders()).toThrow(
      expect.objectContaining({ code: InvalidResponseHeadersError.code, cause: failure }),
    );
  });

  it("rejects flushing an already-ended response as a bad call", () => {
    const raw = writableResponse();
    raw.value.end();

    expect(() => httpResponse(raw.value).flushHeaders()).toThrow(
      expect.objectContaining({ code: ResponseAlreadyEndedError.code }),
    );
    expect(raw.flushHeaders).not.toHaveBeenCalled();
  });

  it("classifies flushing a destroyed response as a connection abortion", () => {
    const raw = writableResponse();
    raw.value.destroy();

    expect(() => httpResponse(raw.value).flushHeaders()).toThrow(
      expect.objectContaining({ code: ConnectionAbortedError.code }),
    );
    expect(raw.flushHeaders).not.toHaveBeenCalled();
  });

  it("rejects header mutations after headers have been flushed", () => {
    const raw = writableResponse();
    const response = httpResponse(raw.value);
    response.flushHeaders();

    expect(() => response.status(201)).toThrow(expect.objectContaining({ code: ResponseAlreadyCommittedError.code }));
    expect(() => response.header("x-late", "value")).toThrow(
      expect.objectContaining({ code: ResponseAlreadyCommittedError.code }),
    );
    expect(() => response.cookie("late", "value")).toThrow(
      expect.objectContaining({ code: ResponseAlreadyCommittedError.code }),
    );
    expect(raw.headers.has("x-late")).toBe(false);
    expect(raw.headers.has("set-cookie")).toBe(false);
  });

  it("destroys only an incomplete response", () => {
    const open = writableResponse();
    httpResponse(open.value).destroy();
    expect(open.value.destroyed).toBe(true);

    const ended = writableResponse();
    ended.value.end();
    httpResponse(ended.value).destroy();
    expect(ended.value.destroyed).toBe(false);
  });

  it("classifies unsendable state while preserving its cause", () => {
    const cause = new Error("application failed");

    const committedRaw = writableResponse();
    const committed = httpResponse(committedRaw.value);
    committed.flushHeaders();
    expect(committed.wrapUnsendable(cause)).toMatchObject({
      code: ResponseAlreadyCommittedError.code,
      cause,
    });

    const open = httpResponse(writableResponse().value);
    expect(open.wrapUnsendable(cause)).toBeUndefined();
  });

  it("waits for a written chunk to be handled", async () => {
    let handleChunk: ((error?: Error | null) => void) | undefined;
    const raw = writableResponse((_chunk, callback) => {
      handleChunk = callback;
    });
    const response = httpResponse(raw.value);
    let settled = false;

    const writing = response.write("data: hello\n\n").then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    handleChunk?.();
    await writing;
    expect(settled).toBe(true);
  });

  it("rejects when writing a chunk fails", async () => {
    const failure = new Error("write failed");
    const raw = writableResponse((_chunk, callback) => callback(failure));

    await expect(httpResponse(raw.value).write("event")).rejects.toMatchObject({
      code: ConnectionAbortedError.code,
      cause: failure,
    });
  });

  it("rejects synchronous write failures without retaining its error listener", async () => {
    const failure = new Error("response already ended");
    const raw = writableResponse();
    vi.spyOn(raw.value, "write").mockImplementation(() => {
      throw failure;
    });

    await expect(httpResponse(raw.value).write("event")).rejects.toMatchObject({
      code: ConnectionAbortedError.code,
      cause: failure,
    });
    expect(raw.value.listenerCount("error")).toBe(0);
  });

  it("turns synchronous send failures into connection abortions", () => {
    const failure = new Error("serialization failed");
    const raw = writableResponse();

    expect(() =>
      httpResponse(raw.value).send({
        toJSON() {
          throw failure;
        },
      }),
    ).toThrow(expect.objectContaining({ code: ConnectionAbortedError.code, cause: failure }));
    expect(raw.value.destroyed).toBe(true);
  });

  it("sends undefined, text, scalars, and bytes explicitly", () => {
    const cases: Array<readonly [unknown, string]> = [
      [undefined, ""],
      ["hello", "hello"],
      [42, "42"],
      [true, "true"],
      [12n, "12"],
      [new Uint8Array([0, 1, 255]), "0001ff"],
      [Buffer.from([255, 1, 0]), "ff0100"],
    ];

    for (const [output, expected] of cases) {
      const raw = writableResponse();
      const response = httpResponse(raw.value);

      expect(response.send(output)).toBe(response);
      expect(output instanceof Uint8Array ? raw.body().toString("hex") : raw.body().toString()).toBe(expected);
      expect(raw.value.writableEnded).toBe(true);
    }
  });

  it("sends objects, arrays, and null as JSON", () => {
    for (const output of [{ value: 1 }, ["first", "second"], null]) {
      const raw = writableResponse();

      httpResponse(raw.value).send(output);

      expect(raw.body().toString()).toBe(JSON.stringify(output));
      expect(raw.headers.get("content-type")).toBe("application/json; charset=utf-8");
    }
  });

  it("redirects with an empty response and remains chainable", () => {
    const defaultRaw = writableResponse();
    const defaultRedirect = httpResponse(defaultRaw.value);

    expect(defaultRedirect.redirect("/login")).toBe(defaultRedirect);
    expect(defaultRaw.value.statusCode).toBe(302);
    expect(defaultRaw.headers.get("location")).toBe("/login");
    expect(defaultRaw.body()).toHaveLength(0);
    expect(defaultRaw.value.writableEnded).toBe(true);

    const explicitRaw = writableResponse();
    httpResponse(explicitRaw.value).redirect("https://example.com/next", 303);
    expect(explicitRaw.value.statusCode).toBe(303);
    expect(explicitRaw.headers.get("location")).toBe("https://example.com/next");
  });

  it("rejects unsupported redirect statuses before changing the response", () => {
    const raw = writableResponse();

    expect(() => httpResponse(raw.value).redirect("/unchanged", 304 as never)).toThrow(
      "HTTP redirect status must be 301, 302, 303, 307, or 308.",
    );
    expect(raw.headers.has("location")).toBe(false);
    expect(raw.value.writableEnded).toBe(false);
  });

  it("preserves an explicitly selected content type for JSON values", () => {
    const raw = writableResponse();

    httpResponse(raw.value).header("content-type", "application/problem+json").send({ error: "broken" });

    expect(raw.body().toString()).toBe('{"error":"broken"}');
    expect(raw.headers.get("content-type")).toBe("application/problem+json");
  });

  it("turns nested bigint JSON failures into connection abortions", () => {
    const raw = writableResponse();

    expect(() => httpResponse(raw.value).send({ value: 1n })).toThrow(
      expect.objectContaining({ code: ConnectionAbortedError.code, cause: expect.any(TypeError) }),
    );
  });

  it("rejects body operations after the response has ended", async () => {
    const sendRaw = writableResponse();
    sendRaw.value.end();
    expect(() => httpResponse(sendRaw.value).send("late")).toThrow(
      expect.objectContaining({ code: ResponseAlreadyEndedError.code }),
    );

    const writeRaw = writableResponse();
    writeRaw.value.end();
    await expect(httpResponse(writeRaw.value).write("late")).rejects.toMatchObject({
      code: ResponseAlreadyEndedError.code,
    });

    const pipeRaw = writableResponse();
    pipeRaw.value.end();
    await expect(httpResponse(pipeRaw.value).sendStream(Readable.from(["late"]))).rejects.toMatchObject({
      code: ResponseAlreadyEndedError.code,
    });
  });

  it("rejects body operations after the response is destroyed", async () => {
    const sendRaw = writableResponse();
    sendRaw.value.destroy();
    expect(() => httpResponse(sendRaw.value).send("late")).toThrow(
      expect.objectContaining({ code: ConnectionAbortedError.code }),
    );

    const writeRaw = writableResponse();
    writeRaw.value.destroy();
    await expect(httpResponse(writeRaw.value).write("late")).rejects.toMatchObject({
      code: ConnectionAbortedError.code,
    });

    const pipeRaw = writableResponse();
    pipeRaw.value.destroy();
    await expect(httpResponse(pipeRaw.value).sendStream(Readable.from(["late"]))).rejects.toMatchObject({
      code: ConnectionAbortedError.code,
    });
  });

  it("flushes headers before sending a stream", async () => {
    let headersWereFlushed = false;
    const raw = writableResponse((_chunk, callback) => {
      headersWereFlushed = raw.flushHeaders.mock.calls.length > 0;
      callback();
    });

    await httpResponse(raw.value).sendStream(Readable.from(["streamed"]));

    expect(headersWereFlushed).toBe(true);
    expect(raw.flushHeaders).toHaveBeenCalledOnce();
  });

  it("sends a root-bound file with inferred response headers", async () => {
    await withTemporaryDirectory(async (root) => {
      const assets = join(root, "assets");
      await mkdir(assets);
      await writeFile(join(assets, "app.js"), "console.log('hello');");
      const raw = writableResponse();

      await httpResponse(raw.value).sendFile("assets/app.js", { root });

      expect(raw.body().toString()).toBe("console.log('hello');");
      expect(raw.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
      expect(raw.headers.get("content-length")).toBe(21);
      expect(raw.flushHeaders).toHaveBeenCalledOnce();
    });
  });

  it("preserves response headers selected before sending a file", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFile(join(root, "asset.unknown"), "content");
      const raw = writableResponse();

      await httpResponse(raw.value)
        .header("content-type", "application/custom")
        .header("content-length", 7)
        .sendFile("asset.unknown", { root });

      expect(raw.headers.get("content-type")).toBe("application/custom");
      expect(raw.headers.get("content-length")).toBe(7);
    });
  });

  it("rejects missing, non-file, and root-escaping paths before committing the response", async () => {
    await withTemporaryDirectory(async (parent) => {
      const root = join(parent, "public");
      await mkdir(root);
      await mkdir(join(root, "directory"));
      await writeFile(join(parent, "private.txt"), "private");

      for (const path of ["missing.txt", "directory", "../private.txt", "bad\0path"]) {
        const raw = writableResponse();

        await expect(httpResponse(raw.value).sendFile(path, { root })).rejects.toSatisfy(FileNotFoundError.is);
        expect(raw.flushHeaders).not.toHaveBeenCalled();
        expect(raw.body()).toHaveLength(0);
      }
    });
  });

  it("destroys the response when the piped source fails", async () => {
    const failure = new Error("source failed");
    const source = new Readable({
      read() {
        this.destroy(failure);
      },
    });
    const raw = writableResponse();

    await expect(httpResponse(raw.value).sendStream(source)).rejects.toMatchObject({
      code: ConnectionAbortedError.code,
      cause: failure,
    });
    expect(source.destroyed).toBe(true);
    expect(raw.value.destroyed).toBe(true);
  });

  it("destroys the source when the response destination fails", async () => {
    const failure = new Error("destination failed");
    const source = Readable.from(["first", "second"]);
    const raw = writableResponse((_chunk, callback) => callback(failure));

    await expect(httpResponse(raw.value).sendStream(source)).rejects.toMatchObject({
      code: ConnectionAbortedError.code,
      cause: failure,
    });
    expect(source.destroyed).toBe(true);
    expect(raw.value.destroyed).toBe(true);
  });
});

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "typeline-http-response-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function writableResponse(onWrite?: (chunk: Uint8Array, callback: (error?: Error | null) => void) => void) {
  let headersSent = false;
  const flushHeaders = vi.fn(() => {
    headersSent = true;
  });
  const chunks: Buffer[] = [];
  const headers = new Map<string, string | number | readonly string[]>();
  const writable = new Writable({
    write(chunk: Uint8Array, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      if (onWrite) {
        onWrite(chunk, callback);
      } else {
        callback();
      }
    },
  });
  Object.assign(writable, {
    flushHeaders,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    hasHeader: (name: string) => headers.has(name.toLowerCase()),
    setHeader: (name: string, value: string | number | readonly string[]) => {
      headers.set(name.toLowerCase(), value);
      return writable;
    },
  });
  Object.defineProperty(writable, "headersSent", { get: () => headersSent });
  return {
    value: writable as unknown as ServerResponse,
    flushHeaders,
    headers,
    body: () => Buffer.concat(chunks),
  };
}
