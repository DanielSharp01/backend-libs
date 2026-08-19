import { expectTypeOf } from "vitest";

import { groupManyToMap, groupToMap } from "../src/group";

type Entry = {
  category: "first" | "second";
  value: number;
};

declare const entries: Entry[];

expectTypeOf(groupToMap(entries, (entry) => entry.category)).toEqualTypeOf<Map<Entry["category"], Entry>>();
expectTypeOf(
  groupToMap(
    entries,
    (entry) => entry.category,
    (entry) => entry.value,
  ),
).toEqualTypeOf<Map<Entry["category"], number>>();

expectTypeOf(groupManyToMap(entries, (entry) => entry.category)).toEqualTypeOf<Map<Entry["category"], Entry[]>>();
expectTypeOf(
  groupManyToMap(
    entries,
    (entry) => entry.category,
    (group) => group.length,
  ),
).toEqualTypeOf<Map<Entry["category"], number>>();
