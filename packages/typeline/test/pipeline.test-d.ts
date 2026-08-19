import { expectTypeOf } from "vitest";

import { stop, typeline, type Middleware, type Typeline, type TypelineOpts } from "../src/index";

type Input = { value: number };
type Context = { requestId: string };
type Metadata = { name: string };

const options: TypelineOpts<Context> = {
  onError(error, input, context) {
    expectTypeOf(error).toEqualTypeOf<unknown>();
    expectTypeOf(input).toEqualTypeOf<unknown>();
    expectTypeOf(context).toEqualTypeOf<Context>();
  },
};
const root = typeline<Input, Input, Context, Metadata>(options);
expectTypeOf(root).toEqualTypeOf<Typeline<Input, Input, Context, Metadata>>();

const middlewareFunction: Middleware<Input, number, Context, Metadata> = (input, context) =>
  input.value + context.requestId.length;
const middlewareDescriptor: Middleware<Input, number, Context, Metadata> = {
  mw: (input, context) => input.value + context.requestId.length,
  metadata: { name: "number" },
};
const metadataMiddleware: Middleware<Input, Input, Context, Metadata> = {
  metadata: { name: "audit" },
};
expectTypeOf(middlewareFunction).toMatchTypeOf<Middleware<Input, number, Context, Metadata>>();
expectTypeOf(middlewareDescriptor).toMatchTypeOf<Middleware<Input, number, Context, Metadata>>();
expectTypeOf(metadataMiddleware).toMatchTypeOf<Middleware<Input, Input, Context, Metadata>>();
// @ts-expect-error Metadata-only middleware cannot change the output type.
const invalidMetadataMiddleware: Middleware<Input, number, Context, Metadata> = {
  metadata: { name: "audit" },
};

const numberLine = root.pipe((input, context) => input.value + context.requestId.length);
expectTypeOf(numberLine).toEqualTypeOf<Typeline<Input, number, Context, Metadata>>();

const asyncLine = numberLine.pipe(async (value) => String(value));
expectTypeOf(asyncLine).toEqualTypeOf<Typeline<Input, string, Context, Metadata>>();

const described = asyncLine.pipe({
  mw: (value, context) => ({ value, requestId: context.requestId }),
  metadata: [{ name: "format" }, { name: "request" }],
});
expectTypeOf(described).toEqualTypeOf<
  Typeline<Input, { value: string; requestId: string }, Context, Metadata>
>();

const metadataOnly = asyncLine.pipe({ metadata: { name: "audit" } });
expectTypeOf(metadataOnly).toEqualTypeOf<Typeline<Input, string, Context, Metadata>>();

const child = typeline<string, string, Context, Metadata>().pipe((value) => value.length);
expectTypeOf(asyncLine.pipe(child)).toEqualTypeOf<Typeline<Input, number, Context, Metadata>>();

expectTypeOf(stop).returns.toEqualTypeOf<never>();

root.push({ value: 1 }, { requestId: "request-1" });
// @ts-expect-error Push requires the pipeline context.
root.push({ value: 1 });
// @ts-expect-error Push input must match the pipeline input.
root.push({ value: "1" }, { requestId: "request-1" });
// @ts-expect-error Middleware metadata must match the configured metadata type.
root.pipe({ mw: (input) => input, metadata: { invalid: true } });
// @ts-expect-error A nested typeline must accept the current output.
numberLine.pipe(typeline<string, string, Context, Metadata>());
