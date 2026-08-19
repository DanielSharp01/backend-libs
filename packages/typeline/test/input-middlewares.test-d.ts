import { expectTypeOf } from "vitest";

import { extendInput, moveInput, omitInput, pickInput, tapInput } from "../src/input-middlewares";

type Input = { path: string; request: { id: string } };

const merged = extendInput((input: Input) => ({ pathLength: input.path.length }));
expectTypeOf<Awaited<ReturnType<typeof merged>>>().toEqualTypeOf<Input & { pathLength: number }>();

const assigned = extendInput("request", async (input: Input) => ({ ...input.request, authenticated: true as const }));
expectTypeOf<Awaited<ReturnType<typeof assigned>>>().toEqualTypeOf<
  Omit<Input, "request"> & { request: { id: string; authenticated: true } }
>();

const tapped = tapInput(async (input: Input) => {
  expectTypeOf(input).toEqualTypeOf<Input>();
  return input.path;
});
expectTypeOf<Awaited<ReturnType<typeof tapped>>>().toEqualTypeOf<Input>();

const moved = moveInput("request", "originalRequest")({ path: "/users", request: { id: "user" } });
expectTypeOf(moved.path).toEqualTypeOf<string>();
expectTypeOf(moved.originalRequest).toEqualTypeOf<{ id: string }>();
// @ts-expect-error The source property is removed from the output type.
moved.request;

const picked = pickInput({ path: true, request: true })({ path: "/users", request: { id: "user" }, hidden: true });
expectTypeOf(picked).toEqualTypeOf<{ path: string; request: { id: string } }>();

const omitted = omitInput({ request: true })({ path: "/users", request: { id: "user" }, hidden: true });
expectTypeOf(omitted).toEqualTypeOf<{ path: string; hidden: boolean }>();
