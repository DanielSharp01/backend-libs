import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { expectTypeOf } from "vitest";

import {
  builtinOperations,
  filterResolver,
  filterSchema,
  flattenColumns,
  getLikeStrategy,
  multiFilterSchema,
  safeForBuiltin,
  sortResolver,
  sortSchema,
  sqlFilterForDialect,
  sqlSort,
  type BuiltinFilter,
  type BuiltinOperations,
  type ColumnObject,
  type Filter,
  type FilterResolver,
  type FilterResolverMap,
  type FlatColumnObject,
  type Sort,
  type SortResolver,
  type SortResolverMap,
  type SqlDialect,
} from "../src/index";

expectTypeOf(getLikeStrategy).toBeFunction();
expectTypeOf(sqlFilterForDialect).toBeFunction();
expectTypeOf(filterResolver).toBeFunction();
expectTypeOf(filterSchema).toBeFunction();
expectTypeOf(multiFilterSchema).toBeFunction();
expectTypeOf(safeForBuiltin).toBeFunction();
expectTypeOf(flattenColumns).toBeFunction();
expectTypeOf(sqlSort).toBeFunction();
expectTypeOf(sortResolver).toBeFunction();
expectTypeOf(sortSchema).toBeFunction();

expectTypeOf<(typeof builtinOperations)[number]>().toEqualTypeOf<BuiltinOperations>();
expectTypeOf<SqlDialect>().toEqualTypeOf<"postgresql" | "mysql" | "sqlite" | "singlestore">();

const columns = {
  id: sql<number>`id`,
  profile: { name: sql<string>`name` },
};
expectTypeOf(flattenColumns(columns)).toEqualTypeOf<{
  readonly id: SQL<number>;
  readonly "profile.name": SQL<string>;
}>();

type PublicTypes =
  | BuiltinFilter<string>
  | ColumnObject
  | Filter
  | FilterResolver<Record<"name", Filter>>
  | FilterResolverMap<Record<"name", Filter>>
  | FlatColumnObject<typeof columns>
  | Sort<"name">
  | SortResolver<"name">
  | SortResolverMap<"name">;

expectTypeOf<PublicTypes>().not.toBeNever();

const filter = sqlFilterForDialect("postgresql");
expectTypeOf(filter.sqlFilter(sql<string>`name`, { operation: "eq", value: "Ada" })).toEqualTypeOf<
  SQLWrapper | undefined
>();

const sorting = sortResolver({ name: sql<string>`name` });
expectTypeOf(sorting.sort({ key: "name", direction: "asc" })).toEqualTypeOf<SQLWrapper>();

// @ts-expect-error Unsupported dialects do not belong to the public union.
getLikeStrategy("oracle");

// @ts-expect-error A string filter cannot compare against a number.
filter.sqlFilter(sql<string>`name`, { operation: "eq", value: 1 });

// @ts-expect-error Resolver keys come from the resolver map.
sorting.sort({ key: "missing", direction: "asc" });
