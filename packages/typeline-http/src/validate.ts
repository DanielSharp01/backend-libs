import { File } from "node:buffer";

import { type Awaitable, type Merge } from "@danielsharp/common";
import { zodStringify } from "@danielsharp/zod";
import type { output, ZodFile, ZodType } from "zod";

import {
  JSON_CONTENT_TYPE,
  MULTIPART_CONTENT_TYPE,
  requestContentType,
  URL_ENCODED_CONTENT_TYPE,
} from "./content-type";
import { BodyFormatError, HttpValidationError, type HttpValidationSource } from "./errors";
import type { HttpMetadata } from "./metadata";
import { parseMultipartBody } from "./multipart";
import { searchParamsToObject, type HttpRequest } from "./request";
import type { HttpContext } from "./router";

type ObjectOutput = Record<string, unknown>;
type ObjectSchema = ZodType<ObjectOutput, any>;

type ExistingObject<T, TKey> = TKey extends keyof T ? (T[TKey] extends object ? T[TKey] : {}) : {};

export type ValidatedInput<TInput extends object, TKey extends HttpValidationSource, TValue extends object> = Merge<
  TInput,
  Record<TKey, Merge<ExistingObject<TInput, TKey>, TValue>>
>;

export interface HttpValidator<
  TInput extends object,
  TKey extends HttpValidationSource,
  TSchema extends ObjectSchema,
  TContext extends HttpContext = HttpContext,
> {
  readonly metadata: Pick<HttpMetadata, TKey>;
  mw(input: TInput, context: TContext): Promise<ValidatedInput<TInput, TKey, output<TSchema>>>;
}

export function validateBody<TInput extends object, TSchema extends ZodType<any, any>, TContext extends HttpContext>(
  schema: TSchema,
) {
  return {
    mw: async (
      input: TInput,
      context: TContext,
    ): Promise<Merge<TInput, { body: Merge<ExistingObject<TInput, "body">, output<TSchema>> }>> => {
      assertRequestContentType(context.req, JSON_CONTENT_TYPE);
      let bodyJson: any;
      const bodyString = (await context.req.readBody()).toString("utf-8");
      if (bodyString === "") {
        bodyJson = undefined;
      } else {
        try {
          bodyJson = JSON.parse(bodyString);
        } catch (error) {
          throw new BodyFormatError(JSON_CONTENT_TYPE, error);
        }
      }

      let parsedBody = validatedParse("body", schema, bodyJson);

      if ("body" in input && typeof input.body === "object" && input.body !== null && typeof parsedBody === "object") {
        parsedBody = { ...input.body, ...parsedBody };
      }

      return { ...input, body: parsedBody };
    },
    metadata: { body: { contentType: JSON_CONTENT_TYPE, schema } },
  };
}

export function validateUrlEncoded<TInput extends object, TSchema extends ObjectSchema, TContext extends HttpContext>(
  schema: TSchema,
) {
  const stringifiedSchema = zodStringify(schema);
  return {
    mw: async (
      input: TInput,
      context: TContext,
    ): Promise<Merge<TInput, { body: Merge<ExistingObject<TInput, "body">, output<TSchema>> }>> => {
      assertRequestContentType(context.req, URL_ENCODED_CONTENT_TYPE);
      const bodyString = (await context.req.readBody()).toString("utf-8");
      let parsedBody = validatedParse("body", stringifiedSchema, searchParamsToObject(new URLSearchParams(bodyString)));

      if ("body" in input && typeof input.body === "object" && input.body !== null) {
        parsedBody = { ...input.body, ...parsedBody };
      }

      return { ...input, body: parsedBody } as Merge<
        TInput,
        { body: Merge<ExistingObject<TInput, "body">, output<TSchema>> }
      >;
    },
    metadata: { body: { contentType: URL_ENCODED_CONTENT_TYPE, schema } },
  };
}

export function validateMultipart<TInput extends object, TSchema extends ObjectSchema, TContext extends HttpContext>(
  schema: TSchema,
) {
  const stringifiedSchema = zodStringify(schema);
  return {
    mw: async (
      input: TInput,
      context: TContext,
    ): Promise<Merge<TInput, { body: Merge<ExistingObject<TInput, "body">, output<TSchema>> }>> => {
      assertRequestContentType(context.req, MULTIPART_CONTENT_TYPE);
      const body = await context.req.readBody();
      let multipartBody: Record<string, unknown>;
      try {
        multipartBody = await parseMultipartBody(body, context.req.headers);
      } catch (error) {
        throw new BodyFormatError(MULTIPART_CONTENT_TYPE, error);
      }

      let parsedBody = validatedParse("body", stringifiedSchema, multipartBody);
      if ("body" in input && typeof input.body === "object" && input.body !== null) {
        parsedBody = { ...input.body, ...parsedBody };
      }

      return { ...input, body: parsedBody } as Merge<
        TInput,
        { body: Merge<ExistingObject<TInput, "body">, output<TSchema>> }
      >;
    },
    metadata: { body: { contentType: MULTIPART_CONTENT_TYPE, schema } },
  };
}

