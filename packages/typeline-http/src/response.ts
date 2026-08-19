import type { OutgoingHttpHeader, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { capitalize } from "@danielsharp/common";

import {
  ConnectionAbortedError,
  FileNotFoundError,
  InvalidResponseHeadersError,
  ResponseAlreadyCommittedError,
  ResponseAlreadyEndedError,
} from "./errors";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { open } from "node:fs/promises";
import { contentType, lookup } from "mime-types";
import type { HttpRequest } from "./request";

export interface HttpCookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  partitioned?: boolean;
  path?: string;
  priority?: "low" | "medium" | "high";
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
}

export interface HttpSendFileOptions {
  readonly root: string;
}

export interface HttpResponse {
  raw: ServerResponse;
  wrapUnsendable(cause?: unknown): UnsendableResponseError | undefined;
  status(code: number): HttpResponse;
  header(name: string, value: OutgoingHttpHeader): HttpResponse;
  header(headers: OutgoingHttpHeaders): HttpResponse;
  cookie(name: string, value: string, options?: HttpCookieOptions): HttpResponse;
  clearCookie(
    name: string,
    options?: Pick<HttpCookieOptions, "domain" | "path" | "secure" | "partitioned">,
  ): HttpResponse;
  destroy(): void;
  flushHeaders(): HttpResponse;
  write(chunk: string | Uint8Array): Promise<void>;
  send(output?: unknown): HttpResponse;
  sendStream(readable: Readable): Promise<void>;
  sendFile(path: string, options: HttpSendFileOptions): Promise<void>;
}

export type UnsendableResponseError =
  | ConnectionAbortedError
  | InvalidResponseHeadersError
  | ResponseAlreadyCommittedError
  | ResponseAlreadyEndedError;

const HTTP_RESPONSE = Symbol("typeline-http.response");

type InternalHttpResponse = HttpResponse & { [HTTP_RESPONSE]: true };

export function httpResponse(response: ServerResponse): HttpResponse {
  const result: InternalHttpResponse = {
    [HTTP_RESPONSE]: true,
    raw: response,
    wrapUnsendable(cause) {
      if (ConnectionAbortedError.is(cause)) return cause;
      if (InvalidResponseHeadersError.is(cause)) return cause;
      if (ResponseAlreadyEndedError.is(cause)) return cause;
      if (ResponseAlreadyCommittedError.is(cause)) return cause;
      if (response.writableEnded) return new ResponseAlreadyEndedError(cause);
      if (response.destroyed || response.socket?.destroyed) {
        return new ConnectionAbortedError(cause === undefined ? response.errored : cause);
      }
      if (response.headersSent) return new ResponseAlreadyCommittedError(cause);
      return undefined;
    },
    status(code) {
      assertResponseHeadersMutable(response);
      response.statusCode = code;
      return result;
    },
    header(nameOrHeaders: string | OutgoingHttpHeaders, value?: OutgoingHttpHeader) {
      assertResponseHeadersMutable(response);
      if (typeof nameOrHeaders === "string") {
        if (value !== undefined) {
          response.setHeader(nameOrHeaders, value);
        }
      } else {
        for (const [name, headerValue] of Object.entries(nameOrHeaders)) {
          if (headerValue !== undefined) {
            response.setHeader(name, headerValue);
          }
        }
      }
      return result;
    },
    cookie(name, value, options) {
      assertResponseHeadersMutable(response);
      const serialized = serializeCookie(name, value, options);
      const current = response.getHeader("set-cookie");

      response.setHeader(
        "set-cookie",
        current === undefined
          ? serialized
          : Array.isArray(current)
            ? [...current, serialized]
            : [String(current), serialized],
      );
      return result;
    },
    clearCookie(name, options) {
      this.cookie(name, "", { ...options, maxAge: 0 });
      return result;
    },
    destroy() {
      if (!response.destroyed && !response.writableEnded) {
        response.destroy();
      }
    },
    flushHeaders() {
      flushHttpHeaders(response);
      return result;
    },
    async write(chunk) {
      assertResponseWritable(response);
      await new Promise<void>((resolve, reject) => {
        const rejectWrite = (error: unknown) => {
          response.off("error", onError);
          response.destroy();
          reject(new ConnectionAbortedError(error));
        };
        const onError = (error: Error) => rejectWrite(error);
        response.once("error", onError);
        try {
          response.write(chunk, (error) => {
            if (error) {
              rejectWrite(error);
            } else {
              response.off("error", onError);
              resolve();
            }
          });
        } catch (error) {
          response.off("error", onError);
          rejectWrite(error);
        }
      });
    },
    send(output) {
      assertResponseWritable(response);
      try {
        if (output === undefined || isHttpResponse(output)) {
          response.end();
          return this;
        }
        if (typeof output === "string" || output instanceof Uint8Array) {
          response.end(output);
          return this;
        }
        if (typeof output === "number" || typeof output === "boolean" || typeof output === "bigint") {
          response.end(String(output));
          return this;
        }

        if (!response.hasHeader("content-type")) {
          response.setHeader("content-type", "application/json; charset=utf-8");
        }
        response.end(JSON.stringify(output));
        return this;
      } catch (error) {
        const failure = new ConnectionAbortedError(error);
        response.destroy();
        throw failure;
      }
    },
    async sendStream(readable) {
      flushHttpHeaders(response);
      try {
        await streamPipeline(readable, response);
      } catch (error) {
        if (response.destroyed || response.socket?.destroyed) {
          throw new ConnectionAbortedError(error);
        }
        throw error;
      }
    },
    async sendFile(path, options) {
      const fullPath = resolveFilePath(path, options.root);
      const handle = await openResponseFile(path, fullPath);

      try {
        const stats = await handle.stat();
        if (!stats.isFile()) throw new FileNotFoundError(path);

        if (!response.hasHeader("content-type")) {
          const mediaType = lookup(fullPath) || "application/octet-stream";
          this.header("content-type", contentType(mediaType) || mediaType);
        }
        if (!response.hasHeader("content-length")) {
          this.header("content-length", stats.size);
        }

        await this.sendStream(handle.createReadStream({ autoClose: false }));
      } finally {
        await handle.close();
      }
    },
  };
  return result;
}

