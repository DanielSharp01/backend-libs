import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { branch, catchErr, concurrently, Semaphore, stop, typeline, type TypelineBuilder } from "@danielsharp/typeline";

import {
  AmbiguousRouteError,
  DuplicateRouteError,
  MalformedPathEncodingError,
  RouteNotMatchedError,
  RouterCompiledError,
  RouterNotCompiledError,
} from "../src/errors";
import {
  BadRequest,
  type HttpError,
  ImATeapot,
  InternalServerError,
  MethodNotAllowed,
  NotFound,
  UnsupportedMediaType,
} from "../src/http-error";
import type { HttpMetadata } from "../src/metadata";
import { httpRequest } from "../src/request";
import type { HttpResponse } from "../src/response";
import { httpRouteResolver } from "../src/resolver";
import {
  builtinErrorMapping,
  defaultErrorHandler,
  router,
  type HttpContext,
  type RouteDefinition,
} from "../src/router";

describe("router", () => {
  it("builds a route from the current middleware stage", async () => {
    const app = router<HttpContext>();
    const authenticated = app.use((input: {}) => ({ ...input, authenticated: true as const }));

    authenticated.get("/users/:userId", (line) =>
      line.pipe((input, context) => ({
        authenticated: input.authenticated,
        userId: context.req.route?.params.userId,
      })),
    );

    expect(app.lines).toHaveLength(1);
    expect(app.lines[0]?.metadata).toEqual([{ route: { method: "GET", path: "/users/:userId" } }]);
    const request = context("GET", "/users/42");
    request.req.route = { method: "GET", path: "/users/:userId", params: { userId: "42" } };
    await expect(app.lines[0]?.push({}, request)).resolves.toEqual({ authenticated: true, userId: "42" });
  });

  it("applies successive middleware stages in registration order", async () => {
    const app = router<HttpContext>();
    const configured = app.use((input: {}) => ({ ...input, value: 3 })).use((input) => ({ value: input.value * 2 }));

    configured.get("/value", (line) => line);

    await expect(app.lines[0]?.push({}, context("GET", "/value"))).resolves.toEqual({ value: 6 });
  });

  it("registers every convenience method without a content-type restriction", () => {
    const app = router<HttpContext>();
    const registrations = [
      ["GET", app.get],
      ["POST", app.post],
      ["PUT", app.put],
      ["PATCH", app.patch],
      ["DELETE", app.delete],
      ["OPTIONS", app.options],
      ["HEAD", app.head],
    ] as const;

    for (const [method, register] of registrations) {
      register.call(app, `/${method.toLowerCase()}`, (line) => line);
    }

    expect(app.lines.map((line) => line.metadata[0]?.route)).toEqual(
      registrations.map(([method]) => ({ method, path: `/${method.toLowerCase()}` })),
    );
  });

  it("accepts an explicit route definition", () => {
    const app = router<HttpContext>();

    app.route({ method: "POST", path: "/upload", contentTypes: ["multipart/form-data"] }, (line) => line);

    expect(app.lines[0]?.metadata).toEqual([{ route: { method: "POST", path: "/upload" } }]);
  });

  it("applies a scope prefix to descendant routes", () => {
    const app = router<HttpContext>();

    app.scope("/api").get("/items", (line) => line);

    expect(app.lines[0]?.metadata[0]?.route?.path).toBe("/api/items");
  });

  it("reports uncompiled resolution through the listener error handler", () => {
    const app = router<HttpContext>();
    app.get("/items", (line) => line);
    const onError = vi.fn();
    const listener = app.requestListener({ onError });

    listener(rawRequest("GET", "/items"), rawResponse());

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: RouterNotCompiledError.code }),
      {},
      expect.anything(),
    );
  });

  it("resolves from a request listener after explicit compilation", () => {
    const app = router<HttpContext>();
    app.get("/items", (line) => line);
    app.compile();
    const onError = vi.fn();
    const listener = app.requestListener({ onError });

    expect(() => listener(rawRequest("GET", "/items"), rawResponse())).not.toThrow();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["directly", (line) => line.pipe(() => stop())],
    [
      "through catchErr",
      (line) =>
        line.pipe(
          catchErr(
            (protectedLine) => protectedLine.pipe(() => stop()),
            (recoveryLine) => recoveryLine.pipe(() => ({ recovered: true })),
          ),
        ),
    ],
    [
      "through a branch",
      (line) =>
        line.pipe(
          branch<{}, never, HttpContext, HttpMetadata>((when) =>
            when.when(
              (input): input is {} => typeof input === "object",
              (branchLine) => branchLine.pipe(() => stop()),
            ),
          ),
        ),
    ],
    [
      "through concurrently",
      (line) => line.pipe(concurrently(Semaphore(1), (concurrentLine) => concurrentLine.pipe(() => stop()))),
    ],
  ] satisfies Array<readonly [string, TypelineBuilder<{}, any, HttpContext, HttpMetadata>]>)(
    "does not send a stop raised %s to the user error handler",
    async (_kind, build) => {
      const app = router<HttpContext>();
      const entered = vi.fn();
      app.get("/stop", (line) =>
        build(
          line.pipe((input) => {
            entered();
            return input;
          }),
        ),
      );
      app.compile();
      const onError = vi.fn();
      const listener = app.requestListener({ onError });

      listener(rawRequest("GET", "/stop"), rawResponse());

      await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it("still sends ordinary route failures to the user error handler", async () => {
    const failure = new Error("route failed");
    const app = router<HttpContext>();
    app.get("/failure", (line) =>
      line.pipe(() => {
        throw failure;
      }),
    );
    app.compile();
    const onError = vi.fn();
    const listener = app.requestListener({ onError });

    listener(rawRequest("GET", "/failure"), rawResponse());

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith(failure, {}, expect.anything());
  });
});

