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
import z, {
  ZodBigInt,
  ZodBoolean,
  ZodDate,
  ZodEnum,
  ZodLiteral,
  ZodNullable,
  ZodNumber,
  ZodString,
  ZodType,
} from "zod";
import { zodStringify } from "@danielsharp/zod";

export type Filter = {
  value: any;
  operation: string;
};

export type FilterResolverMap<TFilters extends Record<string, Filter | Filter[]>> = {
  [K in keyof TFilters]: (filter: TFilters[K]) => SQLWrapper | undefined;
};

/** A parsed query is usually partial: a filter that wasn't given is skipped. */
export type FilterInput<TFilters extends Record<string, Filter | Filter[]>> = {
  [K in keyof TFilters]?: TFilters[K] | undefined;
};

export type BuiltinOperation =
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
] as const satisfies readonly BuiltinOperation[];

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
  filter<TKey extends keyof TFilters & string>(key: TKey, filter: TFilters[TKey] | undefined): SQLWrapper | undefined;
  filters(filters: FilterInput<TFilters>): SQLWrapper[];
}

export function filterResolver<TFilters extends Record<string, Filter | Filter[]>>(
  map: FilterResolverMap<TFilters>,
): FilterResolver<TFilters> {
  return {
    filter(key, filter) {
      if (!map[key]) {
        throw new TypeError(`Unsupported filter key: ${key}`);
      }
      return filter === undefined ? undefined : map[key](filter);
    },
    filters(filters) {
      return Object.entries(filters)
        .map(([key, filter]) => {
          if (!map[key]) {
            throw new TypeError(`Unsupported filter key: ${key}`);
          }
          return filter === undefined ? undefined : map[key](filter as TFilters[typeof key]);
        })
        .filter((x) => !!x);
    },
  };
}

type ZodPrimitiveBase =
  | ZodString
  | ZodNumber
  | ZodBoolean
  | ZodDate
  | ZodBigInt
  | ZodLiteral<string>
  | ZodEnum<Readonly<Record<string, string>>>;

type ZodPrimitive = ZodPrimitiveBase | ZodNullable<ZodPrimitiveBase>;

const comparisonOperations = ["eq", "neq", "gt", "gte", "lt", "lte", "bet", "nbet", "in", "nin"] as const;
const equalityOperations = ["eq", "neq", "in", "nin"] as const;
const stringOperations = [
  "eq",
  "neq",
  "in",
  "nin",
  "like",
  "nlike",
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
] as const;
const nullOperations = ["is", "isnot"] as const;

const rangeOperationSet = new Set<string>(["bet", "nbet"]);
const valueListOperationSet = new Set<string>(["in", "nin"]);
const patternOperationSet = new Set<string>(["like", "nlike", "pat", "npat", "pre", "npre", "suf", "nsuf"]);
const patternListOperationSet = new Set<string>(["likein", "nlikein", "patin", "npatin", "prein", "nprein", "sufin", "nsufin"]);
const nullOperationSet = new Set<string>(nullOperations);

/**
 * Free text gets the pattern operations; enums and literals only compare whole values, and
 * ordered types (numbers, dates) get ranges.
 */
export type BuiltinOperationForType<T> = null extends T
  ? BuiltinOperationForType<Exclude<T, null>> | (typeof nullOperations)[number]
  : T extends Date | number | bigint
    ? (typeof comparisonOperations)[number]
    : T extends string
      ? string extends T
        ? (typeof stringOperations)[number]
        : (typeof equalityOperations)[number]
      : (typeof equalityOperations)[number];

export function builtinOperationForSchema<Z extends ZodPrimitive>(schema: Z): BuiltinOperationForType<z.output<Z>>[] {
  const operations: readonly BuiltinOperation[] =
    schema instanceof ZodNullable
      ? [...builtinOperationForSchema(schema.unwrap()), ...nullOperations]
      : schema instanceof ZodString
        ? stringOperations
        : schema instanceof ZodNumber || schema instanceof ZodBigInt || schema instanceof ZodDate
          ? comparisonOperations
          : equalityOperations;
  return [...operations] as BuiltinOperationForType<z.output<Z>>[];
}

