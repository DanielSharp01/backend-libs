import { expectTypeOf } from "vitest";

import {
  isKeyOf,
  mask,
  maskOut,
  omit,
  omitFalsy,
  omitNullish,
  omitUndefined,
  pick,
  type DeepMask,
  type Merge,
} from "../src/object";

declare const key: PropertyKey;
declare const keyed: { id: number; name: string };

if (isKeyOf(key, keyed)) {
  expectTypeOf(key).toEqualTypeOf<"id" | "name">();
}

const idMask = { id: true } as const;
expectTypeOf(pick(keyed, idMask)).toEqualTypeOf<{ id: number }>();
expectTypeOf(omit(keyed, idMask)).toEqualTypeOf<{ name: string }>();

// @ts-expect-error Masks cannot contain unknown properties.
pick(keyed, { missing: true });

declare const optionalValues: {
  required: string;
  optional?: number;
  maybe: boolean | undefined;
  onlyUndefined: undefined;
};

expectTypeOf(omitUndefined(optionalValues)).toEqualTypeOf<{
  required: string;
  optional?: number;
  maybe?: boolean;
}>();

declare const nullishValues: {
  required: string;
  maybe: number | null | undefined;
  onlyNull: null;
};

expectTypeOf(omitNullish(nullishValues)).toEqualTypeOf<{
  required: string;
  maybe?: number;
}>();

declare const falsyValues: {
  truthy: "yes";
  maybe: "yes" | "" | false | null;
  onlyFalsy: 0 | false;
};

expectTypeOf(omitFalsy(falsyValues)).toEqualTypeOf<{
  truthy: "yes";
  maybe?: "yes";
}>();

declare const merged: Merge<{ id: number; value: string }, { value: boolean; added: Date }>;
expectTypeOf(merged.id).toEqualTypeOf<number>();
expectTypeOf(merged.value).toEqualTypeOf<boolean>();
expectTypeOf(merged.added).toEqualTypeOf<Date>();

type Nested = {
  id: number;
  profile: {
    name: string;
    secret: string;
  };
  teams: Array<{
    name: string;
    private: boolean;
  }>;
};

declare const nested: Nested;

const selected = mask(nested, {
  id: true,
  profile: { name: true },
  teams: { name: true },
});
expectTypeOf(selected).toEqualTypeOf<{
  id: number;
  profile: { name: string };
  teams: Array<{ name: string }>;
}>();

const removed = maskOut(nested, {
  id: true,
  profile: { secret: true },
  teams: { private: true },
});
expectTypeOf(removed).toEqualTypeOf<{
  profile: { name: string };
  teams: Array<{ name: string }>;
}>();

const validMask = {
  profile: { name: true },
  teams: { private: true },
} satisfies DeepMask<Nested>;
expectTypeOf(validMask.profile.name).toEqualTypeOf<true>();

// @ts-expect-error Deep masks cannot contain unknown properties.
mask(nested, { profile: { missing: true } });
