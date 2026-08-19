import { expectTypeOf } from "vitest";

import { branch, branchOn, branchOnContext, type Typeline } from "../src/index";

type Input =
  | { kind: "created"; payload: { id: string } }
  | { kind: "deleted"; payload: { id: string; hard: boolean } };
type Context = { mode: "sync"; token: string } | { mode: "async"; jobId: number };
type Metadata = { name: string };

const byPredicate = branch<Input, string | boolean, Context, Metadata>((when) =>
  when
    .when(
      (input): input is Extract<Input, { kind: "created" }> => input.kind === "created",
      (line) => line.pipe((input) => input.payload.id),
    )
    .when(
      (input): input is Extract<Input, { kind: "deleted" }> => {
        expectTypeOf(input).toEqualTypeOf<Extract<Input, { kind: "deleted" }>>();
        return input.kind === "deleted";
      },
      (line) => line.pipe((input) => input.payload.hard),
    ),
);
expectTypeOf(byPredicate).returns.toEqualTypeOf<Promise<string | boolean> | undefined>();

const byKind = branchOn<["kind"], Input, string | boolean, Context, Metadata>(
  (path) => path.kind,
  (on) =>
    on
      .on("created", (line) => {
        expectTypeOf(line).toEqualTypeOf<
          Typeline<Extract<Input, { kind: "created" }>, Extract<Input, { kind: "created" }>, Context, Metadata>
        >();
        return line.pipe((input) => input.payload.id);
      })
      .on("deleted", (line) => line.pipe((input) => input.payload.hard)),
);
expectTypeOf(byKind).returns.toEqualTypeOf<Promise<string | boolean> | undefined>();

branchOn<["kind"], Input, string | boolean, Context, Metadata>(
  (path) => path.kind,
  (on) => {
    const remaining = on.on("created", (line) => line.pipe((input) => input.payload.id));
    // @ts-expect-error A handled input variant cannot be registered twice.
    remaining.on("created", (line) => line.pipe((input) => input.payload.id));
    return remaining.on("deleted", (line) => line.pipe((input) => input.payload.hard));
  },
);

const byMode = branchOnContext<["mode"], Input, string | number, Context, Metadata>(
  (path) => path.mode,
  (on) =>
    on
      .on("sync", (line) => line.pipe((_input, context) => context.token))
      .on("async", (line) => line.pipe((_input, context) => context.jobId)),
);
expectTypeOf(byMode).returns.toEqualTypeOf<Promise<string | number> | undefined>();

branchOnContext<["mode"], Input, string | number, Context, Metadata>(
  (path) => path.mode,
  (on) => {
    const remaining = on.on("sync", (line) => line.pipe((_input, context) => context.token));
    // @ts-expect-error A handled context variant cannot be registered twice.
    remaining.on("sync", (line) => line.pipe((_input, context) => context.token));
    return remaining.on("async", (line) => line.pipe((_input, context) => context.jobId));
  },
);

branchOn<["kind"], Input, string, Context, Metadata>(
  (path) => path.kind,
  (on) => {
    // @ts-expect-error The branch key must be a value at the selected path.
    return on.on("updated", (line) => line.pipe((input) => input.payload.id));
  },
);
