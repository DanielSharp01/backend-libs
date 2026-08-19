import { ZodObject } from "zod";

type FromEntries<TEntry extends readonly [PropertyKey, unknown]> = {
  readonly [E in TEntry as E[0]]: E[1];
};

type ZodEntry<T extends ZodObject, TPrefix extends string = ""> = {
  [K in keyof T["shape"] & string]: T["shape"][K] extends ZodObject
    ? ZodEntry<T["shape"][K], `${TPrefix}${K}.`>
    : readonly [`${TPrefix}${K}`, T["shape"][K]];
}[keyof T["shape"] & string];

export type FlatZodObject<T extends ZodObject> = FromEntries<ZodEntry<T>>;

export function zodFlatten<const TObj extends ZodObject>(obj: TObj): FlatZodObject<TObj> {
  const flattened: Record<string, unknown> = {};

  function visit(current: ZodObject, prefix: string): void {
    for (const [key, value] of Object.entries(current.shape)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value instanceof ZodObject) {
        visit(value, path);
      } else {
        flattened[path] = value;
      }
    }
  }

  visit(obj, "");

  return flattened as FlatZodObject<TObj>;
}
