import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { expectTypeOf } from "vitest";
import z from "zod";

import {
  builtinOperationForSchema,
  builtinOperations,
  filterResolver,
  filterSchema,
  flattenColumns,
  getLikeStrategy,
  multiFilterSchema,
  sortResolver,
  sortSchema,
  sqlFilterForDialect,
  sqlSort,
  type BuiltinFilter,
  type BuiltinOperation,
  type BuiltinOperationForType,
  type ColumnObject,
  type Filter,
  type FilterFor,
  type FilterInput,
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
expectTypeOf(builtinOperationForSchema).toBeFunction();
expectTypeOf(flattenColumns).toBeFunction();
expectTypeOf(sqlSort).toBeFunction();
expectTypeOf(sortResolver).toBeFunction();
expectTypeOf(sortSchema).toBeFunction();

expectTypeOf<(typeof builtinOperations)[number]>().toEqualTypeOf<BuiltinOperation>();
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
  | FilterFor<string, "eq">
  | FilterInput<Record<"name", Filter>>
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
expectTypeOf(sorting.sort({ key: "name", direction: "asc" })).toEqualTypeOf<SQL>();

// Operations follow the value type: free text gets patterns, enums only compare, nullable adds is/isnot.
expectTypeOf<BuiltinOperationForType<"food" | "drink">>().toEqualTypeOf<"eq" | "neq" | "in" | "nin">();
expectTypeOf<Extract<BuiltinOperationForType<string | null>, "is" | "pre">>().toEqualTypeOf<"is" | "pre">();

// Parsed filters carry the value shape of their operation and fit the SQL builder.
const amount = filterSchema(z.number(), ["eq", "bet", "in"]).parse("bet:1,5");
expectTypeOf(amount).toEqualTypeOf<
  { operation: "eq"; value: number } | { operation: "bet"; value: readonly [number, number] } | { operation: "in"; value: number[] }
>();
expectTypeOf(amount).toMatchTypeOf<BuiltinFilter<number>>();
expectTypeOf(filterSchema(z.string().nullable(), ["is"]).parse("is:null")).toEqualTypeOf<{ operation: "is"; value: null }>();

// @ts-expect-error Ranges belong to ordered types, not enums.
filterSchema(z.enum(["food", "drink"]), ["bet"]);

// A partial query object goes straight to the resolver.
const resolver = filterResolver(filter.filtersForColumns({ age: sql<number>`age`, name: sql<string>`name` }));
resolver.filters({ age: amount });

// @ts-expect-error Unsupported dialects do not belong to the public union.
getLikeStrategy("oracle");

// @ts-expect-error A string filter cannot compare against a number.
filter.sqlFilter(sql<string>`name`, { operation: "eq", value: 1 });

// @ts-expect-error Resolver keys come from the resolver map.
sorting.sort({ key: "missing", direction: "asc" });
