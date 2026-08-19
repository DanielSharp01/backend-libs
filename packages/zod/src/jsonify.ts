import {
  z,
  ZodDate,
  type ZodArray,
  type ZodCatch,
  type ZodDefault,
  type ZodPrefault,
  type ZodIntersection,
  type ZodLazy,
  type ZodNonOptional,
  type ZodNullable,
  type ZodObject,
  type ZodOptional,
  type ZodPipe,
  type ZodReadonly,
  type ZodTuple,
  type ZodType,
  type ZodUnion,
} from "zod";
import { mapZodInput, type AsZodType } from "./map-input";

export type ZodJsonify<Z extends ZodType<any, any>> = Z extends ZodDate
  ? ZodType<Date, string>
  : Z extends ZodOptional<infer I>
    ? ZodOptional<ZodJsonify<AsZodType<I>>>
    : Z extends ZodNullable<infer I>
      ? ZodNullable<ZodJsonify<AsZodType<I>>>
      : Z extends ZodDefault<infer I>
        ? ZodDefault<ZodJsonify<AsZodType<I>>>
        : Z extends ZodPrefault<infer I>
          ? ZodType<z.output<Z>, z.input<ZodJsonify<AsZodType<I>>> | undefined>
          : Z extends ZodNonOptional<infer I>
            ? ZodNonOptional<ZodJsonify<AsZodType<I>>>
            : Z extends ZodReadonly<infer I>
              ? ZodReadonly<ZodJsonify<AsZodType<I>>>
              : Z extends ZodCatch<infer I>
                ? ZodCatch<ZodJsonify<AsZodType<I>>>
                : Z extends ZodPipe<infer I, infer O>
                  ? ZodPipe<ZodJsonify<AsZodType<I>>, O>
                  : Z extends ZodArray<infer I>
                    ? ZodArray<ZodJsonify<AsZodType<I>>>
                    : Z extends ZodObject<infer Shape>
                      ? ZodObject<{
                          [K in keyof Shape]: ZodJsonify<AsZodType<Shape[K]>>;
                        }>
                      : Z extends ZodTuple<infer Items, infer Rest>
                        ? ZodTuple<
                            {
                              [K in keyof Items]: ZodJsonify<AsZodType<Items[K]>>;
                            },
                            Rest extends ZodType<any, any> ? ZodJsonify<Rest> : Rest
                          >
                        : Z extends ZodUnion<infer Options>
                          ? ZodUnion<{
                              [K in keyof Options]: ZodJsonify<AsZodType<Options[K]>>;
                            }>
                          : Z extends ZodIntersection<infer L, infer R>
                            ? ZodIntersection<ZodJsonify<AsZodType<L>>, ZodJsonify<AsZodType<R>>>
                            : Z extends ZodLazy<infer I>
                              ? ZodLazy<ZodJsonify<AsZodType<I>>>
                              : Z;

export function zodJsonify<Z extends ZodType<any, any>>(schema: Z): ZodJsonify<Z> {
  return mapZodInput(schema, (internal) => {
    if (internal instanceof ZodDate) {
      return z
        .union([z.iso.date(), z.iso.datetime()])
        .transform((value) => new Date(value))
        .pipe(internal);
    }
  }) as ZodJsonify<Z>;
}
