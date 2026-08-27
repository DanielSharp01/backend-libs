import {
  omit,
  pick,
  type ExactMask,
  type Mask,
  type Merge,
  type OmitMasked,
  type PickMasked,
} from "../../common/src/object";
import type { Awaitable } from "../../common/src/types";

type ExecutableMiddleware<TInput, TOutput, TContext, TMeta> =
  | ((input: TInput, context: TContext) => Awaitable<TOutput>)
  | {
      mw: (input: TInput, context: TContext) => Awaitable<TOutput>;
      metadata?: TMeta | TMeta[] | undefined;
    };

export function extendInput<TInput extends object, TKey extends PropertyKey, TExtension, TContext, TMeta>(
  key: TKey,
  middleware: ExecutableMiddleware<TInput, TExtension, TContext, TMeta>,
): ExecutableMiddleware<TInput, Merge<TInput, Record<TKey, TExtension>>, TContext, TMeta> {
  const handler = typeof middleware === "function" ? middleware : middleware.mw;
  return {
    async mw(input: TInput, context: TContext) {
      const extension = await handler(input, context);
      return { ...input, [key]: extension } as Merge<TInput, Record<TKey, TExtension>>;
    },
    ...("metadata" in middleware ? { metadata: middleware.metadata } : {}),
  };
}

export function mergeInput<TInput extends object, TExtension extends object, TContext, TMeta>(
  middleware: ExecutableMiddleware<TInput, TExtension, TContext, TMeta>,
): ExecutableMiddleware<TInput, Merge<TInput, TExtension>, TContext, TMeta> {
  const handler = typeof middleware === "function" ? middleware : middleware.mw;
  return {
    async mw(input: TInput, context: TContext) {
      const extension = await handler(input, context);
      return { ...input, ...extension } as Merge<TInput, TExtension>;
    },
    ...("metadata" in middleware ? { metadata: middleware.metadata } : {}),
  };
}

export function tapInput<TInput, TContext, TMeta>(
  middleware: ExecutableMiddleware<TInput, unknown, TContext, TMeta>,
): ExecutableMiddleware<TInput, TInput, TContext, TMeta> {
  const handler = typeof middleware === "function" ? middleware : middleware.mw;
  return {
    async mw(input: TInput, context: TContext) {
      await handler(input, context);
      return input;
    },
    ...("metadata" in middleware ? { metadata: middleware.metadata } : {}),
  };
}

export function moveInput<TFrom extends PropertyKey, TTo extends PropertyKey>(from: TFrom, to: TTo) {
  return <TInput extends Record<TFrom, unknown>>(
    input: TInput,
  ): Merge<Omit<TInput, TFrom>, Record<TTo, TInput[TFrom]>> => {
    const output = { ...input } as Record<PropertyKey, unknown>;
    const value = output[from];
    delete output[from];
    output[to] = value;
    return output as Merge<Omit<TInput, TFrom>, Record<TTo, TInput[TFrom]>>;
  };
}

export function pickInput<const TMask extends Record<PropertyKey, true>>(mask: TMask) {
  return <TInput extends object>(input: TInput): PickMasked<TInput, TMask & Mask<TInput>> =>
    pick(input, mask as ExactMask<TInput, TMask & Mask<TInput>>);
}

export function omitInput<const TMask extends Record<PropertyKey, true>>(mask: TMask) {
  return <TInput extends object>(input: TInput): OmitMasked<TInput, TMask & Mask<TInput>> =>
    omit(input, mask as ExactMask<TInput, TMask & Mask<TInput>>);
}

export function selectInput<TInput, TMapped, TOutput, TContext, TMeta>(
  mapper: (input: TInput, context: TContext) => Awaitable<TMapped>,
  middleware: ExecutableMiddleware<TMapped, TOutput, TContext, TMeta>,
): ExecutableMiddleware<TInput, TOutput, TContext, TMeta> {
  const handler = typeof middleware === "function" ? middleware : middleware.mw;
  return {
    async mw(input: TInput, context: TContext) {
      const mapped = await mapper(input, context);
      return await handler(mapped, context);
    },
    ...("metadata" in middleware ? { metadata: middleware.metadata } : {}),
  };
}
