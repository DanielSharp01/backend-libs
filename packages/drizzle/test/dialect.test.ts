import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getLikeStrategy } from "../src/dialect";
import { toQuery } from "./helpers";

describe("getLikeStrategy", () => {
  it.each(["postgresql", "mysql", "sqlite"] as const)("uses explicit escaping for %s", (dialect) => {
    const strategy = getLikeStrategy(dialect);

    expect(strategy.escape("50%!_done")).toBe("50!%!!!_done");
    expect(toQuery(strategy.like(sql.raw("name"), "50!%"))).toEqual({
      sql: "name LIKE $1 ESCAPE '!'",
      params: ["50!%"],
    });
    expect(toQuery(strategy.notLike(sql.raw("name"), "50!%"))).toEqual({
      sql: "name NOT LIKE $1 ESCAPE '!'",
      params: ["50!%"],
    });
  });

  it("uses backslash escaping for SingleStore", () => {
    const strategy = getLikeStrategy("singlestore");

    expect(strategy.escape("50%\\_done!")).toBe("50\\%\\\\\\_done!");
    expect(toQuery(strategy.like(sql.raw("name"), "50\\%"))).toEqual({
      sql: "name LIKE $1",
      params: ["50\\%"],
    });
  });

  it("rejects unsupported dialects", () => {
    expect(() => getLikeStrategy("oracle" as never)).toThrow("Unsupported dialect: oracle");
  });
});
