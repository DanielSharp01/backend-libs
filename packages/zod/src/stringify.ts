import z, {
  ZodDate,
  ZodBoolean,
  ZodLiteral,
  ZodNumber,
  type ZodType,
  type ZodOptional,
  type ZodNullable,
  type ZodDefault,
  type ZodPrefault,
  type ZodNonOptional,
  type ZodReadonly,
  type ZodCatch,
  type ZodPipe,
  type ZodArray,
  type ZodObject,
  type ZodTuple,
  type ZodUnion,
  type ZodIntersection,
  type ZodLazy,
} from "zod";
import { mapZodInput, type AsZodType } from "./map-input";

export type ZodStringify<Z extends ZodType<any, any>> = Z extends ZodNumber
  ? ZodType<number, string>
  : Z extends ZodBoolean
    ? ZodType<boolean, "true" | "false" | "1" | "0">
    : Z extends ZodDate
      ? ZodType<Date, string>
      : Z extends ZodLiteral<infer V>
        ? V extends string | number | boolean
          ? ZodType<V, `${V}`>
          : Z
        : Z extends ZodOptional<infer I>
          ? ZodOptional<ZodStringify<AsZodType<I>>>
          : Z extends ZodNullable<infer I>
            ? ZodNullable<ZodStringify<AsZodType<I>>>
            : Z extends ZodDefault<infer I>
              ? ZodDefault<ZodStringify<AsZodType<I>>>
              : Z extends ZodPrefault<infer I>
                ? ZodType<z.output<Z>, z.input<ZodStringify<AsZodType<I>>> | undefined>
                : Z extends ZodNonOptional<infer I>
                  ? ZodNonOptional<ZodStringify<AsZodType<I>>>
                  : Z extends ZodReadonly<infer I>
                    ? ZodReadonly<ZodStringify<AsZodType<I>>>
                    : Z extends ZodCatch<infer I>
                      ? ZodCatch<ZodStringify<AsZodType<I>>>
                      : Z extends ZodPipe<infer I, infer O>
                        ? ZodPipe<ZodStringify<AsZodType<I>>, O>
                        : Z extends ZodArray<infer I>
                          ? ZodArray<ZodStringify<AsZodType<I>>>
                          : Z extends ZodObject<infer Shape>
                            ? ZodObject<{
                                [K in keyof Shape]: ZodStringify<AsZodType<Shape[K]>>;
                              }>
                            : Z extends ZodTuple<infer Items, infer Rest>
                              ? ZodTuple<
                                  {
                                    [K in keyof Items]: ZodStringify<AsZodType<Items[K]>>;
                                  },
                                  Rest extends ZodType<any, any> ? ZodStringify<Rest> : Rest
                                >
                              : Z extends ZodUnion<infer Options>
                                ? ZodUnion<{
                                    [K in keyof Options]: ZodStringify<AsZodType<Options[K]>>;
                                  }>
                                : Z extends ZodIntersection<infer L, infer R>
                                  ? ZodIntersection<ZodStringify<AsZodType<L>>, ZodStringify<AsZodType<R>>>
                                  : Z extends ZodLazy<infer I>
                                    ? ZodLazy<ZodStringify<AsZodType<I>>>
                                    : Z;

export function zodStringify<Z extends ZodType<any, any>>(schema: Z): ZodStringify<Z> {
  return mapZodInput(schema, (internal) => {
    if (internal instanceof ZodNumber) {
      return z
        .string()
        .transform((value) => (value === "" ? NaN : Number(value)))
        .refine((value) => !Number.isNaN(value), "Must be a number")
        .pipe(internal);
    }

    if (internal instanceof ZodBoolean) {
      return z
        .enum(["true", "false", "1", "0"])
        .transform((value) => value === "true" || value === "1")
        .pipe(internal);
    }

    if (internal instanceof ZodDate) {
      return z
        .union([z.iso.date(), z.iso.datetime()])
        .transform((value) => new Date(value))
        .pipe(internal);
    }

    if (internal instanceof ZodLiteral) {
      const value = internal.value;

      if (typeof value === "number") {
        return z
          .literal(`${value}`)
          .transform(Number)
          .pipe(internal as ZodType<any, number>);
      }

      if (typeof value === "boolean") {
        return z
          .literal(`${value}`)
          .transform((value) => value === "true")
          .pipe(internal as ZodType<any, boolean>);
      }

      if (typeof value === "string") {
        return internal;
      }
    }
  }) as ZodStringify<Z>;
}