type ValueForOperation<T, TOperation> = TOperation extends "bet" | "nbet"
  ? readonly [Exclude<T, null>, Exclude<T, null>]
  : TOperation extends "in" | "nin"
    ? Exclude<T, null>[]
    : TOperation extends "likein" | "nlikein" | "patin" | "npatin" | "prein" | "nprein" | "sufin" | "nsufin"
      ? string[]
      : TOperation extends "like" | "nlike" | "pat" | "npat" | "pre" | "npre" | "suf" | "nsuf"
        ? string
        : TOperation extends "is" | "isnot"
          ? Extract<T, null | boolean>
          : Exclude<T, null>;

/** One parsed filter per operation, each with the value shape that operation takes; assignable to BuiltinFilter<T>. */
export type FilterFor<T, TOperation extends BuiltinOperation> = TOperation extends unknown
  ? { operation: TOperation; value: ValueForOperation<T, TOperation> }
  : never;

/**
 * Splits a list on commas. A comma inside a value is written as "\,", and a backslash as "\\".
 * An empty list is an empty string.
 */
function splitList(value: string): string[] {
  if (value === "") return [];
  const items: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const character = value[i];
    if (character === "\\" && i + 1 < value.length) {
      current += value[++i];
    } else if (character === ",") {
      items.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  items.push(current);
  return items;
}

/**
 * Parses "operation:value" query strings, e.g. "gte:5", "bet:1,5", "in:a,b" or "is:null". Without
 * a known operation prefix the whole string is an equality value. Values are parsed with the
 * given schema, so "gte:5" on z.number() yields the number 5.
 */
export function filterSchema<
  Z extends ZodPrimitive,
  const TOperation extends BuiltinOperationForType<z.output<Z>> = BuiltinOperationForType<z.output<Z>>,
>(schema: Z, operations?: readonly TOperation[]) {
  type Output = FilterFor<z.output<Z>, TOperation>;
  const inner: ZodType = schema instanceof ZodNullable ? schema.unwrap() : schema;
  const stringifiedInner = zodStringify(inner);
  const acceptsBoolean = inner instanceof ZodBoolean;

  const operationSet = new Set<string>(operations ?? builtinOperationForSchema(schema));
  const defaultOperation = operationSet.has("eq") ? "eq" : undefined;

  return z.string().transform((input, ctx): Output => {
    function parseOne(value: string): unknown {
      const result = stringifiedInner.safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue(issue as any);
        }
        return z.NEVER;
      }
      return result.data;
    }

    function parseValue(operation: string, value: string): unknown {
      if (nullOperationSet.has(operation)) {
        if (value === "null") return null;
        if (acceptsBoolean && (value === "true" || value === "false")) return value === "true";
        ctx.addIssue({
          code: "invalid_value",
          input: value,
          values: acceptsBoolean ? ["null", "true", "false"] : ["null"],
          message: `Operation ${operation} takes ${acceptsBoolean ? "null, true or false" : "null"}`,
        });
        return z.NEVER;
      }
      if (patternOperationSet.has(operation)) return value;
      if (patternListOperationSet.has(operation)) return splitList(value);
      if (valueListOperationSet.has(operation)) return splitList(value).map(parseOne);
      if (rangeOperationSet.has(operation)) {
        const bounds = splitList(value);
        if (bounds.length !== 2) {
          ctx.addIssue({ code: "custom", input: value, message: `Operation ${operation} takes two values: from,to` });
          return z.NEVER;
        }
        return bounds.map(parseOne);
      }
      return parseOne(value);
    }

    const separator = input.indexOf(":");
    if (separator !== -1) {
      const operation = input.slice(0, separator);
      if (operationSet.has(operation)) {
        return { operation, value: parseValue(operation, input.slice(separator + 1)) } as Output;
      }
    }

    if (defaultOperation) {
      return { operation: defaultOperation, value: parseValue(defaultOperation, input) } as Output;
    }

    ctx.addIssue({
      code: "invalid_value",
      input,
      values: [...operationSet],
      message: `Unsupported operation: ${input}`,
    });
    return z.NEVER;
  });
}

/** One filter, or the same query parameter repeated; repeated filters are combined with AND. */
export function multiFilterSchema<
  Z extends ZodPrimitive,
  const TOperation extends BuiltinOperationForType<z.output<Z>> = BuiltinOperationForType<z.output<Z>>,
>(schema: Z, operations?: readonly TOperation[]) {
  const filter = filterSchema(schema, operations);
  return z.union([filter, filter.array()]);
}
