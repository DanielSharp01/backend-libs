import { expectTypeOf } from "vitest";

import { catchErr, type Middleware, type Typeline } from "../src/index";

type Input = { value: number };
type Context = { requestId: string };
type Metadata = { name: string };

const middleware = catchErr<Input, string, number, Context, Metadata>(
  (line) =>
    line
      .pipe({ metadata: { name: "protected" } })
      .pipe((input, context) => `${context.requestId}:${input.value}`),
  (line) =>
    line
      .pipe({ metadata: { name: "recovery" } })
      .pipe((error, context) => (error instanceof Error ? error.message.length : context.requestId.length)),
);

expectTypeOf(middleware).toMatchTypeOf<Middleware<Input, string | number, Context, Metadata>>();
expectTypeOf(middleware.mw).parameter(0).toEqualTypeOf<Input>();
expectTypeOf(middleware.mw).parameter(1).toEqualTypeOf<Context>();
expectTypeOf(middleware.mw({ value: 1 }, { requestId: "request-1" })).toEqualTypeOf<Promise<string | number>>();
expectTypeOf(middleware.metadata).toEqualTypeOf<Metadata[]>();

catchErr<Input, string, number, Context, Metadata>(
  // @ts-expect-error The protected builder must accept the declared input.
  (line: Typeline<number, number, Context, Metadata>) => line.pipe(String),
  (line) => line.pipe(() => 0),
);

catchErr<Input, string, number, Context, Metadata>(
  (line) => line.pipe(({ value }) => String(value)),
  // @ts-expect-error The recovery builder receives unknown errors.
  (line: Typeline<Error, Error, Context, Metadata>) => line.pipe(() => 0),
);
