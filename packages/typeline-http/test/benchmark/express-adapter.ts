import type { IncomingMessage } from "node:http";

import express, { type Request, type RequestHandler, type Response, type Router } from "express";

import type { PreparedBenchmarkRequest, RepresentativeAdapter, RepresentativeApplication } from "./adapter";
import { syntheticRequest, syntheticResponse, type SyntheticResponse } from "./synthetic-http";
import {
  registerRepresentativeApi,
  responsePayload,
  type WorkloadMode,
  type WorkloadRegistrar,
  type WorkloadRequest,
} from "./workload";

const REQUEST_POOL_SIZE = 256;

type ExpressRequest = IncomingMessage & Request;

interface ExpressEntry {
  readonly request: ExpressRequest;
  readonly response: SyntheticResponse;
}

export const expressAdapter: RepresentativeAdapter = {
  name: "express",
  build: buildExpressApplication,
};

export function buildExpressApplication(mode: WorkloadMode): RepresentativeApplication {
  const app = express();
  app.disable("x-powered-by");
  registerRepresentativeApi(expressRegistrar(app, mode));

  return {
    prepare(request) {
      const entries = Array.from({ length: REQUEST_POOL_SIZE }, () => expressEntry(request));
      let index = 0;
      return {
        async run() {
          const entry = entries[index++ % entries.length]!;
          resetExpressEntry(entry, request);
          await new Promise<void>((resolve, reject) => {
            (
              app as unknown as {
                handle(request: Request, response: Response, done: (error?: unknown) => void): void;
              }
            ).handle(entry.request, entry.response as unknown as Response, (error) => {
              if (error) {
                reject(error);
                return;
              }
              entry.response.output = request.matched ? new Error("Expected Express route to match.") : "unmatched";
              resolve();
            });

            if (entry.response.output !== undefined || entry.response.body !== undefined) resolve();
          });
          return mode === "json" ? entry.response.body : entry.response.output;
        },
      } satisfies PreparedBenchmarkRequest;
    },
  };
}

function expressRegistrar(router: Router, mode: WorkloadMode): WorkloadRegistrar {
  return {
    scope(path) {
      const child = express.Router({ mergeParams: true });
      child.use((_request, _response, next) => next());
      router.use(path, child);
      return expressRegistrar(child, mode);
    },
    route(method, path, routeId) {
      const handler: RequestHandler = (request, response) => {
        const payload = responsePayload(routeId, request.params);
        if (mode === "json") {
          response.json(payload);
        } else {
          (response as unknown as SyntheticResponse).output = payload;
        }
      };
      router.route(path)[method.toLowerCase() as "get"](handler);
    },
  };
}

function expressEntry(request: WorkloadRequest): ExpressEntry {
  return {
    request: syntheticRequest(request.method, request.path) as ExpressRequest,
    response: syntheticResponse(),
  };
}

function resetExpressEntry(entry: ExpressEntry, request: WorkloadRequest): void {
  entry.request.method = request.method;
  entry.request.originalUrl = request.path;
  entry.request.url = request.path;
  entry.response.reset();
}
