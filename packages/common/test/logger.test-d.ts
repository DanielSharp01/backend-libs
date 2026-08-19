import { expectTypeOf } from "vitest";

import { consoleLogger, logger, type Logger } from "../src/logger";

const log = logger(["info", "warning"], () => undefined);

expectTypeOf(log).toEqualTypeOf<Logger<"info" | "warning">>();
expectTypeOf(log.info).toEqualTypeOf<(message: string, details?: object) => void>();
expectTypeOf(log.withScope("http")).toEqualTypeOf<Logger<"info" | "warning">>();

log.log("warning", "message", { retry: true });

// @ts-expect-error Unknown severities are rejected.
log.log("error", "message");

// @ts-expect-error Details must be objects.
log.info("message", "details");

const consoleLog = consoleLogger({
  trace: { command: (..._args: unknown[]) => undefined, tag: "[trace]" },
  fatal: { command: (..._args: unknown[]) => undefined, tag: "[fatal]" },
});

expectTypeOf(consoleLog).toEqualTypeOf<Logger<"trace" | "fatal">>();
