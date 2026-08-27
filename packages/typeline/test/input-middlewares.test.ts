import { describe, expect, it, vi } from "vitest";

import {
  extendInput,
  mergeInput,
  moveInput,
  omitInput,
  pickInput,
  selectInput,
  tapInput,
} from "../src/input-middlewares";
import { typeline } from "../src/pipeline";

interface Context {
  readonly suffix: string;
}

interface Metadata {
  readonly name: string;
}

describe("input middlewares", () => {
  it("merges computed extension objects without mutating the input", async () => {
    const input = { path: "/users", count: 2 };
    const merge = mergeInput({
      metadata: { name: "label" },
      async mw(value: typeof input, context: Context) {
        return { label: `${value.path}:${value.count}:${context.suffix}` };
      },
    });
    const line = typeline<typeof input, typeof input, Context, Metadata>().pipe(merge);

    await expect(line.push(input, { suffix: "done" })).resolves.toEqual({
      path: "/users",
      count: 2,
      label: "/users:2:done",
    });
    expect(line.metadata).toEqual([{ name: "label" }]);
    expect(input).toEqual({ path: "/users", count: 2 });
  });

  it("assigns one computed property", async () => {
    const input = { path: "/users" };
    const extend = extendInput(
      "pathLength",
      async (value: typeof input, context: Context) => value.path.length + context.suffix.length,
    );
    const line = typeline<typeof input, typeof input, Context>().pipe(extend);

    await expect(line.push(input, { suffix: "!" })).resolves.toEqual({ path: "/users", pathLength: 7 });
  });

  it("taps the input and preserves its identity", async () => {
    const input = { path: "/users" };
    const context = { suffix: "done" };
    const tap = vi.fn(async (_value: typeof input, _context: Context) => undefined);
    const line = typeline<typeof input, typeof input, Context>().pipe(tapInput(tap));

    await expect(line.push(input, context)).resolves.toBe(input);
    expect(tap).toHaveBeenCalledWith(input, context);
  });

  it("runs middleware against selected input while preserving the outer input and metadata", async () => {
    const input = { requestId: "request-1", response: { value: 2 } };
    const context = { suffix: "done" };
    const selected = vi.fn(async (_value: typeof input.response, _context: Context) => undefined);
    const line = typeline<typeof input, typeof input, Context, Metadata>().pipe(
      selectInput((value: typeof input) => value.response, {
        metadata: { name: "response" },
        mw: selected,
      }),
    );

    await expect(line.push(input, context)).resolves.toBe(input);
    expect(selected).toHaveBeenCalledWith(input.response, context);
    expect(line.metadata).toEqual([{ name: "response" }]);
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
