import { describe, expect, it, vi } from "vitest";

import { extendInput, moveInput, omitInput, pickInput, tapInput } from "../src/input-middlewares";

describe("input middlewares", () => {
  it("merges computed extension objects without mutating the input", async () => {
    const input = { path: "/users", count: 2 };
    const extend = extendInput(async (value: typeof input) => ({ label: `${value.path}:${value.count}` }));

    await expect(extend(input)).resolves.toEqual({ path: "/users", count: 2, label: "/users:2" });
    expect(input).toEqual({ path: "/users", count: 2 });
  });

  it("assigns one computed property", async () => {
    const input = { path: "/users" };
    const extend = extendInput("pathLength", async (value: typeof input) => value.path.length);

    await expect(extend(input)).resolves.toEqual({ path: "/users", pathLength: 6 });
  });

  it("taps the input and preserves its identity", async () => {
    const input = { path: "/users" };
    const tap = vi.fn(async (_value: typeof input) => undefined);

    await expect(tapInput(tap)(input)).resolves.toBe(input);
    expect(tap).toHaveBeenCalledWith(input);
  });

  it("moves a property without mutating the input", () => {
    const input = { request: { path: "/users" }, status: "ready", context: "old" };

    expect(moveInput("request", "context")(input)).toEqual({
      status: "ready",
      context: { path: "/users" },
    });
    expect(input).toEqual({ request: { path: "/users" }, status: "ready", context: "old" });
  });

  it("picks and omits input fields through the common mask operations", () => {
    const input = { path: "/users", status: "ready", internal: true };

    expect(pickInput({ path: true, status: true })(input)).toEqual({ path: "/users", status: "ready" });
    expect(omitInput({ internal: true })(input)).toEqual({ path: "/users", status: "ready" });
    expect(input).toEqual({ path: "/users", status: "ready", internal: true });
  });
});
