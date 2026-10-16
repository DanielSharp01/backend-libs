import type { Awaitable } from "@danielsharp/common";
import { stop } from "@danielsharp/typeline";
import type { output, ZodType } from "zod";

import { BadRequest } from "./http-error";
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

export interface ResRedirectOptions {
  /** Only follow locations on this origin; anything else is a 400. Absolute URLs are refused even when they name this host. */
  sameOrigin?: boolean;
}

export function resRedirect(statusCode: HttpRedirectStatus, { sameOrigin = false }: ResRedirectOptions = {}) {
  assertRedirectStatus(statusCode);
  return {
    metadata: responseMetadata(statusCode),
    async mw(input: string, context: HttpContext) {
      context.res.redirect(sameOrigin ? sameOriginLocation(input) : input, statusCode);
      return stop();
    },
  };
}

export function responseMeta(status: ResponseStatus): { readonly metadata: ResponseMetadata } {
  if (status !== "default") assertFinalResponseStatus(status);
  return { metadata: responseMetadata(status) };
}

const PLACEHOLDER_ORIGIN = "http://same-origin.invalid";

// Resolved the way a browser would, so "//host", "/\host" and tab or newline tricks all land on another origin.
// The re-serialized path is sent instead of the input, so the browser follows exactly what was checked.
function sameOriginLocation(location: string): string {
  let url: URL;
  try {
    url = new URL(location, PLACEHOLDER_ORIGIN);
  } catch {
    throw new BadRequest({ redirect: "invalid location" });
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) throw new BadRequest({ redirect: "not same-origin" });
  return url.pathname + url.search + url.hash;
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
