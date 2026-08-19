import { STATUS_CODES } from "node:http";

import type {
  Document,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ResponseObject,
  ResponsesObject,
  SchemaObject,
  SecurityRequirementObject,
  SecuritySchemeObject,
} from "@scalar/openapi-types/3.1";
import {
  zodJsonSchemas,
  type ZodJsonSchemasOptions,
  type ZodJsonSchemasResult,
  type ZodReferenceRegistry,
} from "@danielsharp/zod";
import type { ZodType } from "zod";

import { JSON_CONTENT_TYPE, MULTIPART_CONTENT_TYPE, URL_ENCODED_CONTENT_TYPE } from "./content-type";
import {
  mergeHttpMetadata,
  type MergedHttpMetadata,
  type HttpRouteMetadata,
  type SecurityScheme,
  toMergedHttpMetadata,
} from "./metadata";
import { type RootRouter } from "./router";

export type OpenApiDocument = Omit<Document, "openapi"> & {
  openapi: "3.1.0";
};

export interface SwaggerOptions {
  readonly info: OpenApiDocument["info"];
  readonly references?: ZodReferenceRegistry;
}

export interface SwaggerBuildResult {
  readonly document: OpenApiDocument;
  readonly warnings: readonly SwaggerWarning[];
}

type SwaggerWarningCode =
  | "duplicate-operation"
  | "orphan-path-parameter"
  | "raw-file-body-unsupported"
  | "reference-direction-conflict"
  | "request-body-semantics-undefined"
  | "response-body-not-allowed"
  | "schema-approximated"
  | "schema-conversion-failed"
  | "security-scheme-overridden"
  | "unsupported-content-type"
  | "unsupported-method"
  | "unsupported-parameter-group"
  | "unsupported-parameter-shape"
  | "unsupported-response-status"
  | "wildcard-path-approximated";

interface SwaggerOperationIdentity {
  readonly method: string;
  readonly path: string;
}

interface SwaggerWarningBase<TCode extends SwaggerWarningCode> {
  readonly code: TCode;
  readonly message: string;
  readonly operation: SwaggerOperationIdentity;
}

type SwaggerParameterSource = "cookies" | "headers" | "params" | "query";
type SwaggerSchemaSource = SwaggerParameterSource | "body" | "component" | "response";

export type SwaggerWarning =
  | (SwaggerWarningBase<"duplicate-operation"> & { readonly occurrences: number })
  | (SwaggerWarningBase<"orphan-path-parameter"> & { readonly parameter: string })
  | (SwaggerWarningBase<"reference-direction-conflict"> & { readonly referenceName: string })
  | SwaggerWarningBase<"request-body-semantics-undefined">
  | SwaggerWarningBase<"raw-file-body-unsupported">
  | (SwaggerWarningBase<"response-body-not-allowed"> & { readonly status: number | "default" })
  | (SwaggerWarningBase<"schema-approximated"> & {
      readonly source: SwaggerSchemaSource;
      readonly reason: "bigint" | "bounded-date" | "non-json-literal";
      readonly referenceName?: string;
    })
  | (SwaggerWarningBase<"schema-conversion-failed"> & {
      readonly source: SwaggerSchemaSource;
      readonly reason: "converter-error" | "unrepresentable";
      readonly referenceName?: string;
      readonly cause?: unknown;
    })
  | (SwaggerWarningBase<"security-scheme-overridden"> & { readonly scheme: string })
  | (SwaggerWarningBase<"unsupported-content-type"> & {
      readonly source: "request" | "response";
      readonly contentType: string;
    })
  | SwaggerWarningBase<"unsupported-method">
  | (SwaggerWarningBase<"unsupported-parameter-group"> & { readonly source: SwaggerParameterSource })
  | (SwaggerWarningBase<"unsupported-parameter-shape"> & {
      readonly source: SwaggerParameterSource;
      readonly parameter: string;
    })
  | (SwaggerWarningBase<"unsupported-response-status"> & { readonly status: unknown })
  | (SwaggerWarningBase<"wildcard-path-approximated"> & { readonly parameter: string });

