import type { IncomingMessage, OutgoingHttpHeader, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export interface SyntheticResponse extends ServerResponse {
  body: string | Uint8Array | undefined;
  output: unknown;
  reset(): void;
}

export function syntheticRequest(method: string, path: string): IncomingMessage {
  return Object.assign(Readable.from([]), {
    headers: { accept: "application/json", "content-type": "application/json" },
    method,
    originalUrl: path,
    socket: {},
    url: path,
  }) as unknown as IncomingMessage;
}

export function syntheticResponse(): SyntheticResponse {
  const headers = new Map<string, OutgoingHttpHeader>();
  const response: {
    body: string | Uint8Array | undefined;
    destroyed: boolean;
    headersSent: boolean;
    output: unknown;
    statusCode: number;
    writableEnded: boolean;
    destroy(): void;
    end(body?: string | Uint8Array): typeof response;
    getHeader(name: string): OutgoingHttpHeader | undefined;
    getHeaders(): Record<string, OutgoingHttpHeader>;
    hasHeader(name: string): boolean;
    removeHeader(name: string): void;
    reset(): void;
    setHeader(name: string, value: OutgoingHttpHeader): typeof response;
  } = {
    body: undefined,
    destroyed: false,
    headersSent: false,
    output: undefined,
    statusCode: 200,
    writableEnded: false,
    destroy() {
      response.destroyed = true;
    },
    end(body?: string | Uint8Array) {
      response.body = body;
      response.headersSent = true;
      response.writableEnded = true;
      return response;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    getHeaders() {
      return Object.fromEntries(headers);
    },
    hasHeader(name: string) {
      return headers.has(name.toLowerCase());
    },
    removeHeader(name: string) {
      headers.delete(name.toLowerCase());
    },
    reset() {
      headers.clear();
      response.body = undefined;
      response.destroyed = false;
      response.headersSent = false;
      response.output = undefined;
      response.statusCode = 200;
      response.writableEnded = false;
    },
    setHeader(name: string, value: OutgoingHttpHeader) {
      headers.set(name.toLowerCase(), value);
      return response;
    },
  };
  return response as unknown as SyntheticResponse;
}
