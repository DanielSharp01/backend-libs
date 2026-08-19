import { bench, describe } from "vitest";

import { buildExpressApplication } from "./express-adapter";
import { buildTypelineApplication } from "./typeline-adapter";
import { ROUTE_COUNT } from "./workload";

let benchmarkSink: unknown;

describe(`startup (${ROUTE_COUNT} routes, up to four middleware scopes)`, () => {
  bench("typeline-http: register", () => {
    benchmarkSink = buildTypelineApplication("dispatch", false);
  });

  bench("typeline-http: register + compile", () => {
    benchmarkSink = buildTypelineApplication("dispatch", true);
  });

  bench("express: register", () => {
    benchmarkSink = buildExpressApplication("dispatch");
  });
});

void benchmarkSink;