type JsonSchema = Record<string, unknown>;
type SchemaProjection = ZodJsonSchemasOptions["schemas"][string];
type MergedBodyMetadata = NonNullable<MergedHttpMetadata["body"]>;

type ResolvedRouteMetadata = MergedHttpMetadata & {
  route: HttpRouteMetadata;
  unsupportedRequestContentTypes: readonly string[];
};

interface RoutePath {
  readonly openApiPath: string;
  readonly parameters: readonly PathParameter[];
}

interface PathParameter {
  readonly name: string;
  readonly wildcard: boolean;
}

interface OperationCandidate {
  readonly metadata: ResolvedRouteMetadata;
  readonly identity: SwaggerOperationIdentity;
  readonly pathParameters: readonly PathParameter[];
  readonly bodyVariants: MergedBodyMetadata[];
  hasRawFileBody: boolean;
  readonly unsupportedRequestContentTypes: string[];
  variantCount: number;
}

interface StagedSchema {
  readonly key: string;
}

interface StagedResponse {
  readonly status: number | "default";
  readonly schemas: readonly StagedSchema[];
}

interface StagedBody {
  readonly contentType: string;
  readonly key: string;
}

interface StagedOperation extends OperationCandidate {
  readonly parameterKeys: Partial<Record<SwaggerParameterSource, string>>;
  readonly bodyKeys: readonly StagedBody[];
  readonly responses: readonly StagedResponse[];
}

interface ProjectionContext {
  readonly operation: SwaggerOperationIdentity;
  readonly source: SwaggerSchemaSource;
}

const supportedMethods = new Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"]);
const supportedRequestContentTypes = new Set([JSON_CONTENT_TYPE, MULTIPART_CONTENT_TYPE, URL_ENCODED_CONTENT_TYPE]);
const reservedHeaderNames = new Set(["accept", "authorization", "content-type"]);
const uncertainBodyMethods = new Set(["delete", "get", "head"]);
const bodylessStatuses = new Set([204, 205, 304]);

