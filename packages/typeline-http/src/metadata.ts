import { unique } from "@danielsharp/common";
import type { ZodFile, ZodType } from "zod";

export interface HttpRouteMetadata {
  method: string;
  path: string;
}

export interface HttpBodyMetadata {
  contentType: string;
  schema: ZodType<any, any>;
}

interface HttpResponseMetadata {
  status: number | "default";
  content?: {
    contentType: "application/json";
    schema: ZodType<any, any>;
  };
}

export type SecurityScheme =
  | {
      scheme: "cookie";
      cookieName: string;
      description?: string;
    }
  | {
      scheme: "bearer";
      description?: string;
      bearerFormat?: string;
    }
  | {
      scheme: "basic";
      description?: string;
    }
  | {
      scheme: "apiKey";
      in: "query" | "headers";
      name: string;
      description?: string;
    };

export interface HttpMetadata {
  route?: HttpRouteMetadata;
  openApi?: boolean;
  securitySchemes?: Record<string, SecurityScheme>;
  optionalSecurity?: boolean;
  title?: string;
  description?: string;
  tags?: readonly string[];
  body?: HttpBodyMetadata;
  file?: ZodFile;
  responses?: readonly HttpResponseMetadata[];
  headers?: ZodType<any, any>;
  cookies?: ZodType<any, any>;
  query?: ZodType<any, any>;
  params?: ZodType<any, any>;
}

interface MergedHttpBodyMetadata {
  contentType: string;
  schema: readonly [ZodType<any, any>, ...ZodType<any, any>[]];
}

export interface MergedHttpMetadata {
  route?: HttpRouteMetadata;
  openApi?: boolean;
  securitySchemes?: readonly [Record<string, SecurityScheme>, ...Record<string, SecurityScheme>[]];
  optionalSecurity?: boolean;
  title?: string;
  description?: string;
  tags?: readonly string[];
  body?: MergedHttpBodyMetadata;
  file?: readonly [ZodFile, ...ZodFile[]];
  responses?: readonly HttpResponseMetadata[];
  headers?: readonly [ZodType<any, any>, ...ZodType<any, any>[]];
  cookies?: readonly [ZodType<any, any>, ...ZodType<any, any>[]];
  query?: readonly [ZodType<any, any>, ...ZodType<any, any>[]];
  params?: readonly [ZodType<any, any>, ...ZodType<any, any>[]];
}

export function toMergedHttpMetadata(metadata: HttpMetadata): MergedHttpMetadata {
  const body =
    metadata.body === undefined
      ? undefined
      : {
          contentType: metadata.body.contentType,
          schema: [metadata.body.schema] as [ZodType<any, any>, ...ZodType<any, any>[]],
        };
  const responses = metadata.responses;
  const file = metadata.file === undefined ? undefined : ([metadata.file] as [ZodFile, ...ZodFile[]]);
  const headers =
    metadata.headers === undefined ? undefined : ([metadata.headers] as [ZodType<any, any>, ...ZodType<any, any>[]]);
  const cookies =
    metadata.cookies === undefined ? undefined : ([metadata.cookies] as [ZodType<any, any>, ...ZodType<any, any>[]]);
  const query =
    metadata.query === undefined ? undefined : ([metadata.query] as [ZodType<any, any>, ...ZodType<any, any>[]]);
  const params =
    metadata.params === undefined ? undefined : ([metadata.params] as [ZodType<any, any>, ...ZodType<any, any>[]]);

  return {
    ...(metadata.route === undefined ? {} : { route: metadata.route }),
    ...(metadata.openApi === undefined ? {} : { openApi: metadata.openApi }),
    ...(metadata.securitySchemes === undefined ? {} : { securitySchemes: [metadata.securitySchemes] }),
    ...(metadata.optionalSecurity === undefined ? {} : { optionalSecurity: metadata.optionalSecurity }),
    ...(metadata.title === undefined ? {} : { title: metadata.title }),
    ...(metadata.description === undefined ? {} : { description: metadata.description }),
    ...(metadata.tags === undefined ? {} : { tags: metadata.tags }),
    ...(body === undefined ? {} : { body }),
    ...(file === undefined ? {} : { file }),
    ...(responses === undefined ? {} : { responses }),
    ...(headers === undefined ? {} : { headers }),
    ...(cookies === undefined ? {} : { cookies }),
    ...(query === undefined ? {} : { query }),
    ...(params === undefined ? {} : { params }),
  };
}

