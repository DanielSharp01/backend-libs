import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import z from "zod";

import {
  builtinOperationForSchema,
  builtinOperations,
  filterResolver,
  filterSchema,
  multiFilterSchema,
  sqlFilterForDialect,
  type BuiltinFilter,
  type Filter,
} from "../src/filter";
import { toQuery } from "./helpers";

describe("filter schemas", () => {
  it("parses an explicit operation at the first colon", () => {
    expect(filterSchema(z.string()).parse("pre:value:with:colons")).toEqual({
      operation: "pre",
      value: "value:with:colons",
    });
  });

  it("defaults to equality when no supported operation prefix is present", () => {
    const schema = filterSchema(z.string());

    expect(schema.parse("plain")).toEqual({ operation: "eq", value: "plain" });
    expect(schema.parse("unknown:value")).toEqual({ operation: "eq", value: "unknown:value" });
  });

  it("parses values with the given schema", () => {
    expect(filterSchema(z.number()).parse("gte:5")).toEqual({ operation: "gte", value: 5 });
    expect(filterSchema(z.boolean()).parse("true")).toEqual({ operation: "eq", value: true });
    expect(filterSchema(z.date()).parse("lt:2026-10-01")).toEqual({ operation: "lt", value: new Date("2026-10-01") });
  });

  it("rejects values the schema rejects", () => {
    expect(filterSchema(z.number()).safeParse("gte:five").success).toBe(false);
    expect(filterSchema(z.enum(["food", "drink"])).safeParse("rock").success).toBe(false);
  });

  it("parses two comma-separated bounds for ranges", () => {
    expect(filterSchema(z.number()).parse("bet:1,5")).toEqual({ operation: "bet", value: [1, 5] });
    expect(filterSchema(z.number()).safeParse("bet:1").success).toBe(false);
    expect(filterSchema(z.number()).safeParse("bet:1,2,3").success).toBe(false);
  });

  it("parses comma-separated lists, with escaped commas and backslashes", () => {
    expect(filterSchema(z.number()).parse("in:1,2,3")).toEqual({ operation: "in", value: [1, 2, 3] });
    expect(filterSchema(z.string()).parse("in:a\\,b,c")).toEqual({ operation: "in", value: ["a,b", "c"] });
    expect(filterSchema(z.string()).parse("prein:a\\\\,b")).toEqual({ operation: "prein", value: ["a\\", "b"] });
    expect(filterSchema(z.string()).parse("in:")).toEqual({ operation: "in", value: [] });
    expect(filterSchema(z.number()).safeParse("in:1,two").success).toBe(false);
  });

  it("keeps pattern values as raw text", () => {
    expect(filterSchema(z.string().uuid()).parse("pre:abc")).toEqual({ operation: "pre", value: "abc" });
  });

  it("parses null and booleans for is and isnot on nullable columns", () => {
    expect(filterSchema(z.string().nullable()).parse("is:null")).toEqual({ operation: "is", value: null });
    expect(filterSchema(z.boolean().nullable()).parse("isnot:false")).toEqual({ operation: "isnot", value: false });
    expect(filterSchema(z.string().nullable()).safeParse("is:true").success).toBe(false);
    expect(filterSchema(z.string()).parse("is:null")).toEqual({ operation: "eq", value: "is:null" });
  });

  it("restricts parsing to the operations passed in", () => {
    const schema = filterSchema(z.number(), ["eq", "gte"]);

    expect(schema.parse("gte:5")).toEqual({ operation: "gte", value: 5 });
    expect(schema.safeParse("lt:5").success).toBe(false);
  });

  it("rejects an unsupported operation when equality is unavailable", () => {
    const result = filterSchema(z.string(), ["pre", "suf"]).safeParse("eq:value");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Unsupported operation: eq:value");
  });

  it("accepts one filter or an array of filters", () => {
    const schema = multiFilterSchema(z.string(), ["eq", "neq"]);

    expect(schema.parse("one")).toEqual({ operation: "eq", value: "one" });
    expect(schema.parse(["one", "neq:two"])).toEqual([
      { operation: "eq", value: "one" },
      { operation: "neq", value: "two" },
    ]);
  });

  it("derives operations from the value type", () => {
    expect(builtinOperationForSchema(z.number())).toEqual(["eq", "neq", "gt", "gte", "lt", "lte", "bet", "nbet", "in", "nin"]);
    expect(builtinOperationForSchema(z.enum(["a", "b"]))).toEqual(["eq", "neq", "in", "nin"]);
    expect(builtinOperationForSchema(z.string().nullable())).toContain("is");
    expect(builtinOperationForSchema(z.string())).toContain("prein");
  });

  it("produces filters the SQL builder accepts", () => {
    const { filtersForColumns } = sqlFilterForDialect("postgresql");
    const resolver = filterResolver(filtersForColumns({ age: sql<number>`users.age` }));
    const parsed = z.object({ age: filterSchema(z.number()).optional() }).parse({ age: "bet:20,30" });

    expect(resolver.filters(parsed).map(toQuery)).toEqual([{ sql: "users.age between $1 and $2", params: [20, 30] }]);
    expect(resolver.filters({})).toEqual([]);
  });

  it("lists every operation accepted by the built-in filter", () => {
    expect(builtinOperations).toEqual([
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
    ]);
  });
});