export function swagger(router: RootRouter<any, any, any>, options: SwaggerOptions): SwaggerBuildResult {
  const metadataPaths = router.lines.map((line) => line.metadata.map(toMergedHttpMetadata));

  const warningCollector = createWarningCollector();
  const candidates = collectOperationCandidates(metadataPaths, warningCollector.add);
  const projections: Record<string, SchemaProjection> = {};
  const projectionContexts = new Map<string, ProjectionContext>();
  let schemaIndex = 0;

  function stage(
    operation: SwaggerOperationIdentity,
    source: SwaggerSchemaSource,
    schemas: readonly [ZodType<any, any>, ...ZodType<any, any>[]],
    projection: Omit<SchemaProjection, "schemas">,
  ): string {
    const key = `schema-${schemaIndex++}`;
    projections[key] = { schemas, ...projection };
    projectionContexts.set(key, { operation, source });
    return key;
  }

  const staged = candidates.map((candidate): StagedOperation => {
    const { metadata, identity } = candidate;
    const parameterKeys: Partial<Record<SwaggerParameterSource, string>> = {};
    for (const source of ["params", "query", "headers", "cookies"] as const) {
      const schemas = metadata[source];
      if (schemas === undefined) continue;
      parameterKeys[source] = stage(identity, source, schemas, {
        io: "input",
        referenceMode: "inline",
        mode: source === "query" ? "flat-array" : "flat",
      });
    }

    if (!candidate.hasRawFileBody) {
      for (const contentType of candidate.unsupportedRequestContentTypes) {
        warningCollector.add({
          code: "unsupported-content-type",
          operation: identity,
          source: "request",
          contentType,
          message: `Request content type ${JSON.stringify(contentType)} is not supported by this OpenAPI projection.`,
        });
      }
    }

    if (candidate.hasRawFileBody) {
      warningCollector.add({
        code: "raw-file-body-unsupported",
        operation: identity,
        message: "Raw file request bodies cannot be projected because their media type is not present in metadata.",
      });
    }

    const bodyKeys = candidate.bodyVariants.flatMap((body): StagedBody[] =>
      supportedRequestContentTypes.has(body.contentType)
        ? [{ contentType: body.contentType, key: stage(identity, "body", body.schema, { io: "input" }) }]
        : [],
    );
    if (bodyKeys.length > 0 && uncertainBodyMethods.has(identity.method)) {
      warningCollector.add({
        code: "request-body-semantics-undefined",
        operation: identity,
        message: `HTTP ${identity.method.toUpperCase()} request bodies do not have reliably defined semantics.`,
      });
    }

    const responses = stageResponses(candidate, stage, warningCollector.add);
    return {
      ...candidate,
      parameterKeys,
      bodyKeys,
      responses,
    };
  });

  const converted = zodJsonSchemas({
    schemas: projections,
    ...(options.references === undefined ? {} : { references: options.references }),
  });
  appendSchemaWarnings(converted, projectionContexts, warningCollector.add);
  const paths: Record<string, PathItemObject> = {};

  for (const operation of staged) {
    const projected = projectOperation(operation, converted, converted.requiredSchemas, warningCollector.add);
    const pathItem = (paths[operation.identity.path] ??= {});
    (pathItem as Record<string, unknown>)[operation.identity.method] = projected;
  }

  const schemas = converted.components as Record<string, SchemaObject>;
  const securitySchemes = projectSecuritySchemes(staged, warningCollector.add);
  const hasSchemas = Object.keys(schemas).length > 0;
  const hasSecuritySchemes = Object.keys(securitySchemes).length > 0;

  const document: OpenApiDocument = {
    openapi: "3.1.0",
    info: options.info,
    paths,
    ...(hasSchemas || hasSecuritySchemes
      ? {
          components: {
            ...(hasSchemas ? { schemas } : {}),
            ...(hasSecuritySchemes ? { securitySchemes } : {}),
          },
        }
      : {}),
  };

  return { document, warnings: warningCollector.warnings };
}

function collectOperationCandidates(
  metadataPaths: readonly (readonly MergedHttpMetadata[])[],
  addWarning: (warning: SwaggerWarning) => void,
): OperationCandidate[] {
  const collected: OperationCandidate[] = [];
  const byKey = new Map<string, { candidate: OperationCandidate; duplicates: number }>();

  for (const metadata of resolveRouteMetadataPaths(metadataPaths)) {
    if (metadata.openApi !== true) continue;
    const routePath = convertRoutePath(metadata.route.path);
    const method = metadata.route.method.toLowerCase();
    const identity = { method, path: routePath.openApiPath };
    if (!supportedMethods.has(method)) {
      addWarning({
        code: "unsupported-method",
        operation: identity,
        message: `HTTP method ${JSON.stringify(metadata.route.method)} cannot be projected as an OpenAPI operation.`,
      });
      continue;
    }

    const key = `${method}\0${routePath.openApiPath}`;
    const existing = byKey.get(key);
    if (existing !== undefined) {
      existing.candidate.variantCount++;
      existing.candidate.hasRawFileBody ||= metadata.file !== undefined;
      for (const contentType of metadata.unsupportedRequestContentTypes) {
        if (!existing.candidate.unsupportedRequestContentTypes.includes(contentType)) {
          existing.candidate.unsupportedRequestContentTypes.push(contentType);
        }
      }
      const body = metadata.body;
      if (
        body !== undefined &&
        !existing.candidate.bodyVariants.some(({ contentType }) => contentType === body.contentType)
      ) {
        existing.candidate.bodyVariants.push(body);
        continue;
      }
      existing.duplicates++;
      continue;
    }
    const candidate: OperationCandidate = {
      metadata,
      identity,
      pathParameters: routePath.parameters,
      bodyVariants: metadata.body === undefined ? [] : [metadata.body],
      hasRawFileBody: metadata.file !== undefined,
      unsupportedRequestContentTypes: [...metadata.unsupportedRequestContentTypes],
      variantCount: 1,
    };
    byKey.set(key, { candidate, duplicates: 0 });
    collected.push(candidate);
  }

  for (const { candidate, duplicates } of byKey.values()) {
    if (duplicates === 0) continue;
    addWarning({
      code: "duplicate-operation",
      operation: candidate.identity,
      occurrences: duplicates,
      message: `${duplicates} later route ${duplicates === 1 ? "operation was" : "operations were"} discarded.`,
    });
  }
  return collected;
}

