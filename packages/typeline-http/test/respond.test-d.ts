import { expectTypeOf } from "vitest";
import { z } from "zod";

import { selectInput, stop, typeline, type Typeline } from "@danielsharp/typeline";

import type { HttpMetadata } from "../src/metadata";
import { jsonResSend, jsonResponseMeta, resEnd, resRedirect, responseMeta } from "../src/respond";
import type { HttpContext } from "../src/router";
import { validateQuery } from "../src/validate";

type OutputOf<T> = T extends Typeline<any, infer TOutput, any, any> ? TOutput : never;

const responseSchema = z.object({ page: z.number() });
const route = typeline<{}, {}, HttpContext, HttpMetadata>().pipe(validateQuery(z.object({ page: z.coerce.number() })));
type RouteInput = OutputOf<typeof route>;
declare const routeInput: RouteInput;
expectTypeOf(routeInput.query.page).toEqualTypeOf<number>();
expectTypeOf<RouteInput>().not.toHaveProperty("req");

const sender = jsonResSend(responseSchema, 200);

const ended = route.pipe(selectInput((input: RouteInput) => ({ page: input.query.page }), sender));
const bodyless = route.pipe(resEnd(204));
const redirected = route.pipe(selectInput((input: RouteInput) => `/pages/${input.query.page}`, resRedirect(302)));
const bareTerminal = route.pipe({ mw: async () => stop() });
const functionTerminal = route.pipe(async () => stop());
expectTypeOf<OutputOf<typeof ended>>().toBeNever();
expectTypeOf<OutputOf<typeof bodyless>>().toBeNever();
expectTypeOf<OutputOf<typeof redirected>>().toBeNever();
expectTypeOf<OutputOf<typeof bareTerminal>>().toBeNever();
expectTypeOf<OutputOf<typeof functionTerminal>>().toBeNever();

const asyncObject = route.pipe({ mw: async (input) => ({ ...input, ready: true as const }) });
expectTypeOf<OutputOf<typeof asyncObject>["ready"]>().toEqualTypeOf<true>();

const documented = route.pipe(jsonResponseMeta(responseSchema, "default")).pipe(responseMeta(404));
expectTypeOf<OutputOf<typeof documented>["query"]["page"]>().toEqualTypeOf<number>();

expectTypeOf(sender.mw).parameter(0).toEqualTypeOf<{ page: number }>();
expectTypeOf(sender.mw).parameter(1).toEqualTypeOf<HttpContext>();
expectTypeOf(sender.mw({ page: 1 }, {} as HttpContext)).toEqualTypeOf<Promise<never>>();
expectTypeOf(jsonResponseMeta(responseSchema, "default").metadata.responses).not.toBeNever();
expectTypeOf(resEnd(204).mw({}, {} as HttpContext)).toEqualTypeOf<Promise<never>>();
expectTypeOf(resRedirect(303).mw("/complete", {} as HttpContext)).toEqualTypeOf<Promise<never>>();
expectTypeOf(responseMeta("default").metadata.responses).not.toBeNever();

// @ts-expect-error The sender input must match the schema output.
sender.mw({ page: "wrong" }, {} as HttpContext);

// @ts-expect-error A runtime sender requires an exact status code.
jsonResSend(responseSchema, "default");

// @ts-expect-error The response status is required.
resEnd();

// @ts-expect-error Redirect middleware accepts only redirect response statuses.
resRedirect(304);
