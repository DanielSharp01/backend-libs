import type { Prettify } from "./types";

export function isKeyOf<M extends object>(key: PropertyKey, map: M): key is keyof M {
  return Object.hasOwn(map, key);
}

export type Mask<T extends object> = Partial<Record<keyof T, true>>;

export type ExactMask<T extends object, M> = M & {
  [K in Exclude<keyof M, keyof T>]: never;
};

export type PickMasked<T extends object, M extends Mask<T>> = {
  [key in keyof T as M[key] extends true ? key : never]: T[key];
};

export function pick<T extends object, M extends Mask<T>>(obj: T, mask: ExactMask<T, M>): PickMasked<T, M> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => mask[key as keyof M] === true)) as PickMasked<T, M>;
}

export type OmitMasked<T extends object, M extends Mask<T>> = {
  [key in keyof T as M[key] extends true ? never : key]: T[key];
};

export function omit<T extends object, M extends Mask<T>>(obj: T, mask: ExactMask<T, M>): OmitMasked<T, M> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => mask[key as keyof M] !== true)) as OmitMasked<T, M>;
}

type OmitValues<T extends object, V> = Prettify<
  {
    [K in keyof T as Extract<T[K], V> extends never ? K : never]: T[K];
  } & {
    [K in keyof T as Extract<T[K], V> extends never ? never : Exclude<T[K], V> extends never ? never : K]?: Exclude<
      T[K],
      V
    >;
  }
>;

export type OmitUndefined<T extends object> = OmitValues<T, undefined>;

export function omitUndefined<T extends object>(obj: T): OmitUndefined<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as OmitUndefined<T>;
}

export type Nullish = undefined | null;

export type OmitNullish<T extends object> = OmitValues<T, Nullish>;

export function omitNullish<T extends object>(obj: T): OmitNullish<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value != null)) as OmitNullish<T>;
}

export type Falsy = undefined | null | false | "" | 0;

export type OmitFalsy<T extends object> = OmitValues<T, Falsy>;

export function omitFalsy<T extends object>(obj: T): OmitFalsy<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => Boolean(value))) as OmitFalsy<T>;
}

export type Merge<TLeft extends object, TRight extends object> = Omit<TLeft, keyof TRight> & TRight;

export type DeepMask<T> = T extends readonly (infer U)[]
  ? DeepMask<U>
  : T extends object
    ? {
        [K in keyof T]?: true | DeepMask<T[K]>;
      }
    : true;

export type Masked<T, M> = M extends true
  ? T
  : T extends readonly (infer U)[]
    ? M extends DeepMask<U>
      ? Masked<U, M>[]
      : never
    : T extends object
      ? M extends object
        ? {
            [K in keyof T as K extends keyof M ? (M[K] extends true | object ? K : never) : never]: K extends keyof M
              ? Masked<T[K], M[K]>
              : never;
          }
        : never
      : T;

export type MaskedOut<T, M> = M extends true
  ? never
  : T extends readonly (infer U)[]
    ? M extends DeepMask<U>
      ? MaskedOut<U, M>[]
      : T
    : T extends object
      ? M extends object
        ? {
            [K in keyof T as K extends keyof M ? (M[K] extends true ? never : K) : K]: K extends keyof M
              ? MaskedOut<T[K], M[K]>
              : T[K];
          }
        : T
      : T;

export function mask<T, M extends DeepMask<T>>(value: T, mask: M): Masked<T, M> {
  return applyMask(value, mask, false) as Masked<T, M>;
}

export function maskOut<T, M extends DeepMask<T>>(value: T, mask: M): MaskedOut<T, M> {
  return applyMask(value, mask, true) as MaskedOut<T, M>;
}

function applyMask(value: unknown, mask: unknown, invert: boolean): unknown {
  if (mask === true) {
    return invert ? undefined : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyMask(item, mask, invert));
  }

  if (value !== null && typeof value === "object" && mask !== null && typeof mask === "object") {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Object.keys(value)) {
      const source = value as Record<PropertyKey, unknown>;
      const maskObject = mask as Record<PropertyKey, unknown>;

      const selected = Object.hasOwn(maskObject, key);
      const childMask = maskObject[key];

      if (!invert) {
        if (!selected) {
          continue;
        }

        if (childMask === true) {
          result[key] = source[key];
          continue;
        }
      } else {
        if (!selected) {
          result[key] = source[key];
          continue;
        }

        if (childMask === true) {
          continue;
        }
      }

      result[key] = applyMask(source[key], childMask, invert);
    }

    return result;
  }

  return value;
}
