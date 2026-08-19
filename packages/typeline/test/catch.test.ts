import { describe, expect, it, vi } from "vitest";

import { catchErr } from "../src/catch";
import { isPipelineStop, stop, typeline } from "../src/pipeline";

type Context = { requestId: string };
type Metadata = { name: string };

describe("catchErr", () => {
  it("returns the protected pipeline output when it succeeds", async () => {
    const recover = vi.fn((line) => line.pipe(() => "recovered"));
    const middleware = catchErr<number, string, string, Context, Metadata>(
      (line) => line.pipe((input, context) => `${context.requestId}:${input}`),
      recover,
    );

    await expect(middleware.mw(2, { requestId: "request-1" })).resolves.toBe("request-1:2");
    expect(recover).toHaveBeenCalledOnce();
  });

  it("passes a protected pipeline failure and the same context to the recovery pipeline", async () => {
    const failure = new Error("broken middleware");
    const context = { requestId: "request-1" };
    const middleware = catchErr<number, string, { error: unknown; requestId: string }, Context, Metadata>(
      (line) =>
        line.pipe(() => {
          throw failure;
        }),
      (line) => line.pipe((error, currentContext) => ({ error, requestId: currentContext.requestId })),
    );

    await expect(middleware.mw(2, context)).resolves.toEqual({ error: failure, requestId: "request-1" });
  });

  it("catches asynchronous rejections", async () => {
    const failure = new Error("async failure");
    const middleware = catchErr<number, string, string, Context, Metadata>(
      (line) =>
        line.pipe(async () => {
          await Promise.resolve();
          throw failure;
        }),
      (line) => line.pipe((error) => (error === failure ? "recovered" : "wrong error")),
    );

    await expect(middleware.mw(2, { requestId: "request-1" })).resolves.toBe("recovered");
  });

  it("propagates failures from the recovery pipeline", async () => {
    const recoveryFailure = new Error("recovery failed");
    const middleware = catchErr<number, string, string, Context, Metadata>(
      (line) =>
        line.pipe(() => {
          throw new Error("initial failure");
        }),
      (line) =>
        line.pipe(() => {
          throw recoveryFailure;
        }),
    );

    await expect(middleware.mw(2, { requestId: "request-1" })).rejects.toBe(recoveryFailure);
  });

  it("propagates a protected pipeline stop without running recovery", async () => {
    const recover = vi.fn(() => "recovered");
    const middleware = catchErr<number, never, string, Context, Metadata>(
      (line) => line.pipe(() => stop()),
      (line) => line.pipe(recover),
    );

    await expect(middleware.mw(2, { requestId: "request-1" })).rejects.toSatisfy(isPipelineStop);
    expect(recover).not.toHaveBeenCalled();
  });

  it("propagates a stop from the recovery pipeline", async () => {
    const middleware = catchErr<number, never, never, Context, Metadata>(
      (line) =>
        line.pipe(() => {
          throw new Error("initial failure");
        }),
      (line) => line.pipe(() => stop()),
    );

    await expect(middleware.mw(2, { requestId: "request-1" })).rejects.toSatisfy(isPipelineStop);
  });

  it("combines protected and recovery metadata in execution order", () => {
    const middleware = catchErr<number, number, number, Context, Metadata>(
      (line) => line.pipe({ mw: (input) => input + 1, metadata: { name: "protected" } }),
      (line) => line.pipe({ mw: () => 0, metadata: [{ name: "caught" }, { name: "reported" }] }),
    );

    expect(middleware.metadata).toEqual([{ name: "protected" }, { name: "caught" }, { name: "reported" }]);
  });

  it("can be composed as ordinary middleware", async () => {
    const line = typeline<number, number, Context, Metadata>()
      .pipe(
        catchErr(
          (protectedLine) => protectedLine.pipe((input: number) => String(input)),
          (recoveryLine) => recoveryLine.pipe(() => "fallback"),
        ),
      )
      .pipe((output) => output.toUpperCase());

    await expect(line.push(2, { requestId: "request-1" })).resolves.toBe("2");
  });
});
