import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodFlatten } from "../src/flatten";

describe("zodFlatten", () => {
  it("flattens nested object schemas into dot-delimited paths", () => {
    const id = z.string();
    const name = z.string();
    const timezone = z.enum(["UTC", "Europe/Budapest"]);
    const tags = z.array(z.string());

    const flattened = zodFlatten(
      z.object({
        id,
        profile: z.object({
          name,
          preferences: z.object({ timezone }),
        }),
        tags,
      }),
    );

    expect(flattened).toEqual({
      id,
      "profile.name": name,
      "profile.preferences.timezone": timezone,
      tags,
    });
  });

  it("omits empty object schemas", () => {
    const id = z.string();

    expect(
      zodFlatten(
        z.object({
          empty: z.object({}),
          id,
          nested: z.object({ empty: z.object({}) }),
        }),
      ),
    ).toEqual({ id });
  });
});
