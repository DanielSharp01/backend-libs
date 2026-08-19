import { describe, expect, it } from "vitest";
import { z } from "zod";

import { validate } from "@hyperjump/json-schema/openapi-3-1";
import { tapInput } from "@danielsharp/typeline";
import { zodReferences } from "@danielsharp/zod";

import type { HttpMetadata } from "../src/metadata";
import { jsonResponseMeta, responseMeta } from "../src/respond";
import { router } from "../src/router";
import { swagger } from "../src/swagger";
import {
  validateBody,
  validateCookies,
  validateFile,
  validateHeaders,
  validateMultipart,
  validateParams,
  validateQuery,
  validateUrlEncoded,
} from "../src/validate";

const info = { title: "Test API", version: "1.0.0" };

function securityMetadata(
  securitySchemes: NonNullable<HttpMetadata["securitySchemes"]>,
  optionalSecurity = false,
) {
  return { metadata: { securitySchemes, optionalSecurity } satisfies HttpMetadata };
}

describe("Swagger", () => {
  it("builds directly from registered lines without compiling or mutating the router", () => {
    const app = router();
    app.get("/visible", (line) => line.pipe({ metadata: { openApi: true } }));
    app.get("/hidden", (line) => line.pipe({ metadata: { openApi: false } }));

    const result = swagger(app, { info });

    expect(Object.keys(result.document.paths ?? {})).toEqual(["/visible"]);
    expect(result.warnings).toEqual([]);
    expect(() => app.get("/later", (line) => line)).not.toThrow();
  });

  it("inherits OpenAPI metadata through later router middleware", () => {
    const app = router();
    const api = app
      .scope("/api")
      .use({ metadata: { openApi: true } })
      .use(tapInput(() => undefined));

    api.get("/users", (line) => line);

    expect(Object.keys(swagger(app, { info }).document.paths ?? {})).toEqual(["/api/users"]);
  });

  it("projects selected security scheme alternatives into components and operations", async () => {
    const securitySchemes = {
      basicAuth: { scheme: "basic", description: "Account credentials" },
      bearerAuth: { scheme: "bearer", bearerFormat: "JWT", description: "Access token" },
      cookieAuth: { scheme: "cookie", cookieName: "session", description: "Session cookie" },
      queryKey: { scheme: "apiKey", in: "query", name: "api_key", description: "Query key" },
      headerKey: { scheme: "apiKey", in: "headers", name: "X-API-Key", description: "Header key" },
    } satisfies NonNullable<HttpMetadata["securitySchemes"]>;
    const app = router();
    const api = app.scope("/api").use({ metadata: { openApi: true } });
    api.use(securityMetadata(securitySchemes)).get("/protected", (line) => line);

    const document = swagger(app, { info }).document;

    expect(document.components?.securitySchemes).toEqual({
      basicAuth: { type: "http", scheme: "basic", description: "Account credentials" },
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Access token" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "session", description: "Session cookie" },
      queryKey: { type: "apiKey", in: "query", name: "api_key", description: "Query key" },
      headerKey: { type: "apiKey", in: "header", name: "X-API-Key", description: "Header key" },
    });
    expect(document.paths?.["/api/protected"]?.get?.security).toEqual([
      { basicAuth: [] },
      { bearerAuth: [] },
      { cookieAuth: [] },
      { queryKey: [] },
      { headerKey: [] },
    ]);
    await expectOpenApiDocument(document);
  });

  it("documents optional authentication as anonymous or any selected scheme", async () => {
    const securitySchemes = {
      basicAuth: { scheme: "basic" },
      bearerAuth: { scheme: "bearer" },
    } satisfies NonNullable<HttpMetadata["securitySchemes"]>;
    const app = router();
    app
      .use({ metadata: { openApi: true } })
      .use(securityMetadata(securitySchemes, true))
      .get("/optional", (line) => line);

    const document = swagger(app, { info }).document;

    expect(document.paths?.["/optional"]?.get?.security).toEqual([{}, { basicAuth: [] }, { bearerAuth: [] }]);
    await expectOpenApiDocument(document);
  });

  it("warns when a later security scheme overrides an earlier definition with the same key", async () => {
    const first = securityMetadata({ sharedAuth: { scheme: "bearer", bearerFormat: "JWT" } });
    const second = securityMetadata({
      sharedAuth: { scheme: "apiKey", in: "headers", name: "X-API-Key" },
    });
    const app = router();
    app
      .use({ metadata: { openApi: true } })
      .use(first)
      .use(second)
      .get("/overridden", (line) => line);

    const result = swagger(app, { info });

    expect(result.document.paths?.["/overridden"]?.get?.security).toEqual([{ sharedAuth: [] }]);
    expect(result.document.components?.securitySchemes).toEqual({
      sharedAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    });
    expect(result.warnings).toEqual([
      {
        code: "security-scheme-overridden",
        operation: { method: "get", path: "/overridden" },
        scheme: "sharedAuth",
        message: 'Security scheme "sharedAuth" overrides an earlier definition with the same key.',
      },
    ]);
    await expectOpenApiDocument(result.document);
  });

  it("projects operation metadata, parameters, a request body, and responses", async () => {
    const references = zodReferences();
    const body = z
      .object({ name: z.string(), note: z.string().optional() })
      .default({ name: "anonymous" })
      .register(references.registry, { description: "Create-user input" });
    const response = z.object({ id: z.string(), createdAt: z.date() });
    const app = router();

    app.post("/users/:id", (line) =>
      line
        .pipe(validateParams(z.object({ id: z.number(), orphan: z.string() })))
        .pipe(validateQuery(z.object({ tags: z.array(z.string()), page: z.number().optional() })))
        .pipe(
          validateHeaders(
            z.object({
              "x-tenant": z.string().register(references.registry, { examples: ["acme"] }),
              authorization: z.object({ scheme: z.string() }),
            }),
          ),
        )
        .pipe(validateCookies(z.object({ session: z.string().optional() })))
        .pipe(validateBody(body))
        .pipe({ metadata: { openApi: true, title: "Create user", description: "Creates one user", tags: ["users"] } })
        .pipe(jsonResponseMeta(response, 201)),
    );

    const result = swagger(app, { info, references });
    const operation = result.document.paths?.["/users/{id}"]?.post;

    expect(operation).toMatchObject({
      summary: "Create user",
      description: "Creates one user",
      tags: ["users"],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description: "Create-user input",
              properties: { name: { type: "string" }, note: { type: "string" } },
              required: ["name"],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
      },
    });
    expect(operation?.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "number" } },
      {
        name: "tags",
        in: "query",
        required: true,
        schema: { type: "array", items: { type: "string" } },
        style: "form",
        explode: true,
      },
      { name: "page", in: "query", required: false, schema: { type: "number" } },
      {
        name: "x-tenant",
        in: "header",
        required: true,
        schema: { type: "string", examples: ["acme"] },
        example: "acme",
      },
      { name: "session", in: "cookie", required: false, schema: { type: "string" } },
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "orphan-path-parameter",
        operation: { method: "post", path: "/users/{id}" },
        parameter: "orphan",
      }),
    ]);
    await expectOpenApiDocument(result.document);
  });

  it("merges repeated validator schemas and combines distinct response schemas", async () => {
    const first = z.object({ first: z.string(), shared: z.string().min(2) });
    const second = z.object({ second: z.number(), shared: z.string().max(4) });
    const app = router();

    app.post("/merged", (line) =>
      line
        .pipe(validateQuery(first))
        .pipe(validateQuery(second))
        .pipe(validateBody(first))
        .pipe(validateBody(second))
        .pipe(jsonResponseMeta(first, 200))
        .pipe(jsonResponseMeta(first, 200))
        .pipe(responseMeta(200))
        .pipe(jsonResponseMeta(second, 200))
        .pipe({ metadata: { openApi: true } }),
    );

    const result = swagger(app, { info });
    const operation = result.document.paths?.["/merged"]?.post;

    expect(operation?.parameters).toEqual([
      { name: "first", in: "query", required: true, schema: { type: "string" } },
      { name: "shared", in: "query", required: true, schema: { type: "string", maxLength: 4 } },
      { name: "second", in: "query", required: true, schema: { type: "number" } },
    ]);
    expect(operation).toHaveProperty("requestBody.content.application/json.schema", {
      type: "object",
      properties: {
        first: { type: "string" },
        shared: { type: "string", maxLength: 4 },
        second: { type: "number" },
      },
      required: ["first", "shared", "second"],
    });
    expect(operation).toHaveProperty("requestBody.required", true);
    expect(operation?.responses?.["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            anyOf: [{ properties: { first: { type: "string" } } }, { properties: { second: { type: "number" } } }],
          },
        },
      },
    });
    expect(result.warnings).toEqual([]);
    await expectOpenApiDocument(result.document);
  });

  it("documents URL-encoded bodies and merges content variants for one operation", async () => {
    const app = router();
    const json = z.object({ name: z.string(), source: z.literal("json") });
    const form = z.object({ name: z.string(), count: z.number().optional() }).default({ name: "anonymous" });
    const multipart = z.object({ name: z.string(), avatar: z.file(), attachments: z.file().array().optional() });

    app.post({ path: "/items", contentTypes: ["application/json"] }, (line) =>
      line.pipe(validateBody(json)).pipe({ metadata: { openApi: true } }),
    );
    app.post({ path: "/items", contentTypes: ["application/x-www-form-urlencoded"] }, (line) =>
      line.pipe(validateUrlEncoded(form)).pipe({ metadata: { openApi: true } }),
    );
    app.post({ path: "/items", contentTypes: ["multipart/form-data"] }, (line) =>
      line.pipe(validateMultipart(multipart)).pipe({ metadata: { openApi: true } }),
    );

    const result = swagger(app, { info });
    const requestBody = result.document.paths?.["/items"]?.post?.requestBody;

    expect(requestBody).toEqual({
      required: false,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { name: { type: "string" }, source: { type: "string", const: "json" } },
            required: ["name", "source"],
          },
        },
        "application/x-www-form-urlencoded": {
          schema: {
            type: "object",
            default: { name: "anonymous" },
            properties: { name: { type: "string" }, count: { type: "number" } },
            required: ["name"],
          },
        },
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              avatar: { type: "string", format: "binary", contentEncoding: "binary" },
              attachments: {
                type: "array",
                items: { type: "string", format: "binary", contentEncoding: "binary" },
              },
            },
            required: ["name", "avatar"],
          },
        },
      },
    });
    expect(result.warnings).toEqual([]);
    await expectOpenApiDocument(result.document);
  });

  it("warns once and omits raw file request body metadata", async () => {
    const app = router();
    app.put({ path: "/avatar", contentTypes: ["image/png"] }, (line) =>
      line
        .pipe(validateFile(z.file().mime("image/png")))
        .pipe({ metadata: { body: { contentType: "image/png", schema: z.file() }, openApi: true } }),
    );

    const result = swagger(app, { info });
    const operation = result.document.paths?.["/avatar"]?.put;

    expect(operation?.requestBody).toBeUndefined();
    expect(result.warnings).toEqual([
      {
        code: "raw-file-body-unsupported",
        operation: { method: "put", path: "/avatar" },
        message: "Raw file request bodies cannot be projected because their media type is not present in metadata.",
      },
    ]);
    await expectOpenApiDocument(result.document);
  });

  it("omits unsupported pieces and returns structured warnings", () => {
    const app = router();
    app.get("/files/:bucket/*rest", (line) =>
      line
        .pipe({
          metadata: {
            openApi: true,
            params: z.object({ bucket: z.number(), orphan: z.string() }),
            query: z.object({ values: z.array(z.number()), nested: z.object({ value: z.string() }) }),
            headers: z.union([z.object({ one: z.string() }), z.object({ two: z.string() })]),
            body: { contentType: "text/plain", schema: z.string() },
          },
        })
        .pipe(validateBody(z.object({ value: z.string() })))
        .pipe({
          metadata: {
            responses: [
              { status: 101, content: { contentType: "application/json", schema: z.string() } },
              { status: 204, content: { contentType: "application/json", schema: z.string() } },
              { status: 222, content: { contentType: "text/plain", schema: z.string() } },
              {
                status: 200,
                content: { contentType: "application/json", schema: z.string().transform((value) => value.length) },
              },
            ],
          } as HttpMetadata,
        }),
    );

    const result = swagger(app, { info });
    const operation = result.document.paths?.["/files/{bucket}/{rest}"]?.get;

    expect(operation?.parameters).toEqual([
      { name: "bucket", in: "path", required: true, schema: { type: "number" } },
      expect.objectContaining({ name: "rest", in: "path", required: true }),
      {
        name: "values",
        in: "query",
        required: true,
        schema: { type: "array", items: { type: "number" } },
        style: "form",
        explode: true,
      },
    ]);
    expect(operation).toHaveProperty("requestBody.content.application/json.schema.properties.value.type", "string");
    expect(operation?.responses).toEqual({
      "200": { description: "OK" },
      "204": { description: "No Content" },
      "222": { description: "Response" },
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "unsupported-content-type",
      "request-body-semantics-undefined",
      "unsupported-response-status",
      "response-body-not-allowed",
      "unsupported-content-type",
      "schema-conversion-failed",
      "unsupported-parameter-shape",
      "unsupported-parameter-group",
      "orphan-path-parameter",
      "wildcard-path-approximated",
    ]);
  });

  it("preserves one-way references and inlines a reference used in both directions", async () => {
    const references = zodReferences();
    const Shared = references.asReference(z.object({ shared: z.string() }), "Shared");
    const Input = references.asReference(z.object({ input: z.string() }), "Input");
    const Output = references.asReference(z.object({ output: z.string() }), "Output");
    const app = router();

    app.post("/references", (line) =>
      line
        .pipe(validateBody(z.object({ input: Input, shared: Shared })))
        .pipe(jsonResponseMeta(z.object({ output: Output, shared: Shared }), 200))
        .pipe({ metadata: { openApi: true } }),
    );

    const result = swagger(app, { info, references });
    const operation = result.document.paths?.["/references"]?.post;

    expect(result.document.components?.schemas).toHaveProperty("Input");
    expect(result.document.components?.schemas).toHaveProperty("Output");
    expect(result.document.components?.schemas).not.toHaveProperty("Shared");
    expect(operation).toHaveProperty(
      "requestBody.content.application/json.schema.properties.input.$ref",
      "#/components/schemas/Input",
    );
    expect(operation).not.toHaveProperty("requestBody.content.application/json.schema.properties.shared.$ref");
    expect(operation).toHaveProperty(
      "responses.200.content.application/json.schema.properties.output.$ref",
      "#/components/schemas/Output",
    );
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "reference-direction-conflict", referenceName: "Shared" }),
    ]);
    await expectOpenApiDocument(result.document);
  });
});

async function expectOpenApiDocument(document: unknown): Promise<void> {
  const result = await validate("https://spec.openapis.org/oas/3.1/schema-base", JSON.parse(JSON.stringify(document)));
  expect(result.valid).toBe(true);
}
