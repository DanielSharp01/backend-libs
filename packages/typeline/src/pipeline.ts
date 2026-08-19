import type { Awaitable } from "@danielsharp/common";

interface TypelineState {
  readonly onError: ((error: unknown, input: unknown, context: unknown) => Awaitable<any>) | undefined;
  readonly mws: ((input: unknown, context: unknown) => Awaitable<unknown>)[];
  readonly metadata: unknown[];
}

const STOP_SYMBOL = Symbol.for("@danielsharp/typeline/stop");
export type PipelineStop = typeof STOP_SYMBOL;

export function isPipelineStop(value: unknown): value is PipelineStop {
  return value === STOP_SYMBOL;
}

export function stop(): never {
  throw STOP_SYMBOL;
}

export interface Pushable<TInput = unknown, TOutput = unknown, TContext = unknown> {
  push: (input: TInput, context: TContext) => Promise<TOutput>;
}

type TransformingMiddleware<TInput, TOutput, TContext, TMeta> =
  | ((input: TInput, context: TContext) => Awaitable<TOutput>)
  | {
      mw: (input: TInput, context: TContext) => Awaitable<TOutput>;
      metadata?: TMeta | TMeta[] | undefined;
    };

type MetadataMiddleware<TInput, TOutput, TMeta> = [TInput] extends [TOutput]
  ? [TOutput] extends [TInput]
    ? {
        metadata: TMeta | TMeta[];
        mw?: never;
        push?: never;
      }
    : never
  : never;

export type Middleware<TInput, TOutput = TInput, TContext = unknown, TMeta = unknown> =
  | TransformingMiddleware<TInput, TOutput, TContext, TMeta>
  | MetadataMiddleware<TInput, TOutput, TMeta>;

export interface Typeline<TInput, TOutput, TContext, TMeta> extends Pushable<TInput, TOutput, TContext> {
  readonly metadata: TMeta[];
  pipe<TNext = TOutput>(
    next: Middleware<TOutput, TNext, TContext, TMeta> | Typeline<TOutput, TNext, TContext, TMeta>,
  ): Typeline<TInput, TNext, TContext, TMeta>;
}

export type TypelineBuilder<TInput, TOutput, TContext, TMeta> = (
  pipeline: Typeline<TInput, TInput, TContext, TMeta>,
) => Typeline<TInput, TOutput, TContext, TMeta>;

interface InternalTypeline extends Pushable, Omit<TypelineState, "onError"> {
  pipe(next: Middleware<unknown, unknown, unknown, unknown>): InternalTypeline;
  pipe(next: InternalTypeline): InternalTypeline;
}

export interface TypelineOpts<TContext> {
  onError?: ((error: unknown, input: unknown, context: TContext) => Awaitable<any>) | undefined;
}

export function typeline<TInput = void, TOutput = TInput, TContext = unknown, TMeta = unknown>(
  opts?: TypelineOpts<TContext>,
): Typeline<TInput, TOutput, TContext, TMeta> {
  return internalTypeline({
    onError: opts?.onError as ((error: unknown, input: unknown, context: unknown) => Awaitable<any>) | undefined,
    mws: [],
    metadata: [],
  }) as Typeline<TInput, TOutput, TContext, TMeta>;
}

function internalTypeline(state: TypelineState): InternalTypeline {
  return {
    push: async (input: unknown, context: unknown) => {
      try {
        for (const mw of state.mws) {
          input = await mw(input, context);
        }
      } catch (error) {
        if (isPipelineStop(error)) {
          throw error;
        }
        if (state.onError) {
          return await state.onError(error, input, context);
        }
        throw error;
      }
      return input;
    },
    get mws() {
      return state.mws;
    },
    get metadata() {
      return state.metadata;
    },
    pipe(next) {
      const nextMws =
        "mws" in next
          ? [...state.mws, ...next.mws]
          : "mw" in next
            ? [...state.mws, next.mw]
            : typeof next === "function"
              ? [...state.mws, next]
              : state.mws;
      const nextMetadata =
        "metadata" in next
          ? [...state.metadata, ...(Array.isArray(next.metadata) ? next.metadata : [next.metadata])]
          : state.metadata;
      return internalTypeline({ ...state, mws: nextMws, metadata: nextMetadata });
    },
  };
}
