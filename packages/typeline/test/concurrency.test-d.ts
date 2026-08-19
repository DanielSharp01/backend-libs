import { expectTypeOf } from "vitest";

import { concurrently, ConcurrencyTimeout, Semaphore, type Typeline } from "../src/index";
import type { Semaphore as SemaphoreContract } from "../src/concurrency";

type Context = { requestId: string };
type Metadata = { name: string };

const semaphore = Semaphore(2, 100);
expectTypeOf(semaphore).toEqualTypeOf<SemaphoreContract>();
expectTypeOf(semaphore.acquire).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(semaphore.release).returns.toEqualTypeOf<void>();

const limited = concurrently<number, string, Context, Metadata>(semaphore, (line) =>
  line.pipe({
    mw: (value, context) => `${context.requestId}:${value}`,
    metadata: { name: "limited" },
  }),
);
expectTypeOf(limited.mw).parameters.toEqualTypeOf<[input: number, context: Context]>();
expectTypeOf(limited.mw).returns.toEqualTypeOf<Promise<string>>();
expectTypeOf(limited.metadata).toEqualTypeOf<Metadata[]>();

declare const root: Typeline<number, number, Context, Metadata>;
expectTypeOf(root.pipe(limited)).toEqualTypeOf<Typeline<number, string, Context, Metadata>>();

const timeout = new ConcurrencyTimeout(100);
expectTypeOf(timeout.code).toEqualTypeOf<"CONCURRENCY_TIMEOUT">();
expectTypeOf(ConcurrencyTimeout.is).returns.toEqualTypeOf<boolean>();

// @ts-expect-error The builder must return a typeline with the declared output.
concurrently<number, string, Context, Metadata>(semaphore, (line) => line.pipe((value) => value + 1));