function stageResponses(
  candidate: OperationCandidate,
  stage: (
    operation: SwaggerOperationIdentity,
    source: SwaggerSchemaSource,
    schemas: readonly [ZodType<any, any>, ...ZodType<any, any>[]],
    projection: Omit<SchemaProjection, "schemas">,
  ) => string,
  addWarning: (warning: SwaggerWarning) => void,
): StagedResponse[] {
  const grouped = new Map<number | "default", { schemas: StagedSchema[]; identities: Set<ZodType<any, any>> }>();
  const { identity, metadata } = candidate;

  for (const rawResponse of metadata.responses ?? []) {
    const status = (rawResponse as { status: unknown }).status;
    if (!isSupportedResponseStatus(status)) {
      addWarning({
        code: "unsupported-response-status",
        operation: identity,
        status,
        message: `Response status ${String(status)} is not a supported final HTTP response status.`,
      });
      continue;
    }

    const group = grouped.get(status) ?? { schemas: [], identities: new Set() };
    grouped.set(status, group);
    const content = rawResponse.content;
    if (content === undefined) continue;
    if (content.contentType !== "application/json") {
      addWarning({
        code: "unsupported-content-type",
        operation: identity,
        source: "response",
        contentType: content.contentType,
        message: `Response content type ${JSON.stringify(content.contentType)} is not supported by this OpenAPI projection.`,
      });
      continue;
    }
    if (identity.method === "head" || (typeof status === "number" && bodylessStatuses.has(status))) {
      addWarning({
        code: "response-body-not-allowed",
        operation: identity,
        status,
        message: `Response ${String(status)} cannot include content for this operation.`,
      });
      continue;
    }
    if (group.identities.has(content.schema)) continue;
    group.identities.add(content.schema);
    const key = stage(identity, "response", [content.schema], { io: "output" });
    group.schemas.push({ key });
  }

  return [...grouped.entries()].map(([status, group]) => ({ status, schemas: group.schemas }));
}

function appendSchemaWarnings(
  converted: ZodJsonSchemasResult,
  contexts: ReadonlyMap<string, ProjectionContext>,
  addWarning: (warning: SwaggerWarning) => void,
): void {
  for (const warning of converted.warnings) {
    const context = contexts.get(warning.schema);
    if (context === undefined) continue;
    const referenceName = "referenceName" in warning ? warning.referenceName : undefined;
    const source =
      referenceName !== undefined &&
      (context.source === "body" || context.source === "response") &&
      !converted.referenceDirectionConflicts.includes(referenceName)
        ? "component"
        : context.source;

    switch (warning.reason) {
      case "unsupported-schema-group":
        addWarning({
          code: "unsupported-parameter-group",
          operation: context.operation,
          source: context.source as SwaggerParameterSource,
          message: warning.message,
        });
        break;
      case "unsupported-schema-property":
        if (context.source === "headers" && reservedHeaderNames.has(warning.property.toLowerCase())) break;
        addWarning({
          code: "unsupported-parameter-shape",
          operation: context.operation,
          source: context.source as SwaggerParameterSource,
          parameter: warning.property,
          message: warning.message,
        });
        if (context.source === "params" && !routeParameterNames(context.operation.path).has(warning.property)) {
          addWarning({
            code: "orphan-path-parameter",
            operation: context.operation,
            parameter: warning.property,
            message: `Path parameter ${JSON.stringify(warning.property)} has no matching route placeholder.`,
          });
        }
        break;
      case "reference-direction-conflict":
        addWarning({
          code: "reference-direction-conflict",
          operation: context.operation,
          referenceName: warning.referenceName,
          message: warning.message,
        });
        break;
      case "bigint":
      case "bounded-date":
      case "non-json-literal":
        addWarning({
          code: "schema-approximated",
          operation: context.operation,
          source,
          reason: warning.reason,
          ...(warning.referenceName === undefined ? {} : { referenceName: warning.referenceName }),
          message: warning.message,
        });
        break;
      case "unrepresentable":
        addWarning({
          code: "schema-conversion-failed",
          operation: context.operation,
          source,
          reason: "unrepresentable",
          ...(warning.referenceName === undefined ? {} : { referenceName: warning.referenceName }),
          ...(warning.cause === undefined ? {} : { cause: warning.cause }),
          message: warning.message,
        });
        break;
    }
  }
}

