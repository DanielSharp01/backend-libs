import {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  inArray,
  notInArray,
  like,
  notLike,
  between,
  notBetween,
  type SQL,
  sql,
  type SQLWrapper,
  or,
  and,
} from "drizzle-orm";
import { getLikeStrategy, type SqlDialect } from "./dialect";
import z from "zod";

export type Filter = {
  value: any;
  operation: string;
};

export type FilterResolverMap<TFilters extends Record<string, Filter | Filter[]>> = {
  [K in keyof TFilters]: (filter: TFilters[K]) => SQLWrapper | undefined;
};

export type BuiltinOperations =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "like"
  | "nlike"
  | "is"
  | "isnot"
  | "bet"
  | "nbet"
  | "pat"
  | "npat"
  | "pre"
  | "npre"
  | "suf"
  | "nsuf"
  | "likein"
  | "nlikein"
  | "patin"
  | "npatin"
  | "prein"
  | "nprein"
  | "sufin"
  | "nsufin";

export type BuiltinFilter<T> =
  | {
      value: T;
      operation: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
    }
  | {
      value: readonly [T, T];
      operation: "bet" | "nbet";
    }
  | {
      value: T[];
      operation: "in" | "nin";
    }
  | {
      value: T extends string ? Extract<T, string> : never;
      operation: "like" | "nlike" | "pat" | "npat" | "pre" | "npre" | "suf" | "nsuf";
    }
  | {
      value: T extends string ? Extract<T, string>[] : never;
      operation: "likein" | "nlikein" | "patin" | "npatin" | "prein" | "nprein" | "sufin" | "nsufin";
    }
  | {
      value: T extends null | true | false ? Extract<T, null | true | false> : never;
      operation: "is" | "isnot";
    };

export const builtinOperations = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
  "like",
  "nlike",
  "is",
  "isnot",
  "bet",
  "nbet",
  "pat",
  "npat",
  "pre",
  "npre",
  "suf",
  "nsuf",
  "likein",
  "nlikein",
  "patin",
  "npatin",
  "prein",
  "nprein",
  "sufin",
  "nsufin",
] as const satisfies readonly BuiltinOperations[];

export function sqlFilterForDialect(dialect: SqlDialect) {
  const likeStrategy = getLikeStrategy(dialect);

  function sqlFilter<T>(column: SQL<T>, filter: BuiltinFilter<T> | undefined): SQLWrapper | undefined {
    if (!filter) {
      return undefined;
    }
    const { value, operation } = filter;
    switch (operation) {
      case "eq":
        return eq(column, value);
      case "neq":
        return ne(column, value);
      case "gt":
        return gt(column, value);
      case "gte":
        return gte(column, value);
      case "lt":
        return lt(column, value);
      case "lte":
        return lte(column, value);
      case "in":
        return inArray(column, value as T[]);
      case "nin":
        return notInArray(column, value as T[]);
      case "bet":
        return between(column, value[0], value[1]);
      case "nbet":
        return notBetween(column, value[0], value[1]);
      case "like":
        return likeStrategy.like(column, likeStrategy.escape(value));
      case "nlike":
        return likeStrategy.notLike(column, likeStrategy.escape(value));
      case "pre":
        return likeStrategy.like(column, `${likeStrategy.escape(value)}%`);
      case "npre":
        return likeStrategy.notLike(column, `${likeStrategy.escape(value)}%`);
      case "suf":
        return likeStrategy.like(column, `%${likeStrategy.escape(value)}`);
      case "nsuf":
        return likeStrategy.notLike(column, `%${likeStrategy.escape(value)}`);
      case "pat":
        return like(column, value);
      case "npat":
        return notLike(column, value);
      case "is":
        return sql`${column} IS ${sql.raw(value === null ? "NULL" : value ? "TRUE" : "FALSE")}`;
      case "isnot":
        return sql`${column} IS NOT ${sql.raw(value === null ? "NULL" : value ? "TRUE" : "FALSE")}`;
      case "likein":
        return or(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "like" }))) ?? sql`false`;
      case "nlikein":
        return (
          and(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "nlike" }))) ?? sql`true`
        );
      case "prein":
        return or(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "pre" }))) ?? sql`false`;
      case "nprein":
        return and(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "npre" }))) ?? sql`true`;
      case "sufin":
        return or(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "suf" }))) ?? sql`false`;
      case "nsufin":
        return and(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "nsuf" }))) ?? sql`true`;
      case "patin":
        return or(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "pat" }))) ?? sql`false`;
      case "npatin":
        return and(...value.map((v) => sqlFilter(column as SQL<string>, { value: v, operation: "npat" }))) ?? sql`true`;
      default:
        throw new TypeError(`Unsupported operation: ${operation}`);
    }
  }

  function sqlFilters<T>(
    column: SQL<T>,
    filter: BuiltinFilter<T> | BuiltinFilter<T>[] | undefined,
  ): SQLWrapper | undefined {
    if (Array.isArray(filter)) {
      return and(...filter.map((f) => sqlFilters(column, f)).filter((f) => f !== undefined));
    }
    return sqlFilter(column, filter);
  }

  function filtersForColumns<TKeys extends string>(flatSqlColumns: {
    readonly [key in TKeys]: SQL<unknown>;
  }): FilterResolverMap<Record<TKeys, BuiltinFilter<any> | BuiltinFilter<any>[]>> {
    const map = {} as FilterResolverMap<Record<TKeys, BuiltinFilter<any> | BuiltinFilter<any>[]>>;
    for (const [key, column] of Object.entries(flatSqlColumns)) {
      map[key as keyof typeof map] = (filter: BuiltinFilter<any> | BuiltinFilter<any>[] | undefined) =>
        sqlFilters(column as SQL<any>, filter);
    }
    return map;
  }

  return {
    sqlFilter,
    sqlFilters,
    filtersForColumns,
  };
}

