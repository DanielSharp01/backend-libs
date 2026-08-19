import { expectTypeOf } from "vitest";

import {
  addUnique,
  capitalize,
  consoleLogger,
  err,
  groupManyToMap,
  groupToMap,
  isErr,
  isKeyOf,
  isOk,
  logger,
  mask,
  maskOut,
  ok,
  omit,
  omitFalsy,
  omitNullish,
  omitUndefined,
  pick,
  unique,
  type Awaitable,
  type DeepMask,
  type ExactMask,
  type Falsy,
  type Logger,
  type Mask,
  type Masked,
  type MaskedOut,
  type Merge,
  type Nullish,
  type OmitFalsy,
  type OmitMasked,
  type OmitNullish,
  type OmitUndefined,
  type PickMasked,
  type Prettify,
  type Result,
} from "../src/index";

expectTypeOf(addUnique).toBeFunction();
expectTypeOf(capitalize).toBeFunction();
expectTypeOf(consoleLogger).toBeFunction();
expectTypeOf(err).toBeFunction();
expectTypeOf(groupManyToMap).toBeFunction();
expectTypeOf(groupToMap).toBeFunction();
expectTypeOf(isErr).toBeFunction();
expectTypeOf(isKeyOf).toBeFunction();
expectTypeOf(isOk).toBeFunction();
expectTypeOf(logger).toBeFunction();
expectTypeOf(mask).toBeFunction();
expectTypeOf(maskOut).toBeFunction();
expectTypeOf(ok).toBeFunction();
expectTypeOf(omit).toBeFunction();
expectTypeOf(omitFalsy).toBeFunction();
expectTypeOf(omitNullish).toBeFunction();
expectTypeOf(omitUndefined).toBeFunction();
expectTypeOf(pick).toBeFunction();
expectTypeOf(unique).toBeFunction();

type Value = { name: string; optional?: number; nested: { enabled: boolean } };
type ValueMask = { name: true; nested: { enabled: true } };
type ShallowValueMask = { name: true };
type PublicTypes =
  | Awaitable<Value>
  | DeepMask<Value>
  | ExactMask<Value, ValueMask>
  | Falsy
  | Logger<"info">
  | Mask<Value>
  | Masked<Value, ValueMask>
  | MaskedOut<Value, ValueMask>
  | Merge<Value, { name: number }>
  | Nullish
  | OmitFalsy<Value>
  | OmitMasked<Value, ShallowValueMask>
  | OmitNullish<Value>
  | OmitUndefined<Value>
  | PickMasked<Value, ShallowValueMask>
  | Prettify<Value>
  | Result<Value, Error>;

expectTypeOf<PublicTypes>().not.toBeNever();