function projectOperation(
  operation: StagedOperation,
  converted: ZodJsonSchemasResult,
  requiredSchemas: ReadonlySet<string>,
  addWarning: (warning: SwaggerWarning) => void,
): OperationObject {
  const parameters = projectParameters(operation, converted, addWarning);
  const bodySchemas = operation.bodyKeys.flatMap(({ contentType, key }) => {
    const schema = converted.schemas[key];
    return schema === undefined ? [] : [{ contentType, key, schema }];
  });
  const requestBody =
    bodySchemas.length === 0
      ? undefined
      : {
          required:
            operation.bodyKeys.length === operation.variantCount &&
            operation.bodyKeys.every(({ key }) => requiredSchemas.has(key)),
          content: Object.fromEntries(
            bodySchemas.map(({ contentType, schema }) => [contentType, { schema: schema as SchemaObject }]),
          ),
        };
  const security = projectSecurityRequirements(operation.metadata);

  return {
    ...(operation.metadata.title === undefined ? {} : { summary: operation.metadata.title }),
    ...(operation.metadata.description === undefined ? {} : { description: operation.metadata.description }),
    ...(operation.metadata.tags === undefined ? {} : { tags: [...operation.metadata.tags] }),
    ...(security === undefined ? {} : { security }),
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(requestBody === undefined ? {} : { requestBody }),
    responses: projectResponses(operation.responses, converted),
  };
}

function projectSecuritySchemes(
  operations: readonly StagedOperation[],
  addWarning: (warning: SwaggerWarning) => void,
): Record<string, SecuritySchemeObject> {
  const definitions = new Map<string, SecurityScheme>();
  for (const operation of operations) {
    for (const group of operation.metadata.securitySchemes ?? []) {
      for (const [name, scheme] of Object.entries(group)) {
        const previous = definitions.get(name);
        if (previous !== undefined && !securitySchemeEquals(previous, scheme)) {
          addWarning({
            code: "security-scheme-overridden",
            operation: operation.identity,
            scheme: name,
            message: `Security scheme ${JSON.stringify(name)} overrides an earlier definition with the same key.`,
          });
        }
        definitions.set(name, scheme);
      }
    }
  }
  return Object.fromEntries([...definitions].map(([name, scheme]) => [name, projectSecurityScheme(scheme)]));
}

function projectSecurityRequirements(metadata: MergedHttpMetadata): SecurityRequirementObject[] | undefined {
  if (metadata.securitySchemes === undefined) return undefined;
  const schemes = [...new Set(metadata.securitySchemes.flatMap((group) => Object.keys(group)))];
  const requirements: SecurityRequirementObject[] = [
    ...(metadata.optionalSecurity ? [{}] : []),
    ...schemes.map((name) => ({ [name]: [] })),
  ];
  return requirements.length === 0 ? undefined : requirements;
}

function securitySchemeEquals(first: SecurityScheme, second: SecurityScheme): boolean {
  if (first.scheme !== second.scheme || first.description !== second.description) return false;
  switch (first.scheme) {
    case "basic":
      return true;
    case "bearer":
      return second.scheme === "bearer" && first.bearerFormat === second.bearerFormat;
    case "cookie":
      return second.scheme === "cookie" && first.cookieName === second.cookieName;
    case "apiKey":
      return second.scheme === "apiKey" && first.in === second.in && first.name === second.name;
  }
}

