import type { Awaitable } from "@danielsharp/common";
import { stop } from "@danielsharp/typeline";
import type { output, ZodType } from "zod";

import type { HttpMetadata } from "./metadata";
import { assertRedirectStatus, type HttpRedirectStatus } from "./response";
import type { HttpContext } from "./router";

type ResponseMetadata = Required<Pick<HttpMetadata, "responses">>;
type ResponseStatus = number | "default";

export function jsonResSend<TSchema extends ZodType>(schema: TSchema, statusCode: number) {
  assertFinalResponseStatus(statusCode);
  assertJsonResponseStatus(statusCode);
  return {
    metadata: jsonResponseMetadata(schema, statusCode),
    async mw(input: output<TSchema>, context: HttpContext) {
      const serialized = JSON.stringify(input);
      if (serialized === undefined) throw new TypeError("JSON response output could not be serialized.");
      context.res.status(statusCode).header("content-type", "application/json; charset=utf-8").send(serialized);
      return stop();
    },
  };
}

export function jsonResponseMeta(schema: ZodType, status: ResponseStatus): { readonly metadata: ResponseMetadata } {
  if (status !== "default") {
    assertFinalResponseStatus(status);
    assertJsonResponseStatus(status);
  }
  return { metadata: jsonResponseMetadata(schema, status) };
}

export function resEnd(statusCode: number) {
  assertFinalResponseStatus(statusCode);
  return {
    metadata: responseMetadata(statusCode),
    async mw(_input: unknown, context: HttpContext) {
      context.res.status(statusCode).send();
      return stop();
    },
  };
}

export function resRedirect(statusCode: HttpRedirectStatus) {
  assertRedirectStatus(statusCode);
  return {
    metadata: responseMetadata(statusCode),
    async mw(input: string, context: HttpContext) {
      context.res.redirect(input, statusCode);
      return stop();
    },
  };
}

export function responseMeta(status: ResponseStatus): { readonly metadata: ResponseMetadata } {
  if (status !== "default") assertFinalResponseStatus(status);
  return { metadata: responseMetadata(status) };
}

function jsonResponseMetadata(schema: ZodType, status: ResponseStatus): ResponseMetadata {
  return {
    responses: [
      {
        status,
        content: { contentType: "application/json", schema },
      },
    ],
  };
}

function responseMetadata(status: ResponseStatus): ResponseMetadata {
  return { responses: [{ status }] };
}

function assertFinalResponseStatus(status: number): void {
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new TypeError("HTTP response status must be an integer between 200 and 599.");
  }
}

function assertJsonResponseStatus(status: number): void {
  if (status === 204 || status === 205 || status === 304) {
    throw new TypeError(`HTTP status ${status} cannot include JSON response content.`);
  }
}