export function validateFile<TInput extends object, TSchema extends ZodFile, TContext extends HttpContext>(
  schema: TSchema,
) {
  return {
    mw: async (input: TInput, context: TContext): Promise<Merge<TInput, { file: output<TSchema> }>> => {
      const body = await context.req.readBody();
      const file = new File([new Uint8Array(body)], "", { type: requestContentType(context.req.headers) });
      return { ...input, file: validatedParse("body", schema, file) } as Merge<TInput, { file: output<TSchema> }>;
    },
    metadata: { file: schema },
  };
}

export function validateHeaders<TInput extends object, TSchema extends ObjectSchema, TContext extends HttpContext>(
  schema: TSchema,
) {
  return {
    mw: async (
      input: TInput,
      context: TContext,
    ): Promise<Merge<TInput, { headers: Merge<ExistingObject<TInput, "headers">, output<TSchema>> }>> => {
      let parsedHeaders = validatedParse("headers", schema, context.req.headers);
      if ("headers" in input && typeof input.headers === "object" && input.headers !== null) {
        parsedHeaders = { ...input.headers, ...parsedHeaders };
      }

      return { ...input, headers: parsedHeaders } as Merge<
        TInput,
        { headers: Merge<ExistingObject<TInput, "headers">, output<TSchema>> }
      >;
    },
    metadata: { headers: schema },
  };
}

export function validateCookies<TInput extends object, TSchema extends ObjectSchema, TContext extends HttpContext>(
  schema: TSchema,
) {
  return {
    mw: async (
      input: TInput,
      context: TContext,
    ): Promise<Merge<TInput, { cookies: Merge<ExistingObject<TInput, "cookies">, output<TSchema>> }>> => {
      let parsedCookies = validatedParse("cookies", schema, context.req.readCookies());
      if (
        "cookies" in input &&
        typeof input.cookies === "object" &&
        input.cookies !== null &&
        typeof parsedCookies === "object"
      ) {
        parsedCookies = { ...input.cookies, ...parsedCookies };
      }

      return { ...input, cookies: parsedCookies } as Merge<
        TInput,
        { cookies: Merge<ExistingObject<TInput, "cookies">, output<TSchema>> }
      >;
    },
    metadata: { cookies: schema },
  };
}

export function validateQuery<TInput extends object, TSchema extends ObjectSchema, TContext extends HttpContext>(
  schema: TSchema,
) {
  return {
    mw: async (
      input: TInput,
      context: TContext,
    ): Promise<Merge<TInput, { query: Merge<ExistingObject<TInput, "query">, output<TSchema>> }>> => {
      let parsedQuery = validatedParse("query", schema, context.req.query);
      if ("query" in input && typeof input.query === "object" && input.query !== null) {
        parsedQuery = { ...input.query, ...parsedQuery };
      }

      return { ...input, query: parsedQuery } as Merge<
        TInput,
        { query: Merge<ExistingObject<TInput, "query">, output<TSchema>> }
      >;
    },
    metadata: { query: schema },
  };
}

export function validateParams<TInput extends object, TSchema extends ObjectSchema, TContext extends HttpContext>(
  schema: TSchema,
) {
  return {
    mw: async (
      input: TInput,
      context: TContext,
    ): Promise<Merge<TInput, { params: Merge<ExistingObject<TInput, "params">, output<TSchema>> }>> => {
      let parsedParams = validatedParse("params", schema, context.req.route?.params);
      if ("params" in input && typeof input.params === "object" && input.params !== null) {
        parsedParams = { ...input.params, ...parsedParams };
      }

      return { ...input, params: parsedParams } as Merge<
        TInput,
        { params: Merge<ExistingObject<TInput, "params">, output<TSchema>> }
      >;
    },
    metadata: { params: schema },
  };
}

function validatedParse(source: HttpValidationSource, schema: ZodType<any, any>, data: unknown): any {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpValidationError(source, result.error);
  }
  return result.data;
}

function assertRequestContentType(request: HttpRequest, expected: string): void {
  if (requestContentType(request.headers) !== expected) {
    throw new BodyFormatError(expected, new TypeError(`Request body must use ${expected}.`));
  }
}