export interface FilterResolver<TFilters extends Record<string, Filter | Filter[]>> {
  filter<TKey extends keyof TFilters & string>(key: TKey, filter: TFilters[TKey]): SQLWrapper | undefined;
  filters(filters: TFilters): SQLWrapper[];
}

export function filterResolver<TFilters extends Record<string, Filter | Filter[]>>(
  map: FilterResolverMap<TFilters>,
): FilterResolver<TFilters> {
  return {
    filter(key, filter) {
      if (!map[key]) {
        throw new TypeError(`Unsupported filter key: ${key}`);
      }
      return map[key](filter);
    },
    filters(filters) {
      return Object.entries(filters)
        .map(([key, filter]) => {
          if (!map[key]) {
            throw new TypeError(`Unsupported filter key: ${key}`);
          }
          return map[key](filter as TFilters[typeof key]);
        })
        .filter((x) => !!x);
    },
  };
}

export function filterSchema<const TOperations extends readonly string[]>(operations: TOperations) {
  type TOperation = TOperations[number];

  const operationSet = new Set<string>(operations);
  const defaultOperation = operationSet.has("eq") ? ("eq" as TOperation) : undefined;

  return z.string().transform((input, ctx) => {
    const separator = input.indexOf(":");

    if (separator !== -1) {
      const operation = input.slice(0, separator);

      if (operationSet.has(operation)) {
        return {
          operation: operation as TOperation,
          value: input.slice(separator + 1),
        };
      }
    }

    if (defaultOperation) {
      return {
        operation: defaultOperation,
        value: input,
      };
    }

    ctx.addIssue({
      code: "invalid_value",
      input,
      values: [...operations],
      message: `Unsupported operation: ${input}`,
    });

    return z.NEVER;
  });
}

export function multiFilterSchema<TOperations extends string>(operations: TOperations[]) {
  const filter = filterSchema(operations);
  return z.union([filter, filter.array()]);
}

const builtinFilterUnion = z.discriminatedUnion("operation", [
  z.object({
    operation: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
    value: z.any(),
  }),
  z.object({
    operation: z.enum(["bet", "nbet"]),
    value: z.tuple([z.any(), z.any()]),
  }),
  z.object({
    operation: z.enum(["in", "nin"]),
    value: z.array(z.any()),
  }),
  z.object({
    operation: z.enum(["like", "nlike", "pat", "npat", "pre", "npre", "suf", "nsuf"]),
    value: z.string(),
  }),
  z.object({
    operation: z.enum(["likein", "nlikein", "patin", "npatin", "prein", "nprein", "sufin", "nsufin"]),
    value: z.array(z.string()),
  }),
  z.object({
    operation: z.enum(["is", "isnot"]),
    value: z.union([z.null(), z.boolean()]),
  }),
]);

export function safeForBuiltin(schema: z.ZodType<Filter | Filter[], any>) {
  return schema.check((ctx) => {
    if (Array.isArray(ctx.value)) {
      for (const filter of ctx.value) {
        const parsed = builtinFilterUnion.safeParse(filter);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            ctx.issues.push(issue as any);
          }
        }
      }
      return;
    }

    const parsed = builtinFilterUnion.safeParse(ctx.value);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.issues.push(issue as any);
      }
    }
  });
}
