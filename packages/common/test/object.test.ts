import { describe, expect, it } from "vitest";

import { isKeyOf, mask, maskOut, omit, omitFalsy, omitNullish, omitUndefined, pick } from "../src/object";

describe("isKeyOf", () => {
  it("only accepts own properties", () => {
    const inherited = { inherited: true };
    const object = Object.assign(Object.create(inherited) as object, { own: true });

    expect(isKeyOf("own", object)).toBe(true);
    expect(isKeyOf("inherited", object)).toBe(false);
    expect(isKeyOf("missing", object)).toBe(false);
  });

  it("supports symbol keys", () => {
    const key = Symbol("key");

    expect(isKeyOf(key, { [key]: true })).toBe(true);
  });
});

describe("shallow object filters", () => {
  const value = { id: 1, name: "Ada", active: true };

  it("picks selected properties", () => {
    expect(pick(value, { id: true, active: true })).toEqual({ id: 1, active: true });
  });

  it("omits selected properties", () => {
    expect(omit(value, { name: true })).toEqual({ id: 1, active: true });
  });

  it("omits undefined values", () => {
    expect(omitUndefined({ zero: 0, nil: null, missing: undefined })).toEqual({ zero: 0, nil: null });
  });

  it("omits nullish values", () => {
    expect(omitNullish({ zero: 0, empty: "", nil: null, missing: undefined })).toEqual({ zero: 0, empty: "" });
  });

  it("omits falsy values", () => {
    expect(
      omitFalsy({ one: 1, text: "value", zero: 0, empty: "", disabled: false, nil: null, missing: undefined }),
    ).toEqual({ one: 1, text: "value" });
  });
});

describe("deep masks", () => {
  const value = {
    id: 1,
    profile: {
      name: "Ada",
      secret: "hidden",
    },
    teams: [
      { name: "compiler", private: true },
      { name: "runtime", private: false },
    ],
  };

  it("selects nested properties and applies one mask to every array item", () => {
    expect(
      mask(value, {
        id: true,
        profile: { name: true },
        teams: { name: true },
      }),
    ).toEqual({
      id: 1,
      profile: { name: "Ada" },
      teams: [{ name: "compiler" }, { name: "runtime" }],
    });
  });

  it("removes nested properties and applies one mask to every array item", () => {
    expect(
      maskOut(value, {
        id: true,
        profile: { secret: true },
        teams: { private: true },
      }),
    ).toEqual({
      profile: { name: "Ada" },
      teams: [{ name: "compiler" }, { name: "runtime" }],
    });
  });

  it("returns fully-selected primitive values unchanged", () => {
    expect(mask("value", true)).toBe("value");
  });
});
