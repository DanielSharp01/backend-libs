import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";

import { expectTypeOf } from "vitest";

import { router, type HttpContext, type RootRouter, type Router } from "../src/router";

interface AppContext extends HttpContext {
  services: { users: { find(id: string): Promise<{ id: string }> } };
}

const app = router<AppContext>();
expectTypeOf(app).toEqualTypeOf<RootRouter<{}, {}, AppContext>>();
expectTypeOf(app.compile()).toEqualTypeOf<void>();

const authenticated = app.use((input: {}) => ({ ...input, authenticated: true as const }));
expectTypeOf(authenticated).toEqualTypeOf<Router<{}, { authenticated: true }, AppContext>>();

authenticated.get("/users/:id", (line) =>
  line.pipe((input, context) => {
    expectTypeOf(input.authenticated).toEqualTypeOf<true>();
    expectTypeOf(context).toEqualTypeOf<AppContext>();
    expectTypeOf(context.req.route).toEqualTypeOf<AppContext["req"]["route"]>();
    expectTypeOf(context.res).toEqualTypeOf<AppContext["res"]>();
    return context.services.users.find(context.req.route?.params.id ?? "");
  }),
);

authenticated.post({ path: "/users", contentTypes: ["application/json", "multipart/form-data"] }, (line) =>
  line.pipe((input) => input.authenticated),
);

authenticated.route({ method: "OPTIONS", path: "/users", contentTypes: ["application/json"] }, (line) => line);
authenticated.post({ path: "/unrestricted" }, (line) => line);
authenticated.route({ method: "PUT", path: "/raw-file" }, (line) => line);

expectTypeOf(app.requestListener({ onError: (_error, _input, context) => context.res.send() })).toBeFunction();
expectTypeOf(app.mount({ port: 0, http: { requestTimeout: 1_000 }, onError: () => undefined })).toEqualTypeOf<
  Promise<HttpServer>
>();
expectTypeOf(app.mount({ port: 0, https: { key: "key", cert: "cert" }, onError: () => undefined })).toEqualTypeOf<
  Promise<HttpsServer>
>();

// @ts-expect-error Route registration requires a builder.
app.get("/missing-builder");

// @ts-expect-error Router stages no longer expose Typeline.pipe directly.
app.pipe((input: {}) => input);

// @ts-expect-error Only the supported HTTP method union can be registered.
app.route({ method: "CONNECT", path: "/tunnel", contentTypes: ["application/json"] }, (line) => line);

// @ts-expect-error An error handler is required when creating a request listener.
app.requestListener({});

// @ts-expect-error An error handler is required when mounting.
app.mount({ port: 0 });