describe("HTTP route resolver", () => {
  it("requires compilation before resolution and rejects registration afterward", () => {
    const resolver = httpRouteResolver();
    resolver.on(definition("GET", "/items"), outputLine("items"));

    expect(() => resolver.resolve(context("GET", "/items"))).toThrow(
      expect.objectContaining({ code: RouterNotCompiledError.code }),
    );
    resolver.compile();
    expect(() => resolver.on(definition("POST", "/items"), outputLine("post"))).toThrow(
      expect.objectContaining({ code: RouterCompiledError.code }),
    );
  });

  it("dispatches by method and records matched route data", async () => {
    const resolver = httpRouteResolver();
    resolver.on(definition("GET", "/items/:id"), outputLine("get"));
    resolver.on(definition("POST", "/items/:id"), outputLine("post"));
    resolver.compile();
    const request = context("POST", "/items/hello%20world");

    const line = resolver.resolve(request);

    await expect(line.push({}, request)).resolves.toBe("post");
    expect(request.req.route).toEqual({ method: "POST", path: "/items/:id", params: { id: "hello world" } });
    expect(request.req.resolution).toEqual({ status: "matched" });
  });

  it("selects static, parameter, wildcard, and exact routes by specificity", async () => {
    for (const reverse of [false, true]) {
      const resolver = httpRouteResolver();
      const routes = [
        [definition("GET", "/catalog/*rest"), outputLine("wildcard")],
        [definition("GET", "/catalog/:id"), outputLine("parameter")],
        [definition("GET", "/catalog/special"), outputLine("static")],
        [definition("GET", "/catalog"), outputLine("exact")],
      ] as const;
      for (const [match, line] of reverse ? routes.toReversed() : routes) resolver.on(match, line);
      resolver.compile();

      await expect(resolveOutput(resolver, context("GET", "/catalog/special"))).resolves.toBe("static");
      await expect(resolveOutput(resolver, context("GET", "/catalog/item"))).resolves.toBe("parameter");
      await expect(resolveOutput(resolver, context("GET", "/catalog/item/more"))).resolves.toBe("wildcard");
      await expect(resolveOutput(resolver, context("GET", "/catalog/"))).resolves.toBe("exact");
    }
  });

  it("resolves unnamed wildcards and preserves parameter names across methods", () => {
    const resolver = httpRouteResolver();
    resolver.on(definition("GET", "/:entityId/projects/:projectId"), outputLine("get"));
    resolver.on(definition("POST", "/:accountId/projects/:projectId"), outputLine("post"));
    resolver.on(definition("DELETE", "/download/*"), outputLine("delete"));
    resolver.compile();

    const get = context("GET", "/acme/projects/one");
    resolver.resolve(get);
    expect(get.req.route?.params).toEqual({ entityId: "acme", projectId: "one" });

    const post = context("POST", "/acme/projects/two");
    resolver.resolve(post);
    expect(post.req.route?.params).toEqual({ accountId: "acme", projectId: "two" });

    const wildcard = context("DELETE", "/download/one/two");
    resolver.resolve(wildcard);
    expect(wildcard.req.route?.params).toEqual({ wildcard: "one/two" });
  });

  it("selects and normalizes request content types", async () => {
    const resolver = httpRouteResolver();
    resolver.on(definition("POST", "/items", ["application/json"]), outputLine("json"));
    resolver.on(definition("POST", "/items", ["text/plain"]), outputLine("text"));
    resolver.compile();
    const request = context("POST", "/items", { "content-type": "Text/Plain; charset=utf-8" });

    await expect(resolveOutput(resolver, request)).resolves.toBe("text");
  });

  it("matches every request content type when a route omits contentTypes", async () => {
    const resolver = httpRouteResolver();
    resolver.on(definition("POST", "/file", undefined), outputLine("file"));
    resolver.compile();

    await expect(
      resolveOutput(resolver, context("POST", "/file", { "content-type": "application/octet-stream" })),
    ).resolves.toBe("file");
    await expect(resolveOutput(resolver, context("POST", "/file"))).resolves.toBe("file");
  });

  it("reports path, method, and media-type mismatches on the request", () => {
    const resolver = httpRouteResolver();
    resolver.on(definition("GET", "/items"), outputLine("get"));
    resolver.on(definition("POST", "/items", ["text/plain"]), outputLine("post"));
    resolver.compile();

    expectResolution(resolver, context("GET", "/missing"), { status: "path-not-found" });
    expectResolution(resolver, context("PATCH", "/items"), {
      status: "method-not-allowed",
      allowedMethods: ["GET", "POST"],
    });
    expectResolution(resolver, context("POST", "/items"), {
      status: "unsupported-media-type",
      allowedMethods: ["GET", "POST"],
      allowedContentTypes: ["text/plain"],
    });
  });

  it("wraps malformed percent encoding from route traversal", () => {
    const resolver = httpRouteResolver();
    resolver.on(definition("GET", "/items/:id"), outputLine("item"));
    resolver.compile();

    expect(() => resolver.resolve(context("GET", "/items/%"))).toThrow(
      expect.objectContaining({ code: MalformedPathEncodingError.code, encodedValue: "%" }),
    );
  });

  it("rejects duplicate, ambiguous, and invalid route definitions", () => {
    const duplicate = httpRouteResolver();
    duplicate.on(definition("GET", "/items/:id"), outputLine("first"));
    expect(() => duplicate.on(definition("GET", "/items/:id"), outputLine("second"))).toThrow(
      expect.objectContaining({ code: DuplicateRouteError.code }),
    );
    expect(() => duplicate.on(definition("GET", "/items/:name"), outputLine("second"))).toThrow(
      expect.objectContaining({ code: AmbiguousRouteError.code }),
    );

    const unrestricted = httpRouteResolver();
    unrestricted.on(definition("POST", "/files", undefined), outputLine("any"));
    expect(() => unrestricted.on(definition("POST", "/files", ["image/png"]), outputLine("png"))).toThrow(
      expect.objectContaining({ code: DuplicateRouteError.code }),
    );

    for (const invalid of [
      definition("GET", "/items/:"),
      definition("GET", "/items/*rest/more"),
      definition("GET", "/items/:id/:id"),
      definition("GET", "/items", []),
    ]) {
      expect(() => httpRouteResolver().on(invalid, outputLine("invalid"))).toThrow(TypeError);
    }
  });
});

