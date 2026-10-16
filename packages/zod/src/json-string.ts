import { z, type ZodType } from "zod";

/**
 * A JSON string parsed and then validated by `schema`. Malformed JSON is reported as a validation
 * issue rather than thrown, so `.catch()` and `safeParse` handle it like any other invalid input.
 */
export function zodJsonString<T extends ZodType>(schema: T) {
  return z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}
