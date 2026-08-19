import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { flattenColumns } from "../src/flatten";

describe("flattenColumns", () => {
  it("flattens nested SQL expressions into dotted paths", () => {
    const id = sql<number>`users.id`;
    const name = sql<string>`profiles.name`;
    const active = sql<boolean>`profiles.settings.active`;

    expect(
      flattenColumns({
        id,
        profile: {
          name,
          settings: { active },
        },
      }),
    ).toEqual({
      id,
      "profile.name": name,
      "profile.settings.active": active,
    });
  });

  it("returns an empty object for an empty tree", () => {
    expect(flattenColumns({})).toEqual({});
  });
});
