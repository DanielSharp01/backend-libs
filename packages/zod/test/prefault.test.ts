import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodJsonify, zodStringify } from "../src/index";

describe("prefault input adapters", () => {
  it("uses the original prefault input when a stringified value is absent", () => {
    const createdAt = new Date("2026-08-19T12:00:00.000Z");
    const schema = zodStringify(
      z
        .object({
          active: z.boolean(),
          count: z.number(),
          createdAt: z.date(),
        })
        .prefault({ active: true, count: 5, createdAt }),
    );

    expect(schema.parse(undefined)).toEqual({ active: true, count: 5, createdAt });
    expect(
      schema.parse({
        active: "false",
        count: "6",
        createdAt: "2026-08-20",
      }),
    ).toEqual({
      active: false,
      count: 6,
      createdAt: new Date("2026-08-20"),
    });
    expect(schema.safeParse({ active: true, count: 6, createdAt }).success).toBe(false);
  });

  it("runs prefault values through the original transforms", () => {
    const schema = zodJsonify(z.string().trim().toUpperCase().prefault("  tuna  "));

    expect(schema.parse(undefined)).toBe("TUNA");
  });

  it("reevaluates prefault functions for each missing value", () => {
    let next = 0;
    const schema = zodStringify(z.number().prefault(() => ++next));

    expect(schema.parse(undefined)).toBe(1);
    expect(schema.parse(undefined)).toBe(2);
    expect(schema.parse("3")).toBe(3);
  });

  it("accepts JSON date strings while preserving a Date prefault", () => {
    const createdAt = new Date("2026-08-19T12:00:00.000Z");
    const schema = zodJsonify(z.date().prefault(createdAt));

    expect(schema.parse(undefined)).toEqual(createdAt);
    expect(schema.parse("2026-08-20")).toEqual(new Date("2026-08-20"));
    expect(schema.safeParse(createdAt).success).toBe(false);
  });
});
