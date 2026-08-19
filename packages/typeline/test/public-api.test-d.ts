import { expectTypeOf } from "vitest";

import {
  ConcurrencyTimeout,
  DispatcherNoMatchError,
  Semaphore,
  TypelineError,
  batcher,
  branch,
  branchOn,
  branchOnContext,
  catchErr,
  concurrently,
  dispatcher,
  extendInput,
  isPipelineStop,
  mapDispatcher,
  moveInput,
  omitInput,
  pickInput,
  predicateDispatcher,
  stop,
  tapInput,
  typeline,
  withMeta,
  type Batcher,
  type BatcherOptions,
  type Dispatcher,
  type DispatcherState,
  type Resolver,
  type MapDispatcher,
  type Middleware,
  type PipelineStop,
  type PredicateDispatcher,
  type Pushable,
  type Typeline,
  type TypelineBuilder,
  type TypelineOpts,
} from "../src/index";

expectTypeOf(batcher).toBeFunction();
expectTypeOf(branch).toBeFunction();
expectTypeOf(branchOn).toBeFunction();
expectTypeOf(branchOnContext).toBeFunction();
expectTypeOf(catchErr).toBeFunction();
expectTypeOf(concurrently).toBeFunction();
expectTypeOf(dispatcher).toBeFunction();
expectTypeOf(extendInput).toBeFunction();
expectTypeOf(isPipelineStop).toBeFunction();
expectTypeOf(mapDispatcher).toBeFunction();
expectTypeOf(moveInput).toBeFunction();
expectTypeOf(omitInput).toBeFunction();
expectTypeOf(pickInput).toBeFunction();
expectTypeOf(predicateDispatcher).toBeFunction();
expectTypeOf(Semaphore).toBeFunction();
expectTypeOf(stop).toBeFunction();
expectTypeOf(tapInput).toBeFunction();
expectTypeOf(typeline).toBeFunction();
expectTypeOf(withMeta).toBeFunction();
expectTypeOf(ConcurrencyTimeout).toBeConstructibleWith(1);
expectTypeOf(DispatcherNoMatchError).toBeConstructibleWith({ route: "missing" });
expectTypeOf(DispatcherNoMatchError.is).toBeFunction();
expectTypeOf(TypelineError.is).toBeFunction();

declare const error: unknown;
if (DispatcherNoMatchError.is(error)) {
  expectTypeOf(error).toEqualTypeOf<DispatcherNoMatchError>();
  expectTypeOf(error.code).toEqualTypeOf<"DISPATCHER_NO_MATCH">();
  expectTypeOf(error.context).toEqualTypeOf<unknown>();
}

type PublicTypes =
  | Batcher<unknown, unknown, unknown, unknown, unknown>
  | BatcherOptions<unknown, unknown, unknown, unknown, unknown>
  | Dispatcher<unknown, unknown>
  | DispatcherState<unknown, unknown>
  | Resolver<unknown, unknown>
  | MapDispatcher<unknown, unknown, unknown, unknown, []>
  | Middleware<unknown, unknown, unknown, unknown>
  | PipelineStop
  | PredicateDispatcher<unknown, unknown, unknown, unknown>
  | Pushable
  | Typeline<unknown, unknown, unknown, unknown>
  | TypelineBuilder<unknown, unknown, unknown, unknown>
  | TypelineOpts<unknown>;
expectTypeOf<PublicTypes>().not.toBeNever();
