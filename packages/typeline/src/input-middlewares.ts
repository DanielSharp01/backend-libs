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

export function extendInput<TInput extends object, TExtension extends object>(
  extension: (input: TInput) => Awaitable<TExtension>,
): (input: TInput) => Promise<Merge<TInput, TExtension>>;
export function extendInput<TInput extends object, TKey extends PropertyKey, TValue>(
  key: TKey,
  value: (input: TInput) => Awaitable<TValue>,
): (input: TInput) => Promise<Merge<TInput, Record<TKey, TValue>>>;
export function extendInput<TInput extends object>(
  extensionOrKey: PropertyKey | ((input: TInput) => Awaitable<object>),
  value?: (input: TInput) => Awaitable<unknown>,
) {
  return async (input: TInput) => {
    if (typeof extensionOrKey === "function") {
      return { ...input, ...(await extensionOrKey(input)) };
    }
    return { ...input, [extensionOrKey]: await value?.(input) };
  };
}

export function tapInput<TInput>(tap: (input: TInput) => Awaitable<unknown>) {
  return async (input: TInput): Promise<TInput> => {
    await tap(input);
    return input;
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