describe("built-in error mapping", () => {
  it("preserves HTTP errors and maps router errors", () => {
    const teapot = new ImATeapot();
    const route = { method: "GET", path: "/items", contentType: "application/json" };
    expect(builtinErrorMapping(teapot)).toBe(teapot);
    expect(builtinErrorMapping(new RouteNotMatchedError({ status: "path-not-found" }, route))).toBeInstanceOf(NotFound);
    const methodNotAllowed = builtinErrorMapping(
      new RouteNotMatchedError({ status: "method-not-allowed", allowedMethods: ["GET", "POST"] }, route),
    );
    expect(methodNotAllowed).toBeInstanceOf(MethodNotAllowed);
    expect(methodNotAllowed).toMatchObject({ details: { allowedMethods: ["GET", "POST"] } });
    const unsupportedMediaType = builtinErrorMapping(
      new RouteNotMatchedError(
        {
          status: "unsupported-media-type",
          allowedMethods: ["POST"],
          allowedContentTypes: ["application/json"],
        },
        route,
      ),
    );
    expect(unsupportedMediaType).toBeInstanceOf(UnsupportedMediaType);
    expect(unsupportedMediaType).toMatchObject({ details: { allowedContentTypes: ["application/json"] } });
    expect(builtinErrorMapping(new MalformedPathEncodingError("%", new URIError()))).toBeInstanceOf(BadRequest);
    expect(builtinErrorMapping(new Error("unknown"))).toBeInstanceOf(InternalServerError);
  });

  it("absorbs and reports failures while sending a mapped HTTP error", async () => {
    const sendFailure = new Error("send failed");
    const send = vi.fn(() => {
      throw sendFailure;
    });
    const mappedError = Object.assign(new Error("mapped"), { send }) satisfies HttpError;
    const mapper = vi.fn(() => mappedError);
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = context("GET", "/items");

    try {
      await expect(
        defaultErrorHandler(mapper)(new Error("route failed"), { item: 1 }, request),
      ).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledWith(request.res);
      expect(report).toHaveBeenCalledWith(expect.any(String), sendFailure);
    } finally {
      report.mockRestore();
    }
  });

  it("absorbs and reports mapper failures", async () => {
    const mapperFailure = new Error("mapper failed");
    const handler = defaultErrorHandler(() => {
      throw mapperFailure;
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(handler(new Error("route failed"), {}, context("GET", "/items"))).resolves.toBeUndefined();
      expect(report).toHaveBeenCalledWith(expect.any(String), mapperFailure);
    } finally {
      report.mockRestore();
    }
  });
});

function definition(
  method: RouteDefinition["method"],
  path: string,
  contentTypes?: readonly string[],
): RouteDefinition {
  return { method, path, ...(contentTypes === undefined ? {} : { contentTypes }) };
}

function outputLine(output: string) {
  return typeline<{}, string, HttpContext, HttpMetadata>().pipe(() => output);
}

async function resolveOutput(resolver: ReturnType<typeof httpRouteResolver>, request: HttpContext) {
  return resolver.resolve(request).push({}, request);
}

function expectResolution(
  resolver: ReturnType<typeof httpRouteResolver>,
  request: HttpContext,
  resolution: HttpContext["req"]["resolution"],
) {
  expect(() => resolver.resolve(request)).toThrow(
    expect.objectContaining({ code: RouteNotMatchedError.code, resolution }),
  );
  expect(request.req.resolution).toEqual(resolution);
}

function context(method: string, path: string, headers: IncomingMessage["headers"] = {}): HttpContext {
  return { req: httpRequest(rawRequest(method, path, headers)), res: {} as HttpResponse };
}

function rawRequest(method: string, path: string, headers: IncomingMessage["headers"] = {}): IncomingMessage {
  return Object.assign(Readable.from([]), { headers, method, socket: {}, url: path }) as unknown as IncomingMessage;
}

function rawResponse(): ServerResponse {
  const response = new Writable();
  Object.assign(response, {
    flushHeaders() {},
    getHeader() {},
    hasHeader() {
      return false;
    },
    setHeader() {
      return response;
    },
  });
  return response as unknown as ServerResponse;
}