function projectSecurityScheme(scheme: SecurityScheme): SecuritySchemeObject {
  const description = scheme.description === undefined ? {} : { description: scheme.description };
  switch (scheme.scheme) {
    case "basic":
      return { type: "http", scheme: "basic", ...description };
    case "bearer":
      return {
        type: "http",
        scheme: "bearer",
        ...(scheme.bearerFormat === undefined ? {} : { bearerFormat: scheme.bearerFormat }),
        ...description,
      };
    case "cookie":
      return { type: "apiKey", in: "cookie", name: scheme.cookieName, ...description };
    case "apiKey":
      return {
        type: "apiKey",
        in: scheme.in === "headers" ? "header" : "query",
        name: scheme.name,
        ...description,
      };
  }
}

function projectParameters(
  operation: StagedOperation,
  converted: ZodJsonSchemasResult,
  addWarning: (warning: SwaggerWarning) => void,
): ParameterObject[] {
  const output: ParameterObject[] = [];
  const projectedGroups = new Map<
    SwaggerParameterSource,
    { properties: Record<string, JsonSchema>; required: Set<string> }
  >();

  for (const source of ["params", "query", "headers", "cookies"] as const) {
    const key = operation.parameterKeys[source];
    if (key === undefined) continue;
    const schema = converted.schemas[key];
    if (schema === undefined) continue;
    projectedGroups.set(source, {
      properties: schemaProperties(schema),
      required: new Set((schema.required as readonly string[] | undefined) ?? []),
    });
  }

  const pathGroup = projectedGroups.get("params");
  const placeholders = new Set(operation.pathParameters.map((parameter) => parameter.name));
  if (pathGroup !== undefined) {
    for (const parameter of Object.keys(pathGroup.properties)) {
      if (placeholders.has(parameter)) continue;
      addWarning({
        code: "orphan-path-parameter",
        operation: operation.identity,
        parameter,
        message: `Path parameter ${JSON.stringify(parameter)} has no matching route placeholder.`,
      });
    }
  }

  for (const pathParameter of operation.pathParameters) {
    if (pathParameter.wildcard) {
      const description =
        "Captures the remaining path segments. This wildcard is approximated as one path parameter; embedded slashes may not survive generated-client encoding.";
      output.push({
        name: pathParameter.name,
        in: "path",
        required: true,
        description,
        schema: { type: "string" },
      });
      addWarning({
        code: "wildcard-path-approximated",
        operation: operation.identity,
        parameter: pathParameter.name,
        message: `Wildcard path parameter ${JSON.stringify(pathParameter.name)} was approximated as a string parameter.`,
      });
      continue;
    }
    const schema = pathGroup?.properties[pathParameter.name] ?? { type: "string" };
    output.push(parameterObject(pathParameter.name, "path", schema, true));
  }

  for (const source of ["query", "headers", "cookies"] as const) {
    const group = projectedGroups.get(source);
    if (group === undefined) continue;
    const location = parameterLocation(source);
    for (const [name, schema] of Object.entries(group.properties)) {
      if (source === "headers" && reservedHeaderNames.has(name.toLowerCase())) continue;
      output.push(parameterObject(name, location, schema, group.required.has(name), source === "query"));
    }
  }

  return output;
}

function parameterObject(
  name: string,
  location: "cookie" | "header" | "path" | "query",
  schema: JsonSchema,
  required: boolean,
  query = false,
): ParameterObject {
  const examples = schema.examples;
  const array = schema.type === "array";
  return {
    name,
    in: location,
    required,
    schema: schema as SchemaObject,
    ...(query && array ? { style: "form", explode: true } : {}),
    ...(Array.isArray(examples) && examples.length > 0 ? { example: examples[0] } : {}),
  };
}

