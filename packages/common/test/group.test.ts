import { describe, expect, it } from "vitest";

import { groupManyToMap, groupToMap } from "../src/group";

describe("groupToMap", () => {
  it("indexes values by their mapped key", () => {
    const users = [
      { id: 1, name: "Ada" },
      { id: 2, name: "Grace" },
    ];

    expect(groupToMap(users, (user) => user.id)).toEqual(
      new Map([
        [1, users[0]],
        [2, users[1]],
      ]),
    );
  });

  it("maps values and keeps the last duplicate key", () => {
    const users = [
      { id: 1, name: "first" },
      { id: 1, name: "last" },
    ];

    expect(
      groupToMap(
        users,
        (user) => user.id,
        (user) => user.name,
      ),
    ).toEqual(new Map([[1, "last"]]));
  });
});

describe("groupManyToMap", () => {
  const entries = [
    { team: "red", score: 2 },
    { team: "blue", score: 3 },
    { team: "red", score: 5 },
  ];

  it("groups all values sharing a key", () => {
    expect(groupManyToMap(entries, (entry) => entry.team)).toEqual(
      new Map([
        ["red", [entries[0], entries[2]]],
        ["blue", [entries[1]]],
      ]),
    );
  });

  it("maps each completed group", () => {
    expect(
      groupManyToMap(
        entries,
        (entry) => entry.team,
        (group) => group.reduce((total, entry) => total + entry.score, 0),
      ),
    ).toEqual(
      new Map([
        ["red", 7],
        ["blue", 3],
      ]),
    );
  });
});
