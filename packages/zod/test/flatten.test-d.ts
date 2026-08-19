import { expectTypeOf } from "vitest";
import { z } from "zod";

import { zodFlatten } from "../src/flatten";

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

expectTypeOf(flattened).toEqualTypeOf<{
  readonly id: typeof id;
  readonly "profile.name": typeof name;
  readonly "profile.preferences.timezone": typeof timezone;
  readonly tags: typeof tags;
}>();
