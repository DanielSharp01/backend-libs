import type { IncomingMessage } from "node:http";
import { File } from "node:buffer";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import { BodyFormatError, BodySizeError, HeaderFormatError, HttpValidationError } from "../src/errors";
import { httpRequest } from "../src/request";
import type { HttpResponse } from "../src/response";
import type { HttpContext } from "../src/router";
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

describe("HTTP validators", () => {
  it("parses and caches a JSON body, then merges validated fields", async () => {
    const input = requestContext("POST", "/users", '{"createdAt":"2026-08-18","count":2}');
    const first = await validateBody(z.object({ count: z.number() })).mw({ body: { retained: true } }, input);
    const output = await validateBody(z.object({ createdAt: z.coerce.date() })).mw(first, input);

    expect(output.body).toEqual({
      retained: true,
      count: 2,
      createdAt: new Date("2026-08-18"),
    });
    expect(input.req.body?.toString("utf8")).toBe('{"createdAt":"2026-08-18","count":2}');
  });

  it("uses a caller-supplied body buffer without consuming the request stream", async () => {
    const input = requestContext("POST", "/users", "not valid json");
    input.req.body = Buffer.from('{"count":2}');

    await expect(validateBody(z.object({ count: z.number() })).mw({}, input)).resolves.toEqual({
      body: { count: 2 },
    });
    expect(input.req.raw.readableEnded).toBe(false);
  });

  it("rejects non-JSON bodies before reading them", async () => {
    const input = requestContext("POST", "/users", "plain text", "text/plain");

    await expect(validateBody(z.object({ count: z.number() })).mw({}, input)).rejects.toMatchObject({
      code: BodyFormatError.code,
      contentType: "application/json",
      cause: expect.any(TypeError),
    });
    expect(input.req.body).toBeUndefined();
    expect(input.req.raw.readableEnded).toBe(false);
  });

  it("wraps invalid JSON as a body format error", async () => {
    const input = requestContext("POST", "/users", '{"count":');

    await expect(validateBody(z.object({ count: z.number() })).mw({}, input)).rejects.toMatchObject({
      code: BodyFormatError.code,
      contentType: "application/json",
      cause: expect.any(SyntaxError),
    });
    expect(input.req.body?.toString("utf8")).toBe('{"count":');
  });

  it("lets the schema decide whether an empty JSON body is valid", async () => {
    const input = requestContext("POST", "/users");

    await expect(validateBody(z.object({ count: z.number().optional() }).default({})).mw({}, input)).resolves.toEqual({
      body: {},
    });
  });

  it("accepts normalized JSON content types and the routing default", async () => {
    await expect(
      validateBody(z.number()).mw({}, requestContext("POST", "/value", "5", "Application/JSON; charset=utf-8")),
    ).resolves.toEqual({ body: 5 });
    await expect(validateBody(z.number()).mw({}, requestContext("POST", "/value", "5", undefined))).resolves.toEqual({
      body: 5,
    });
  });

  it("parses URL-encoded values with flat scalar-or-array semantics", async () => {
    const input = requestContext(
      "POST",
      "/users",
      "name=Daniel+Sharp&tag=one&tag=two&count=5&enabled=true&createdAt=2026-08-22&user%5Bname%5D=literal",
      "Application/X-WWW-Form-Urlencoded; charset=UTF-8",
    );
    const schema = z.object({
      name: z.string(),
      tag: z.array(z.string()),
      count: z.number(),
      enabled: z.boolean(),
      createdAt: z.date(),
      "user[name]": z.string(),
    });

    await expect(validateUrlEncoded(schema).mw({ body: { retained: true } }, input)).resolves.toEqual({
      body: {
        retained: true,
        name: "Daniel Sharp",
        tag: ["one", "two"],
        count: 5,
        enabled: true,
        createdAt: new Date("2026-08-22"),
        "user[name]": "literal",
      },
    });
    expect(input.req.body?.toString("utf8")).toContain("name=Daniel+Sharp");
  });

  it("represents a URL-encoded key according to how many times it occurs", async () => {
    const schema = z.object({
      one: z.union([z.string(), z.array(z.string())]),
      many: z.union([z.string(), z.array(z.string())]),
    });
    const input = requestContext(
      "POST",
      "/values",
      "one=first&many=first&many=second",
      "application/x-www-form-urlencoded",
    );

    await expect(validateUrlEncoded(schema).mw({}, input)).resolves.toEqual({
      body: { one: "first", many: ["first", "second"] },
    });
  });

  it("lets a URL-encoded schema decide whether an empty form is valid", async () => {
    const input = requestContext("POST", "/users", "", "application/x-www-form-urlencoded");

    await expect(validateUrlEncoded(z.object({ name: z.string().optional() })).mw({}, input)).resolves.toEqual({
      body: {},
    });
  });

  it("rejects a mismatched URL-encoded content type before reading the body", async () => {
    const input = requestContext("POST", "/users", "name=Daniel", "application/json");

    await expect(validateUrlEncoded(z.object({ name: z.string() })).mw({}, input)).rejects.toMatchObject({
      code: BodyFormatError.code,
      contentType: "application/x-www-form-urlencoded",
      cause: expect.any(TypeError),
    });
    expect(input.req.body).toBeUndefined();
    expect(input.req.raw.readableEnded).toBe(false);
  });

  it("parses multipart text and file parts with flat scalar-or-array semantics", async () => {
    const form = new FormData();
    form.append("title", "Hello world");
    form.append("tag", "first");
    form.append("tag", "second");
    form.append("count", "5");
    form.append("enabled", "true");
    form.append("avatar", new File(["avatar"], "avatar.txt", { type: "text/plain" }));
    form.append("attachment", new File(["first file"], "first.txt", { type: "text/plain" }));
    form.append("attachment", new File(["second file"], "second.bin", { type: "application/octet-stream" }));
    const input = await multipartContext(form);
    const schema = z.object({
      title: z.string(),
      tag: z.string().array(),
      count: z.number(),
      enabled: z.boolean(),
      avatar: z.file().mime("text/plain"),
      attachment: z.file().array(),
    });

    const output = await validateMultipart(schema).mw({ body: { retained: true } }, input);

    expect(output.body).toMatchObject({
      retained: true,
      title: "Hello world",
      tag: ["first", "second"],
      count: 5,
      enabled: true,
    });
    expect(output.body.avatar).toBeInstanceOf(File);
    expect(output.body.avatar).toMatchObject({ name: "avatar.txt", size: 6, type: "text/plain" });
    await expect(output.body.avatar.text()).resolves.toBe("avatar");
    expect(output.body.attachment).toHaveLength(2);
    expect(output.body.attachment[0]).toMatchObject({ name: "first.txt", type: "text/plain" });
    expect(output.body.attachment[1]).toMatchObject({ name: "second.bin", type: "application/octet-stream" });
    await expect(output.body.attachment[1]!.text()).resolves.toBe("second file");
    expect(input.req.body).toBeInstanceOf(Buffer);
  });

  it("lets a multipart schema accept absent optional files and an empty form", async () => {
    const input = await multipartContext(new FormData());

    await expect(validateMultipart(z.object({ avatar: z.file().optional() })).mw({}, input)).resolves.toEqual({
      body: {},
    });
  });

  it("rejects a mismatched multipart content type before reading the body", async () => {
    const input = requestContext("POST", "/upload", "title=wrong", "application/x-www-form-urlencoded");

    await expect(validateMultipart(z.object({ title: z.string() })).mw({}, input)).rejects.toMatchObject({
      code: BodyFormatError.code,
      contentType: "multipart/form-data",
      cause: expect.any(TypeError),
    });
    expect(input.req.body).toBeUndefined();
    expect(input.req.raw.readableEnded).toBe(false);
  });

  it("wraps malformed multipart framing as a body format error", async () => {
    const input = requestContext(
      "POST",
      "/upload",
      '--expected\r\nContent-Disposition: form-data; name="title"\r\n\r\nbroken',
      "multipart/form-data; boundary=expected",
    );

    await expect(validateMultipart(z.object({ title: z.string() })).mw({}, input)).rejects.toMatchObject({
      code: BodyFormatError.code,
      contentType: "multipart/form-data",
      cause: expect.any(Error),
    });
  });

  it("preserves body-size errors while buffering multipart input", async () => {
    const form = new FormData();
    form.append("title", "larger than the configured request body");
    const input = await multipartContext(form);
    input.req.defaults.bodySize = 10;

    await expect(validateMultipart(z.object({ title: z.string() })).mw({}, input)).rejects.toMatchObject({
      code: BodySizeError.code,
      maximumBodySize: 10,
    });
  });

  it("validates a raw request body as a native file", async () => {
    const input = requestContext("PUT", "/avatar", "raw file bytes", "Image/PNG; charset=binary");

    const output = await validateFile(z.file().mime("image/png").max(20)).mw({ retained: true }, input);

    expect(output).toMatchObject({ retained: true });
    expect(output.file).toBeInstanceOf(File);
    expect(output.file).toMatchObject({ name: "", size: 14, type: "image/png" });
    await expect(output.file.text()).resolves.toBe("raw file bytes");
    expect(input.req.body).toBeInstanceOf(Buffer);
  });

  it("reports raw file schema failures as body validation errors", async () => {
    const input = requestContext("PUT", "/avatar", "not a png", "text/plain");

    await expect(validateFile(z.file().mime("image/png")).mw({}, input)).rejects.toMatchObject({
      code: HttpValidationError.code,
      source: "body",
      cause: expect.any(ZodError),
    });
  });

  it("validates raw headers, cookies, query values, and route params", async () => {
    const input = routedContext("GET", "/users/42?page=3");

    await expect(validateHeaders(z.object({ "x-count": z.coerce.number() })).mw({}, input)).resolves.toEqual({
      headers: { "x-count": 2 },
    });
    await expect(validateCookies(z.object({ enabled: z.stringbool() })).mw({}, input)).resolves.toEqual({
      cookies: { enabled: true },
    });
    await expect(validateQuery(z.object({ page: z.coerce.number() })).mw({}, input)).resolves.toEqual({
      query: { page: 3 },
    });
    await expect(validateParams(z.object({ id: z.coerce.number() })).mw({}, input)).resolves.toEqual({
      params: { id: 42 },
    });
  });

  it("matches header schema keys case-insensitively and preserves their declared casing", async () => {
    const input = requestContext("GET", "/users");

    await expect(validateHeaders(z.object({ "X-Count": z.coerce.number() })).mw({}, input)).resolves.toEqual({
      headers: { "X-Count": 2 },
    });
  });

  it("merges repeated validation into the existing input branch", async () => {
    const input = routedContext("GET", "/users/42?page=3");
    const first = await validateQuery(z.object({ page: z.coerce.number() })).mw({ query: { retained: true } }, input);

    await expect(
      validateQuery(z.object({ page: z.string().transform((value) => `raw:${value}`) })).mw(first, input),
    ).resolves.toEqual({ query: { retained: true, page: "raw:3" } });
  });

  it("lazily parses and retains raw cookies on the request facade", async () => {
    const input = requestContext("GET", "/users", "", "application/json", { cookie: "enabled=true" });

    await expect(validateCookies(z.object({ enabled: z.stringbool() })).mw({}, input)).resolves.toEqual({
      cookies: { enabled: true },
    });
    expect(input.req.cookies).toEqual({ enabled: "true" });
  });

  it("bubbles malformed cookie headers before schema validation", async () => {
    const input = requestContext("GET", "/users", "", "application/json", {
      cookie: "enabled=true; malformed",
    });

    await expect(validateCookies(z.object({ enabled: z.stringbool() })).mw({}, input)).rejects.toMatchObject({
      code: HeaderFormatError.code,
      headerName: "cookie",
    });
    expect(input.req.cookies).toBeUndefined();
  });

  it("wraps schema failures with their validation source and Zod cause", async () => {
    const routed = routedContext("GET", "/users/42?page=invalid");
    const cases = [
      [
        "body",
        () =>
          validateBody(z.object({ count: z.number() })).mw({}, requestContext("POST", "/users", '{"count":"wrong"}')),
      ],
      [
        "body",
        async () => {
          const form = new FormData();
          form.append("avatar", new File(["not png"], "avatar.txt", { type: "text/plain" }));
          return validateMultipart(z.object({ avatar: z.file().mime("image/png") })).mw(
            {},
            await multipartContext(form),
          );
        },
      ],
      [
        "body",
        () =>
          validateUrlEncoded(z.object({ count: z.number() })).mw(
            {},
            requestContext("POST", "/users", "count=wrong", "application/x-www-form-urlencoded"),
          ),
      ],
      ["headers", () => validateHeaders(z.object({ "x-count": z.string().min(2) })).mw({}, routed)],
      ["cookies", () => validateCookies(z.object({ enabled: z.literal("false") })).mw({}, routed)],
      ["query", () => validateQuery(z.object({ page: z.coerce.number() })).mw({}, routed)],
      ["params", () => validateParams(z.object({ id: z.literal("different") })).mw({}, routed)],
    ] as const;

    for (const [source, validation] of cases) {
      await expect(validation()).rejects.toMatchObject({
        code: HttpValidationError.code,
        source,
        cause: expect.any(ZodError),
      });
    }
  });
});

function requestContext(
  method: string,
  path: string,
  body: string | Buffer = "",
  contentType: string | undefined = "application/json",
  headers: IncomingMessage["headers"] = {},
): HttpContext {
  const raw = Object.assign(Readable.from([body]), {
    headers: { "content-type": contentType, "x-count": "2", ...headers },
    method,
    socket: {},
    url: path,
  }) as unknown as IncomingMessage;
  return { req: httpRequest(raw), res: {} as HttpResponse };
}

async function multipartContext(form: FormData): Promise<HttpContext> {
  const serialized = new Request("http://localhost/upload", { method: "POST", body: form });
  const contentType = serialized.headers.get("content-type");
  if (contentType === null) throw new TypeError("FormData serialization did not produce a Content-Type header.");
  return requestContext("POST", "/upload", Buffer.from(await serialized.arrayBuffer()), contentType);
}

function routedContext(method: string, path: string): HttpContext {
  const input = requestContext(method, path);
  input.req.cookies = { enabled: "true" };
  input.req.route = {
    method: "GET",
    path: "/users/:id",
    params: { id: "42" },
  };
  return input;
}
