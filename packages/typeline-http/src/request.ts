import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { BodySizeError, BodyStreamError, ConnectionAbortedError, HeaderFormatError } from "./errors";

export type HttpQuery = Record<string, string | string[]>;

export interface HttpRequestDefaults {
  bodySize: number | null;
}

export type HttpRequestDefaultsPatch = Partial<HttpRequestDefaults>;

const DEFAULT_BODY_SIZE = 100 * 1024;

export interface HttpRequestRoute {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
  path: string;
  params: Record<string, string>;
}

export interface HttpRouteMatchedResolution {
  status: "matched";
}

export interface HttpRoutePathNotFoundResolution {
  status: "path-not-found";
}

export interface HttpRouteMethodNotAllowedResolution {
  status: "method-not-allowed";
  allowedMethods: readonly string[];
}

export interface HttpRouteUnsupportedMediaTypeResolution {
  status: "unsupported-media-type";
  allowedMethods: readonly string[];
  allowedContentTypes: readonly string[];
}

export type HttpRouteUnmatchedResolution =
  | HttpRoutePathNotFoundResolution
  | HttpRouteMethodNotAllowedResolution
  | HttpRouteUnsupportedMediaTypeResolution;

export type HttpRouteResolution = HttpRouteMatchedResolution | HttpRouteUnmatchedResolution;

export interface HttpRequest {
  raw: IncomingMessage;
  method: string;
  url: URL;
  body?: Buffer;
  readBody(): Promise<Buffer>;
  cookies?: Record<string, string>;
  readCookies(): Record<string, string>;
  defaults: HttpRequestDefaults;
  readonly headers: Readonly<IncomingHttpHeaders>;
  query: HttpQuery;
  route?: HttpRequestRoute;
  resolution?: HttpRouteResolution;
}

export function httpRequest(request: IncomingMessage): HttpRequest {
  const protocol = "encrypted" in request.socket && request.socket.encrypted === true ? "https:" : "http:";
  const host = request.headers.host ?? "localhost";
  const url = new URL(request.url ?? "/", `${protocol}//${host}`);
  const result: HttpRequest = {
    raw: request,
    method: (request.method ?? "GET").toUpperCase(),
    url,
    async readBody() {
      if (this.body) {
        return this.body;
      }
      const maximumBodySize = this.defaults.bodySize;

      try {
        const chunks: Uint8Array[] = [];
        let bodySize = 0;
        for await (const chunk of request) {
          const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          bodySize += bytes.byteLength;
          if (maximumBodySize !== null && bodySize > maximumBodySize) {
            chunks.length = 0;
            throw new BodySizeError(maximumBodySize);
          }

          chunks.push(bytes);
        }
        return (this.body = Buffer.concat(chunks));
      } catch (error) {
        if (BodySizeError.is(error)) {
          throw error;
        }
        if (request.destroyed) {
          throw new ConnectionAbortedError(error);
        }
        throw new BodyStreamError(error);
      }
    },
    readCookies() {
      return (this.cookies ??= parseHttpCookies(this.headers.cookie));
    },
    defaults: { bodySize: DEFAULT_BODY_SIZE },
    headers: caseInsensitiveHeaders(request.headers),
    query: searchParamsToObject(url.searchParams),
  };
  return result;
}

function caseInsensitiveHeaders(headers: IncomingHttpHeaders): Readonly<IncomingHttpHeaders> {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  ) as IncomingHttpHeaders;
  Object.freeze(normalized);

  return new Proxy(normalized, {
    get(target, property, receiver) {
      return Reflect.get(target, normalizedHeaderProperty(property), receiver);
    },
    has(target, property) {
      return Reflect.has(target, normalizedHeaderProperty(property));
    },
  });
}

function normalizedHeaderProperty(property: PropertyKey): PropertyKey {
  return typeof property === "string" ? property.toLowerCase() : property;
}

export function setRequestDefaults(patch: HttpRequestDefaultsPatch) {
  if (patch.bodySize !== undefined && patch.bodySize !== null) {
    if (!Number.isSafeInteger(patch.bodySize) || patch.bodySize < 0) {
      throw new TypeError("Request bodySize must be a non-negative safe integer or null.");
    }
  }
  return <TInput extends object>(input: TInput, context: { req: HttpRequest }): TInput => {
    Object.assign(context.req.defaults, patch);
    return input;
  };
}

export function parseHttpCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies = new Map<string, string>();
  for (const entry of header.split(";")) {
    if (entry.trim() === "") continue;
    const separator = entry.indexOf("=");
    const name = (separator < 0 ? "" : entry.slice(0, separator)).trim();
    if (separator < 0 || name === "") {
      throw new HeaderFormatError("cookie", new TypeError("Cookie entries require a name and value."));
    }
    if (cookies.has(name)) continue;

    const value = entry.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return Object.fromEntries(cookies);
}

export function searchParamsToObject(searchParams: URLSearchParams): HttpQuery {
  const result: HttpQuery = {};
  for (const [key, value] of searchParams) {
    const current = result[key];
    result[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return result;
}
