import { describe, expect, it } from "vitest";

import { DispatcherNoMatchError, TypelineError, mapDispatcher, predicateDispatcher } from "../src/index";

type Metadata = { name: string };
type Context = { route: "admin"; permissions: string[] } | { route: "public"; cache: boolean };

describe("dispatcher", () => {
  it("pushes through the first matching predicate branch", async () => {
    const dispatch = predicateDispatcher<number, Context, Metadata>()
      .use((input) => input + 1)
      .on(
        (context): context is Extract<Context, { route: "admin" }> => context.route === "admin",
        (line) => line.pipe((input, context) => `${context.route}:${input}`),
      );

    await expect(dispatch.push(1, { route: "admin", permissions: [] })).resolves.toBe("admin:2");
  });

  it("applies successive middleware stages in registration order", async () => {
    const dispatch = predicateDispatcher<number, Context, Metadata>()
      .use((input) => input + 1)
      .use((input) => input * 2)
      .on(
        (context): context is Extract<Context, { route: "admin" }> => context.route === "admin",
        (line) => line,
      );

    await expect(dispatch.push(2, { route: "admin", permissions: [] })).resolves.toBe(6);
  });

  it.each([
    [
      "predicate",
      predicateDispatcher<number, Context, Metadata>().on(
        (context): context is Extract<Context, { route: "admin" }> => context.route === "admin",
        (line) => line,
      ),
    ],
    [
      "map",
      mapDispatcher<number, Context, Metadata, ["route"]>((path) => path.route).on("admin", (line) => line),
    ],
  ])("throws DispatcherNoMatchError when the %s resolver has no match", async (_kind, dispatch) => {
    const context = { route: "public", cache: true } as const;
    const error = await dispatch.push(1, context).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(DispatcherNoMatchError);
    expect(error).toMatchObject({
      name: "DispatcherNoMatchError",
      code: "DISPATCHER_NO_MATCH",
      message: "No match found",
      context,
    });
    expect(DispatcherNoMatchError.is(error)).toBe(true);
    expect(TypelineError.is(error)).toBe(true);
  });
});
