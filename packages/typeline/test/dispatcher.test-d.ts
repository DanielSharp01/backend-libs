import { expectTypeOf } from "vitest";

import {
  mapDispatcher,
  predicateDispatcher,
  typeline,
  type MapDispatcher,
  type PredicateDispatcher,
  type Typeline,
} from "../src/index";

type Input = { value: number };
type Context =
  | { route: "admin"; permissions: string[] }
  | { route: "public"; cache: boolean };
type Metadata = { name: string };

const predicates = predicateDispatcher<Input, Context, Metadata>();
expectTypeOf(predicates).toEqualTypeOf<PredicateDispatcher<Input, Input, Context, Metadata>>();
expectTypeOf(predicates.push).parameters.toEqualTypeOf<[input: Input, context: Context]>();
expectTypeOf(predicates.push).returns.toEqualTypeOf<Promise<unknown>>();
const transformed = predicates.use((input, context) => `${context.route}:${input.value}`);
expectTypeOf(transformed).toEqualTypeOf<PredicateDispatcher<Input, string, Context, Metadata>>();
const described = transformed.use({
  mw: (input, context) => ({ input, route: context.route }),
  metadata: { name: "describe" },
});
expectTypeOf(described).toEqualTypeOf<
  PredicateDispatcher<Input, { input: string; route: "admin" | "public" }, Context, Metadata>
>();

const measured = typeline<string, string, Context, Metadata>().pipe((input) => input.length);
expectTypeOf(transformed.use(measured)).toEqualTypeOf<PredicateDispatcher<Input, number, Context, Metadata>>();
expectTypeOf(transformed.use({ metadata: { name: "audit" } })).toEqualTypeOf<
  PredicateDispatcher<Input, string, Context, Metadata>
>();
// @ts-expect-error A nested typeline must accept the dispatcher's current input.
transformed.use(typeline<number, number, Context, Metadata>());

const adminBuilder = (line: Typeline<string, string, Extract<Context, { route: "admin" }>, Metadata>) =>
  line.pipe((input, context) => `${input}:${context.permissions.length}`);
transformed.on(
  (context): context is Extract<Context, { route: "admin" }> => context.route === "admin",
  adminBuilder,
);
const publicBuilder = (line: Typeline<string, string, Extract<Context, { route: "public" }>, Metadata>) => line;
// @ts-expect-error The predicate branch builder must use the narrowed context.
transformed.on((context): context is Extract<Context, { route: "admin" }> => context.route === "admin", publicBuilder);

const mapped: MapDispatcher<Input, Input, Context, Metadata, ["route"]> = mapDispatcher<
  Input,
  Context,
  Metadata,
  ["route"]
>((path) => path.route);
expectTypeOf(mapped.push).parameters.toEqualTypeOf<[input: Input, context: Context]>();
expectTypeOf(mapped.push).returns.toEqualTypeOf<Promise<unknown>>();
mapped.on("admin", (line) => line.pipe((input, context) => `${input.value}:${context.permissions.length}`));
const mappedTransformed = mapped.use({
  mw: (input, context) => `${context.route}:${input.value}`,
  metadata: { name: "format" },
});
expectTypeOf(mappedTransformed).toEqualTypeOf<MapDispatcher<Input, string, Context, Metadata, ["route"]>>();
expectTypeOf(mappedTransformed.use({ metadata: { name: "audit" } })).toEqualTypeOf<
  MapDispatcher<Input, string, Context, Metadata, ["route"]>
>();
// @ts-expect-error Mapped branch keys must be values at the selected context path.
mapped.on("missing", (line) => line);