export function isHttpResponse(value: unknown): value is HttpResponse {
  return typeof value === "object" && value !== null && HTTP_RESPONSE in value;
}

function flushHttpHeaders(response: ServerResponse): void {
  assertResponseWritable(response);
  try {
    response.flushHeaders();
  } catch (error) {
    if (response.destroyed || response.socket?.destroyed) {
      throw new ConnectionAbortedError(error);
    }
    throw new InvalidResponseHeadersError(error);
  }
}

function assertResponseWritable(response: ServerResponse): void {
  if (response.destroyed || response.socket?.destroyed) {
    throw new ConnectionAbortedError(response.errored);
  }
  if (response.writableEnded) {
    throw new ResponseAlreadyEndedError();
  }
}

function assertResponseHeadersMutable(response: ServerResponse): void {
  assertResponseWritable(response);
  if (response.headersSent) {
    throw new ResponseAlreadyCommittedError();
  }
}

function serializeCookie(name: string, value: string, options: HttpCookieOptions | undefined): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options?.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (options?.domain !== undefined) parts.push(`Domain=${options.domain}`);
  if (options?.path !== undefined) parts.push(`Path=${options.path}`);
  if (options?.expires !== undefined) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options?.httpOnly) parts.push("HttpOnly");
  if (options?.secure) parts.push("Secure");
  if (options?.partitioned) parts.push("Partitioned");
  if (options?.priority !== undefined) parts.push(`Priority=${capitalize(options.priority)}`);
  if (options?.sameSite) {
    parts.push(`SameSite=${options.sameSite === true ? "Strict" : capitalize(options.sameSite)}`);
  }
  return parts.join("; ");
}

function resolveFilePath(path: string, root: string): string {
  if (path.includes("\0")) throw new FileNotFoundError(path);

  const fullRoot = resolve(root);
  const fullPath = resolve(fullRoot, path);
  const pathFromRoot = relative(fullRoot, fullPath);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new FileNotFoundError(path);
  }
  return fullPath;
}

async function openResponseFile(path: string, fullPath: string) {
  try {
    return await open(fullPath, "r");
  } catch (cause) {
    if (isMissingPathError(cause)) throw new FileNotFoundError(path, cause);
    throw cause;
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
