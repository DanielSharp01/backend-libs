# HTTP benchmarks

Run this package's opt-in benchmarks with:

```sh
pnpm --filter @danielsharp/typeline-http benchmark
```

Ordinary `vitest run` and package test scripts ignore `*.bench.ts` files.

The representative workload contains 150 JSON API routes nested below API, version, organization, and resource scopes. Each scope has middleware, giving most routes four middleware layers. Routing cases sample early, middle, late, encoded, not-found, and method-not-allowed requests. JSON cases additionally include response serialization using each framework's normal response API.

The synthetic request and response objects deliberately avoid socket and HTTP-client noise. Request objects are pooled so the results primarily describe framework routing and response work, rather than fixture allocation.

To add a framework, implement `RepresentativeAdapter` and include it in the benchmark suites. To add a workload shape, implement another registrar function using `WorkloadRegistrar`; adapters do not need to change.
