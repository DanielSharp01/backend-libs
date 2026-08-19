import { bench, describe } from "vitest";

import { expressAdapter } from "./express-adapter";
import { typelineAdapter } from "./typeline-adapter";
import { JSON_REQUESTS, ROUTE_COUNT } from "./workload";

let benchmarkSink: unknown;

describe(`JSON responses (${ROUTE_COUNT} routes, up to four middleware scopes)`, () => {
  const applications = [typelineAdapter, expressAdapter].map((adapter) => ({
    adapter,
    application: adapter.build("json"),
  }));

  for (const request of JSON_REQUESTS) {
    describe(request.name, () => {
      for (const { adapter, application } of applications) {
        const prepared = application.prepare(request);
        bench(adapter.name, async () => {
          benchmarkSink = await prepared.run();
        });
      }
    });
  }
});

void benchmarkSink;