export function mergeHttpMetadata(parent: MergedHttpMetadata, child: MergedHttpMetadata): MergedHttpMetadata {
  const route = parent.route ?? child.route;
  const openApi = child.openApi ?? parent.openApi;
  const securitySchemes = mergeSecuritySchemeMetadata(parent.securitySchemes, child.securitySchemes);
  const optionalSecurity = mergeOptionalSecurityMetadata(parent.optionalSecurity, child.optionalSecurity);
  const title = child.title ?? parent.title;
  const description = child.description ?? parent.description;
  const tags = unique([...(parent.tags ?? []), ...(child.tags ?? [])]);
  const hasTags = parent.tags !== undefined || child.tags !== undefined;
  const body = mergeBodyMetadata(parent.body, child.body);
  const file = mergeSchemaLists(parent.file, child.file);
  const responses = [...(parent.responses ?? []), ...(child.responses ?? [])];
  const hasResponses = parent.responses !== undefined || child.responses !== undefined;
  const headers = mergeSchemaLists(parent.headers, child.headers);
  const cookies = mergeSchemaLists(parent.cookies, child.cookies);
  const query = mergeSchemaLists(parent.query, child.query);
  const params = mergeSchemaLists(parent.params, child.params);

  return {
    ...(route === undefined ? {} : { route }),
    ...(securitySchemes === undefined ? {} : { securitySchemes }),
    ...(optionalSecurity === undefined ? {} : { optionalSecurity }),
    ...(openApi === undefined ? {} : { openApi }),
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(hasTags ? { tags } : {}),
    ...(body === undefined ? {} : { body }),
    ...(file === undefined ? {} : { file }),
    ...(hasResponses ? { responses } : {}),
    ...(headers === undefined ? {} : { headers }),
    ...(cookies === undefined ? {} : { cookies }),
    ...(query === undefined ? {} : { query }),
    ...(params === undefined ? {} : { params }),
  };
}

function mergeSecuritySchemeMetadata(
  parent: readonly [Record<string, SecurityScheme>, ...Record<string, SecurityScheme>[]] | undefined,
  child: readonly [Record<string, SecurityScheme>, ...Record<string, SecurityScheme>[]] | undefined,
): readonly [Record<string, SecurityScheme>, ...Record<string, SecurityScheme>[]] | undefined {
  if (parent === undefined) return child;
  if (child === undefined) return parent;
  return [...parent, ...child];
}

function mergeOptionalSecurityMetadata(parent: boolean | undefined, child: boolean | undefined): boolean | undefined {
  if (parent === undefined) return child;
  if (child === undefined) return parent;
  return parent && child;
}

function mergeBodyMetadata(
  parent: MergedHttpBodyMetadata | undefined,
  child: MergedHttpBodyMetadata | undefined,
): MergedHttpBodyMetadata | undefined {
  if (parent === undefined) return child;
  if (child === undefined) return parent;
  if (parent.contentType !== child.contentType) return child;
  return { contentType: child.contentType, schema: [...parent.schema, ...child.schema] };
}

function mergeSchemaLists<TSchema extends ZodType<any, any>>(
  parent: readonly [TSchema, ...TSchema[]] | undefined,
  child: readonly [TSchema, ...TSchema[]] | undefined,
) {
  if (parent === undefined) return child;
  if (child === undefined) return parent;
  return [...parent, ...child] as [TSchema, ...TSchema[]];
}
