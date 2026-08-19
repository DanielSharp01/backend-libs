import { describe, expect, it, vi } from "vitest";

import { branch, branchOn, branchOnContext } from "../src/branch";
import { isPipelineStop, stop, typeline } from "../src/pipeline";

type Metadata = { name: string };

describe("branch", () => {
  it("runs the first matching input branch", async () => {
    type Input = { kind: "text"; value: string } | { kind: "count"; value: number };
    type Context = { mode: "normal" };
    const second = vi.fn((input: string | undefined) => `second:${input}`);
    const select = branch<Input, string, Context, Metadata>((when) =>
      when
        .when(
          (input): input is Extract<Input, { kind: "text" }> => input.kind === "text",
          (line) => line.pipe((input) => input.value.toUpperCase()),
        )
        .when(
          (input): input is Extract<Input, { kind: "count" }> => input.kind === "count",
          (line) => line.pipe((input) => String(input.value)),
        ),
    );
    const line = typeline<Input, Input, Context, Metadata>().pipe(select).pipe(second);

    await expect(line.push({ kind: "text", value: "hello" }, { mode: "normal" })).resolves.toBe("second:HELLO");
    expect(second).toHaveBeenCalledOnce();
  });

  it("can select a branch from the context", async () => {
    type Context = { mode: "json" } | { mode: "text" };
    const select = branch<number, string, Context, Metadata>((when) =>
      when
        .whenContext(
          (context): context is Extract<Context, { mode: "json" }> => context.mode === "json",
          (line) => line.pipe((input) => JSON.stringify(input)),
        )
        .whenContext(
          (context): context is Extract<Context, { mode: "text" }> => context.mode === "text",
          (line) => line.pipe((input) => String(input)),
        ),
    );

    await expect(select(12, { mode: "json" })).resolves.toBe("12");
    await expect(select(12, { mode: "text" })).resolves.toBe("12");
  });

  it("returns undefined when no predicate matches", async () => {
    const select = branch<number, string, {}, Metadata>((when) =>
      when.when(
        (input): input is number => input > 0,
        (line) => line.pipe(String),
      ),
    );

    expect(await select(-1, {})).toBeUndefined();
  });

  it("propagates a stop from a selected predicate branch", async () => {
    const downstream = vi.fn();
    const select = branch<number, never, {}, Metadata>((when) =>
      when.when(
        (input): input is number => input > 0,
        (line) => line.pipe(() => stop()),
      ),
    );
    const line = typeline<number, number, {}, Metadata>().pipe(select).pipe(downstream);

    await expect(line.push(1, {})).rejects.toSatisfy(isPipelineStop);
    expect(downstream).not.toHaveBeenCalled();
  });
});

describe("branchOn", () => {
  it("selects by a nested input property", async () => {
    type Input = { route: { kind: "user" }; userId: string } | { route: { kind: "health" }; verbose: boolean };
    const select = branchOn<["route", "kind"], Input, string, {}, Metadata>(
      (path) => path.route.kind,
      (on) =>
        on
          .on("user", (line) => line.pipe((input) => `user:${input.userId}`))
          .on("health", (line) => line.pipe((input) => `health:${input.verbose}`)),
    );

    await expect(select({ route: { kind: "user" }, userId: "42" }, {})).resolves.toBe("user:42");
    await expect(select({ route: { kind: "health" }, verbose: true }, {})).resolves.toBe("health:true");
  });

  it("propagates a stop from a selected input branch", async () => {
    type Input = { route: { kind: "stop" } };
    const downstream = vi.fn();
    const select = branchOn<["route", "kind"], Input, never, {}, Metadata>(
      (path) => path.route.kind,
      (on) => on.on("stop", (line) => line.pipe(() => stop())),
    );
    const line = typeline<Input, Input, {}, Metadata>().pipe(select).pipe(downstream);

    await expect(line.push({ route: { kind: "stop" } }, {})).rejects.toSatisfy(isPipelineStop);
    expect(downstream).not.toHaveBeenCalled();
  });
});

describe("branchOnContext", () => {
  it("selects by a nested context property", async () => {
    type Context =
      | { request: { format: "json" }; indentation: number }
      | { request: { format: "text" }; prefix: string };
    const select = branchOnContext<["request", "format"], number, string, Context, Metadata>(
      (path) => path.request.format,
      (on) =>
        on
          .on("json", (line) => line.pipe((input, context) => JSON.stringify(input, null, context.indentation)))
          .on("text", (line) => line.pipe((input, context) => `${context.prefix}${input}`)),
    );

    await expect(select(12, { request: { format: "json" }, indentation: 2 })).resolves.toBe("12");
    await expect(select(12, { request: { format: "text" }, prefix: "value:" })).resolves.toBe("value:12");
  });

  it("propagates a stop from a selected context branch", async () => {
    type Context = { route: { kind: "stop" } };
    const downstream = vi.fn();
    const select = branchOnContext<["route", "kind"], number, never, Context, Metadata>(
      (path) => path.route.kind,
      (on) => on.on("stop", (line) => line.pipe(() => stop())),
    );
    const line = typeline<number, number, Context, Metadata>().pipe(select).pipe(downstream);

    await expect(line.push(1, { route: { kind: "stop" } })).rejects.toSatisfy(isPipelineStop);
    expect(downstream).not.toHaveBeenCalled();
  });
});
