import { bench, describe } from "vitest";

import type { PreparedBenchmarkRequest } from "./adapter";
import { expressAdapter } from "./express-adapter";
import { typelineAdapter } from "./typeline-adapter";
import { ROUTE_COUNT, ROUTING_REQUESTS } from "./workload";

let benchmarkSink: unknown;

describe(`routing (${ROUTE_COUNT} routes, up to four middleware scopes)`, () => {
  const applications = [typelineAdapter, expressAdapter].map((adapter) => ({
    adapter,
    application: adapter.build("dispatch"),
  }));

  for (const request of ROUTING_REQUESTS) {
    describe(request.name, () => {
      for (const { adapter, application } of applications) {
        const prepared: PreparedBenchmarkRequest = application.prepare(request);
        bench(adapter.name, async () => {
          benchmarkSink = await prepared.run();
        });
      }
    });
  }
});

void benchmarkSink;
