import { expectTypeOf } from "vitest";

import { err, isErr, isOk, ok, type Err, type Ok, type Result } from "../src/result";

expectTypeOf(ok("ready" as const)).toEqualTypeOf<Ok<"ready">>();
expectTypeOf(err("NOT_FOUND" as const)).toEqualTypeOf<Err<"NOT_FOUND">>();

declare const result: Result<number, "NOT_FOUND">;

if (isOk(result)) {
  expectTypeOf(result).toEqualTypeOf<Ok<number>>();
  expectTypeOf(result.ok).toEqualTypeOf<number>();
}

if (isErr(result)) {
  expectTypeOf(result).toEqualTypeOf<Err<"NOT_FOUND">>();
  expectTypeOf(result.err).toEqualTypeOf<"NOT_FOUND">();
}