describe("sqlFilterForDialect", () => {
  const filters = sqlFilterForDialect("postgresql");
  const numberColumn = sql<number>`users.age`;
  const stringColumn = sql<string>`users.name`;

  it.each([
    ["eq", 20, "users.age = $1", [20]],
    ["neq", 20, "users.age <> $1", [20]],
    ["gt", 20, "users.age > $1", [20]],
    ["gte", 20, "users.age >= $1", [20]],
    ["lt", 20, "users.age < $1", [20]],
    ["lte", 20, "users.age <= $1", [20]],
    ["in", [20, 30], "users.age in ($1, $2)", [20, 30]],
    ["nin", [20, 30], "users.age not in ($1, $2)", [20, 30]],
    ["bet", [20, 30], "users.age between $1 and $2", [20, 30]],
    ["nbet", [20, 30], "users.age not between $1 and $2", [20, 30]],
  ] as const)("builds %s filters", (operation, value, expectedSql, params) => {
    const expression = filters.sqlFilter(numberColumn, { operation, value } as BuiltinFilter<number>);

    expect(expression && toQuery(expression)).toEqual({ sql: expectedSql, params: [...params] });
  });

  it.each([
    ["like", "50%_off", "50!%!_off", "users.name LIKE $1 ESCAPE '!'"],
    ["nlike", "50%_off", "50!%!_off", "users.name NOT LIKE $1 ESCAPE '!'"],
    ["pre", "50%", "50!%%", "users.name LIKE $1 ESCAPE '!'"],
    ["npre", "50%", "50!%%", "users.name NOT LIKE $1 ESCAPE '!'"],
    ["suf", "50%", "%50!%", "users.name LIKE $1 ESCAPE '!'"],
    ["nsuf", "50%", "%50!%", "users.name NOT LIKE $1 ESCAPE '!'"],
    ["pat", "50%", "50%", "users.name like $1"],
    ["npat", "50%", "50%", "users.name not like $1"],
  ] as const)("builds %s string filters", (operation, value, parameter, expectedSql) => {
    const expression = filters.sqlFilter(stringColumn, { operation, value } as BuiltinFilter<string>);

    expect(expression && toQuery(expression)).toEqual({ sql: expectedSql, params: [parameter] });
  });

  it("combines inclusion filters with OR and exclusion filters with AND", () => {
    const included = filters.sqlFilter(stringColumn, { operation: "prein", value: ["a", "b"] });
    const excluded = filters.sqlFilter(stringColumn, { operation: "npatin", value: ["a%", "b%"] });

    expect(included && toQuery(included)).toEqual({
      sql: "(users.name LIKE $1 ESCAPE '!' or users.name LIKE $2 ESCAPE '!')",
      params: ["a%", "b%"],
    });
    expect(excluded && toQuery(excluded)).toEqual({
      sql: "(users.name not like $1 and users.name not like $2)",
      params: ["a%", "b%"],
    });
  });

  it.each([
    ["is", null, "users.active IS NULL"],
    ["isnot", null, "users.active IS NOT NULL"],
    ["is", true, "users.active IS TRUE"],
    ["isnot", false, "users.active IS NOT FALSE"],
  ] as const)("builds %s filters for %s", (operation, value, expectedSql) => {
    const expression = filters.sqlFilter(sql<boolean | null>`users.active`, { operation, value });

    expect(expression && toQuery(expression)).toEqual({ sql: expectedSql, params: [] });
  });

  it("uses false and true identities for empty inclusion and exclusion lists", () => {
    const included = filters.sqlFilter(stringColumn, { operation: "likein", value: [] });
    const excluded = filters.sqlFilter(stringColumn, { operation: "nlikein", value: [] });

    expect(included && toQuery(included)).toEqual({ sql: "false", params: [] });
    expect(excluded && toQuery(excluded)).toEqual({ sql: "true", params: [] });
  });

  it("combines repeated filters with AND and ignores an absent filter", () => {
    expect(filters.sqlFilter(numberColumn, undefined)).toBeUndefined();

    const expression = filters.sqlFilters(numberColumn, [
      { operation: "gte", value: 20 },
      { operation: "lt", value: 30 },
    ]);
    expect(expression && toQuery(expression)).toEqual({
      sql: "(users.age >= $1 and users.age < $2)",
      params: [20, 30],
    });
  });

  it("creates a resolver map for flat columns", () => {
    const map = filters.filtersForColumns({ age: numberColumn, name: stringColumn });

    expect(toQuery(map.age({ operation: "eq", value: 20 })!)).toEqual({ sql: "users.age = $1", params: [20] });
    expect(toQuery(map.name({ operation: "pre", value: "Ada" })!)).toEqual({
      sql: "users.name LIKE $1 ESCAPE '!'",
      params: ["Ada%"],
    });
  });

  it("rejects unsupported operations at runtime", () => {
    expect(() => filters.sqlFilter(numberColumn, { operation: "missing", value: 1 } as never)).toThrow(
      "Unsupported operation: missing",
    );
  });
});

describe("filterResolver", () => {
  const resolver = filterResolver({
    name: (filter: Filter | Filter[]) => (Array.isArray(filter) ? undefined : sql`name = ${filter.value}`),
    ignored: () => undefined,
  });

  it("resolves one filter and omits undefined results from many filters", () => {
    expect(toQuery(resolver.filter("name", { operation: "eq", value: "Ada" })!)).toEqual({
      sql: "name = $1",
      params: ["Ada"],
    });
    expect(
      resolver
        .filters({
          name: { operation: "eq", value: "Ada" },
          ignored: { operation: "eq", value: true },
        })
        .map(toQuery),
    ).toEqual([{ sql: "name = $1", params: ["Ada"] }]);
  });

  it("rejects unknown keys", () => {
    expect(() => resolver.filter("missing" as never, { operation: "eq", value: 1 } as never)).toThrow(
      "Unsupported filter key: missing",
    );
    expect(() => resolver.filters({ missing: { operation: "eq", value: 1 } } as never)).toThrow(
      "Unsupported filter key: missing",
    );
  });
});
