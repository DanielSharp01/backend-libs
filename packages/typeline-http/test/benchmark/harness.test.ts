import { describe, expect, it } from "vitest";

import { expressAdapter } from "./express-adapter";
import { typelineAdapter } from "./typeline-adapter";
import { JSON_REQUESTS, ROUTE_COUNT, ROUTING_REQUESTS } from "./workload";

describe("representative benchmark harness", () => {
  it("contains the intended application and request mix", () => {
    expect(ROUTE_COUNT).toBe(150);
    expect(ROUTING_REQUESTS.map((request) => request.matched)).toEqual([true, true, true, true, false, false]);
  });

  for (const adapter of [typelineAdapter, expressAdapter]) {
    it(`${adapter.name} dispatches every representative routing request`, async () => {
      const application = adapter.build("dispatch");
      for (const request of ROUTING_REQUESTS) {
        const result = await application.prepare(request).run();
        if (request.matched) {
          expect(result).toMatchObject({ ok: true, params: { organizationId: expect.any(String) } });
        } else {
          expect(result).toBeDefined();
        }
      }
    });

    it(`${adapter.name} serializes every representative JSON response`, async () => {
      const application = adapter.build("json");
      for (const request of JSON_REQUESTS) {
        const body = await application.prepare(request).run();
        const decoded = JSON.parse(String(body));
        expect(decoded).toMatchObject({ ok: true, params: { organizationId: expect.any(String) } });
      }
    });
  }
});
