import { asc, desc, type SQL, type SQLWrapper } from "drizzle-orm";
import z from "zod";

export type Sort<TSortKeys extends string> = {
  key: TSortKeys;
  direction: "asc" | "desc";
};

export type SortResolverMap<TSortKeys extends string> = Record<TSortKeys, SQL>;

export interface SortResolver<TSortKeys extends string> {
  sort(sort: Sort<TSortKeys>): SQLWrapper;
  sorts(sorts: Sort<TSortKeys>[]): SQLWrapper[];
}

export function sqlSort<T>(column: SQL<T>, direction: "asc" | "desc"): SQLWrapper {
  return direction === "asc" ? asc(column) : desc(column);
}

export function sortResolver<TSortKeys extends string>(map: SortResolverMap<TSortKeys>): SortResolver<TSortKeys> {
  return {
    sort(sort: Sort<TSortKeys>): SQLWrapper {
      const { key, direction } = sort;
      if (!map[key]) {
        throw new TypeError(`Unsupported sort key: ${key}`);
      }
      return sqlSort(map[key], direction);
    },
    sorts(sorts: Sort<TSortKeys>[]): SQLWrapper[] {
      return sorts.map(({ key, direction }) => {
        if (!map[key]) {
          throw new TypeError(`Unsupported sort key: ${key}`);
        }
        return sqlSort(map[key], direction);
      });
    },
  };
}

export function sortSchema<TSortKeys extends string>(sortKeys: TSortKeys[]) {
  const key = z.enum(sortKeys);
  const direction = z.enum(["asc", "desc"]);

  return z
    .string()
    .transform((value) => value.split(",").map((sort) => sort.split(":")) as any)
    .pipe(z.array(z.tuple([key, direction])))
    .transform((sorts) =>
      sorts.map(([key, direction]) => ({
        key,
        direction,
      })),
    );
}
