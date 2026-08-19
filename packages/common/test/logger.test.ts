import { describe, expect, it, vi } from "vitest";

import { consoleLogger, logger } from "../src/logger";

describe("logger", () => {
  it("creates a method for every severity", () => {
    const sink = vi.fn();
    const log = logger(["debug", "error"], sink);
    const details = { requestId: "request-1" };

    log.debug("starting");
    log.error("failed", details);
    log.log("debug", "explicit");

    expect(sink).toHaveBeenNthCalledWith(1, "debug", [], "starting", undefined);
    expect(sink).toHaveBeenNthCalledWith(2, "error", [], "failed", details);
    expect(sink).toHaveBeenNthCalledWith(3, "debug", [], "explicit", undefined);
  });

  it("creates immutable, cumulative scopes", () => {
    const sink = vi.fn();
    const root = logger(["info"], sink);
    const http = root.withScope("http");
    const request = http.withScope("request", "42");

    root.info("root");
    http.info("server");
    request.info("received");

    expect(sink).toHaveBeenNthCalledWith(1, "info", [], "root", undefined);
    expect(sink).toHaveBeenNthCalledWith(2, "info", ["http"], "server", undefined);
    expect(sink).toHaveBeenNthCalledWith(3, "info", ["http", "request", "42"], "received", undefined);
  });
});

describe("consoleLogger", () => {
  it("writes the configured tag, scope, message, and optional details", () => {
    const info = vi.fn();
    const error = vi.fn();
    const log = consoleLogger({
      info: { command: info, tag: "[info]" },
      error: { command: error, tag: "[error]" },
    });

    log.info("ready");
    log.withScope("http").error("failed", { status: 500 });

    expect(info).toHaveBeenCalledWith("[info]", "ready");
    expect(error).toHaveBeenCalledWith("[error]", "http", "failed", { status: 500 });
  });
});
