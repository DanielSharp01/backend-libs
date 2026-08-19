import { is, SQL } from "drizzle-orm";

type FromEntries<TEntry extends readonly [PropertyKey, unknown]> = {
  readonly [E in TEntry as E[0]]: E[1];
};

export interface ColumnObject {
  readonly [key: string]: SQL<unknown> | ColumnObject;
}

type ColumnEntry<T extends ColumnObject, TPrefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends SQL<any>
    ? readonly [`${TPrefix}${K}`, T[K]]
    : T[K] extends ColumnObject
      ? ColumnEntry<T[K], `${TPrefix}${K}.`>
      : never;
}[keyof T & string];

export type FlatColumnObject<T extends ColumnObject> = FromEntries<ColumnEntry<T>>;

export function flattenColumns<const TObj extends ColumnObject>(columns: TObj): FlatColumnObject<TObj> {
  const flattened: Record<string, SQL<unknown>> = {};

  function visit(current: ColumnObject, prefix: string): void {
    for (const [key, value] of Object.entries(current)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (is(value, SQL)) {
        flattened[path] = value;
      } else {
        visit(value, path);
      }
    }
  }

  visit(columns, "");

  return flattened as FlatColumnObject<TObj>;
}
