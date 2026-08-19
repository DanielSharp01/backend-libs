import type { IncomingMessage } from "node:http";

import { typeline } from "@danielsharp/typeline";

import type { HttpMetadata } from "../../src/metadata";
import { httpRequest } from "../../src/request";
import { httpResponse } from "../../src/response";
import { httpRouteResolver, joinHttpRoutePath } from "../../src/resolver";
import type { HttpContext, RouteDefinition } from "../../src/router";
import type { RepresentativeAdapter, RepresentativeApplication } from "./adapter";
import { syntheticRequest, syntheticResponse } from "./synthetic-http";
import {
  registerRepresentativeApi,
  responsePayload,
  type WorkloadMode,
  type WorkloadRegistrar,
  type WorkloadRequest,
} from "./workload";

const REQUEST_POOL_SIZE = 256;

export const typelineAdapter: RepresentativeAdapter = {
  name: "typeline-http",
  build: (mode) => buildTypelineApplication(mode, true),
};

export function buildTypelineApplication(mode: WorkloadMode, compile: boolean): RepresentativeApplication {
  const resolver = httpRouteResolver();
  registerRepresentativeApi(typelineRegistrar(resolver, mode));
  if (compile) resolver.compile();

  return {
    prepare(request) {
      const contexts = Array.from({ length: REQUEST_POOL_SIZE }, () => typelineContext(request));
      let index = 0;
      return {
        async run() {
          const context = contexts[index++ % contexts.length]!;
          const response = context.res.raw as ReturnType<typeof syntheticResponse>;
          response.reset();
          try {
            const line = resolver.resolve(context);
            const output = await line.push({}, context);
            return mode === "json" ? response.body : output;
          } catch (error) {
            if (request.matched) throw error;
            return error;
          }
        },
      };
    },
  };
}

function typelineRegistrar(
  resolver: ReturnType<typeof httpRouteResolver>,
  mode: WorkloadMode,
  prefix = "/",
): WorkloadRegistrar {
  return {
    scope(path) {
      return typelineRegistrar(resolver, mode, joinHttpRoutePath(prefix, path));
    },
    route(method, path, routeId) {
      resolver.on(
        {
          method: method as RouteDefinition["method"],
          path: joinHttpRoutePath(prefix, path),
          contentTypes: ["application/json"],
        },
        typeline<{}, object, HttpContext, HttpMetadata>().pipe((_input, context) => {
          const payload = responsePayload(routeId, context.req.route?.params ?? {});
          return mode === "json" ? context.res.send(payload) : payload;
        }),
      );
    },
  };
}

function typelineContext(request: WorkloadRequest): HttpContext {
  const raw = syntheticRequest(request.method, request.path);
  return {
    req: httpRequest(raw as IncomingMessage),
    res: httpResponse(syntheticResponse()),
  };
}
