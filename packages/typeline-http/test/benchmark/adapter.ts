import type { Awaitable } from "@danielsharp/common";

import type { WorkloadMode, WorkloadRequest } from "./workload";

export interface PreparedBenchmarkRequest {
  run(): Awaitable<unknown>;
}

export interface RepresentativeApplication {
  prepare(request: WorkloadRequest): PreparedBenchmarkRequest;
}

export interface RepresentativeAdapter {
  readonly name: string;
  build(mode: WorkloadMode): RepresentativeApplication;
}