function projectResponses(responses: readonly StagedResponse[], converted: ZodJsonSchemasResult): ResponsesObject {
  const projected: Record<string, ResponseObject> = {};
  for (const response of responses) {
    const schemas = response.schemas.flatMap(({ key }) => {
      const schema = converted.schemas[key];
      return schema === undefined ? [] : [schema];
    });
    const schema = schemas.length === 1 ? schemas[0] : schemas.length > 1 ? { anyOf: schemas } : undefined;
    projected[String(response.status)] = {
      description: response.status === "default" ? "Response" : (STATUS_CODES[response.status] ?? "Response"),
      ...(schema === undefined ? {} : { content: { "application/json": { schema: schema as SchemaObject } } }),
    };
  }
  if (Object.keys(projected).length === 0) projected.default = { description: "Response" };
  return projected;
}

function parameterLocation(source: Exclude<SwaggerParameterSource, "params">): "cookie" | "header" | "query" {
  if (source === "cookies") return "cookie";
  if (source === "headers") return "header";
  return "query";
}

function isSupportedResponseStatus(status: unknown): status is number | "default" {
  return (
    status === "default" || (typeof status === "number" && Number.isInteger(status) && status >= 200 && status <= 599)
  );
}

function schemaProperties(schema: JsonSchema): Record<string, JsonSchema> {
  return (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
}

function convertRoutePath(path: string): RoutePath {
  const parameters: PathParameter[] = [];
  const converted = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        const name = segment.slice(1);
        parameters.push({ name, wildcard: false });
        return `{${name}}`;
      }
      if (segment.startsWith("*")) {
        const name = segment.slice(1) || "wildcard";
        parameters.push({ name, wildcard: true });
        return `{${name}}`;
      }
      return segment;
    })
    .join("/");
  return { openApiPath: converted, parameters };
}

function routeParameterNames(path: string): Set<string> {
  const names = new Set<string>();
  for (const segment of path.split("/")) {
    if (segment.startsWith("{") && segment.endsWith("}")) names.add(segment.slice(1, -1));
  }
  return names;
}

function createWarningCollector(): {
  readonly warnings: SwaggerWarning[];
  readonly add: (warning: SwaggerWarning) => void;
} {
  const warnings: SwaggerWarning[] = [];
  const keys = new Set<string>();

  function add(warning: SwaggerWarning): void {
    const key = `${warning.code}\0${warning.operation.method}\0${warning.operation.path}\0${warningSubject(warning)}`;
    if (keys.has(key)) return;
    keys.add(key);
    warnings.push(warning);
  }

  return { warnings, add };
}

function warningSubject(warning: SwaggerWarning): string {
  switch (warning.code) {
    case "orphan-path-parameter":
    case "unsupported-parameter-shape":
    case "wildcard-path-approximated":
      return warning.parameter;
    case "reference-direction-conflict":
      return warning.referenceName;
    case "security-scheme-overridden":
      return warning.scheme;
    case "response-body-not-allowed":
      return String(warning.status);
    case "schema-approximated":
    case "schema-conversion-failed":
      return `${warning.source}\0${warning.reason}\0${warning.referenceName ?? ""}`;
    case "unsupported-content-type":
      return `${warning.source}\0${warning.contentType}`;
    case "unsupported-parameter-group":
      return warning.source;
    case "unsupported-response-status":
      return String(warning.status);
    default:
      return "";
  }
}

function resolveRouteMetadataPaths(metadataPaths: readonly (readonly MergedHttpMetadata[])[]): ResolvedRouteMetadata[] {
  const routes: ResolvedRouteMetadata[] = [];

  for (const path of metadataPaths) {
    let resolved: MergedHttpMetadata = {};
    const unsupportedRequestContentTypes: string[] = [];
    for (const metadata of path) {
      resolved = mergeHttpMetadata(resolved, metadata);
      if (metadata.body !== undefined && !supportedRequestContentTypes.has(metadata.body.contentType)) {
        unsupportedRequestContentTypes.push(metadata.body.contentType);
      }
    }
    if (resolved.route !== undefined) {
      routes.push({
        ...resolved,
        route: resolved.route,
        unsupportedRequestContentTypes,
      });
    }
  }
  return routes;
}
