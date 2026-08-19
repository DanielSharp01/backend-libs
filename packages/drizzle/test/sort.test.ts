import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { sortResolver, sortSchema, sqlSort } from "../src/sort";
import { toQuery } from "./helpers";

describe("sqlSort", () => {
  it("builds ascending and descending expressions", () => {
    const column = sql<string>`users.name`;

    expect(toQuery(sqlSort(column, "asc"))).toEqual({ sql: "users.name asc", params: [] });
    expect(toQuery(sqlSort(column, "desc"))).toEqual({ sql: "users.name desc", params: [] });
  });
});

describe("sortResolver", () => {
  const resolver = sortResolver({
    name: sql<string>`users.name`,
    createdAt: sql<Date>`users.created_at`,
  });

  it("resolves one or many sorts", () => {
    expect(toQuery(resolver.sort({ key: "name", direction: "asc" }))).toEqual({
      sql: "users.name asc",
      params: [],
    });
    expect(resolver.sorts([{ key: "createdAt", direction: "desc" }]).map(toQuery)).toEqual([
      { sql: "users.created_at desc", params: [] },
    ]);
  });

  it("rejects unknown keys", () => {
    expect(() => resolver.sort({ key: "missing" as never, direction: "asc" })).toThrow("Unsupported sort key: missing");
  });
});

describe("sortSchema", () => {
  const schema = sortSchema(["name", "createdAt"]);

  it("parses comma-separated sorts", () => {
    expect(schema.parse("name:asc,createdAt:desc")).toEqual([
      { key: "name", direction: "asc" },
      { key: "createdAt", direction: "desc" },
    ]);
  });

  it.each(["missing:asc", "name:sideways", "name", "name:asc:extra"])("rejects %s", (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
