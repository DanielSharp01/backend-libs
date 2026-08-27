import { Readable } from "node:stream";

import { expectTypeOf } from "vitest";
import { z } from "zod";

import type { HttpMetadata } from "../src/metadata";
import { setRequestDefaults, type HttpRouteResolution } from "../src/request";
import type { HttpResponse } from "../src/response";
import { router, type HttpContext } from "../src/router";
import {
  validateBody,
  validateFile,
  validateMultipart,
  validateParams,
  validateQuery,
  validateUrlEncoded,
} from "../src/validate";

declare const context: HttpContext;
declare const response: HttpResponse;

expectTypeOf(context.req.body).toEqualTypeOf<Buffer | undefined>();
expectTypeOf(context.req.readBody()).toEqualTypeOf<Promise<Buffer>>();
expectTypeOf(context.req.readCookies()).toEqualTypeOf<Record<string, string>>();
expectTypeOf(context.req.defaults.bodySize).toEqualTypeOf<number | null>();
expectTypeOf(context.req.resolution).toEqualTypeOf<HttpRouteResolution | undefined>();
expectTypeOf(context.req.route?.params).toEqualTypeOf<Record<string, string> | undefined>();

expectTypeOf(
  response.status(201).header("x-value", "yes").cookie("session", "value").send(),
).toEqualTypeOf<HttpResponse>();
expectTypeOf(response.header({ "x-first": "one", "x-second": 2 })).toEqualTypeOf<HttpResponse>();
expectTypeOf(response.redirect("/login")).toEqualTypeOf<HttpResponse>();
expectTypeOf(response.redirect("/complete", 303)).toEqualTypeOf<HttpResponse>();
expectTypeOf(response.flushHeaders()).toEqualTypeOf<HttpResponse>();
expectTypeOf(response.destroy()).toEqualTypeOf<void>();
expectTypeOf(response.wrapUnsendable()).toEqualTypeOf<import("../src/response").UnsendableResponseError | undefined>();
expectTypeOf(response.write("event\n\n")).toEqualTypeOf<Promise<void>>();
expectTypeOf(response.write(new Uint8Array())).toEqualTypeOf<Promise<void>>();
expectTypeOf(response.sendStream(Readable.from(["file"]))).toEqualTypeOf<Promise<void>>();
expectTypeOf(response.sendFile("assets/app.js", { root: "/srv/app" })).toEqualTypeOf<Promise<void>>();

interface AppContext extends HttpContext {
  requestId: string;
}

const app = router<AppContext>();
const configured = app.use(setRequestDefaults({ bodySize: 1024 }));

configured.post("/items/:id", (line) => {
  const params = line.pipe(validateParams(z.object({ id: z.coerce.number() })));
  const query = params
    .pipe(validateQuery(z.object({ page: z.coerce.number() })))
    .pipe(
      validateQuery(z.object({ rawSort: z.string() }).transform(({ rawSort }) => ({ sort: rawSort.toUpperCase() }))),
    );

  return query.pipe((input, routeContext) => {
    expectTypeOf(input.params.id).toEqualTypeOf<number>();
    expectTypeOf(input.query.page).toEqualTypeOf<number>();
    expectTypeOf(input.query.sort).toEqualTypeOf<string>();
    expectTypeOf(routeContext).toEqualTypeOf<AppContext>();
    expectTypeOf(routeContext.req.route).toEqualTypeOf<HttpContext["req"]["route"]>();
    return input;
  });
});

configured.post({ path: "/json", contentTypes: ["application/json"] }, (line) =>
  line.pipe(validateBody(z.object({ count: z.number() }))).pipe((input, routeContext) => {
    expectTypeOf(input.body.count).toEqualTypeOf<number>();
    expectTypeOf(routeContext.req.headers).toEqualTypeOf<HttpContext["req"]["headers"]>();
    return input;
  }),
);

configured.post({ path: "/form", contentTypes: ["application/x-www-form-urlencoded"] }, (line) =>
  line
    .pipe(validateUrlEncoded(z.object({ count: z.number(), enabled: z.boolean(), tags: z.array(z.string()) })))
    .pipe((input) => {
      expectTypeOf(input.body.count).toEqualTypeOf<number>();
      expectTypeOf(input.body.enabled).toEqualTypeOf<boolean>();
      expectTypeOf(input.body.tags).toEqualTypeOf<string[]>();
      return input;
    }),
);

// @ts-expect-error URL-encoded validation requires an object schema.
validateUrlEncoded(z.string());

configured.post({ path: "/multipart", contentTypes: ["multipart/form-data"] }, (line) =>
  line
    .pipe(
      validateMultipart(z.object({ title: z.string(), avatar: z.file().optional(), attachments: z.file().array() })),
    )
    .pipe((input) => {
      expectTypeOf(input.body.title).toEqualTypeOf<string>();
      expectTypeOf(input.body.avatar).toEqualTypeOf<File | undefined>();
      expectTypeOf(input.body.attachments).toEqualTypeOf<File[]>();
      return input;
    }),
);

// @ts-expect-error Multipart validation requires an object schema.
validateMultipart(z.file());

configured.put({ path: "/raw-file", contentTypes: ["image/png"] }, (line) =>
  line.pipe(validateFile(z.file().mime("image/png"))).pipe((input) => {
    expectTypeOf(input.file).toEqualTypeOf<File>();
    return input;
  }),
);

// @ts-expect-error Raw file validation requires a Zod file schema.
validateFile(z.string());

const defaults = setRequestDefaults({ bodySize: 256 });
expectTypeOf(defaults({ authenticated: true as const }, context)).toEqualTypeOf<{ authenticated: true }>();

const metadataOnly: { metadata: HttpMetadata } = { metadata: { title: "Items", openApi: true } };
configured.get("/metadata", (line) => line.pipe(metadataOnly));

// @ts-expect-error Request headers are read-only.
context.req.headers["x-value"] = "changed";

// @ts-expect-error Request bodies are buffers, not readable streams.
context.req.body = Readable.from([]);

// @ts-expect-error The old routeResolution property was removed.
context.req.routeResolution;

// @ts-expect-error The response stream operation is named sendStream.
response.pipe(Readable.from([]));

// @ts-expect-error Redirect accepts only response statuses that perform navigation.
response.redirect("/unchanged", 304);

// @ts-expect-error Result-based validators were removed.
type RemovedResultValidator = typeof import("../src/validate").validateQueryResult;

// @ts-expect-error Custom metadata namespacing was removed.
const invalidMetadata: HttpMetadata = { custom: { operationId: "listItems" } };
