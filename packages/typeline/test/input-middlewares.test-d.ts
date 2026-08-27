import { expectTypeOf } from "vitest";

import {
  extendInput,
  mergeInput,
  moveInput,
  omitInput,
  pickInput,
  selectInput,
  tapInput,
} from "../src/input-middlewares";
import { typeline, type Typeline } from "../src/pipeline";

type OutputOf<T> = T extends Typeline<any, infer TOutput, any, any> ? TOutput : never;
type Input = { path: string; request: { id: string } };
type Context = { requestId: string };
type Metadata = { name: string };

const root = typeline<Input, Input, Context, Metadata>();

const merged = root.pipe(mergeInput((input: Input) => ({ pathLength: input.path.length })));
expectTypeOf<OutputOf<typeof merged>>().toEqualTypeOf<Input & { pathLength: number }>();

const assigned = root.pipe(
  extendInput("request", async (input: Input) => ({ ...input.request, authenticated: true as const })),
);
expectTypeOf<OutputOf<typeof assigned>>().toEqualTypeOf<
  Omit<Input, "request"> & { request: { id: string; authenticated: true } }
>();

const tapped = root.pipe(
  tapInput(async (input: Input, context: Context) => {
    expectTypeOf(input).toEqualTypeOf<Input>();
    expectTypeOf(context).toEqualTypeOf<Context>();
    return input.path;
  }),
);
expectTypeOf<OutputOf<typeof tapped>>().toEqualTypeOf<Input>();

const selected = root.pipe(
  selectInput((input: Input) => input.request, {
    metadata: { name: "request" },
    mw(request: Input["request"], context: Context) {
      expectTypeOf(context).toEqualTypeOf<Context>();
      return request;
    },
  }),
);
expectTypeOf<OutputOf<typeof selected>>().toEqualTypeOf<Input>();
expectTypeOf(selected.metadata).toEqualTypeOf<Metadata[]>();

const moved = moveInput("request", "originalRequest")({ path: "/users", request: { id: "user" } });
expectTypeOf(moved.path).toEqualTypeOf<string>();
expectTypeOf(moved.originalRequest).toEqualTypeOf<{ id: string }>();
// @ts-expect-error The source property is removed from the output type.
moved.request;

const picked = pickInput({ path: true, request: true })({ path: "/users", request: { id: "user" }, hidden: true });
expectTypeOf(picked).toEqualTypeOf<{ path: string; request: { id: string } }>();

const omitted = omitInput({ request: true })({ path: "/users", request: { id: "user" }, hidden: true });
expectTypeOf(omitted).toEqualTypeOf<{ path: string; hidden: boolean }>();
