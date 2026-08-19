import type { ZodObject, ZodType } from "zod";

type MapperForShape<Shape extends Record<string, ZodType<any, any>>> = {
  [K in keyof Shape]?: (schema: Shape[K]) => ZodType<any, any>;
};

type MappedShape<Shape extends Record<string, ZodType<any, any>>, Map extends MapperForShape<Shape>> = {
  [K in keyof Shape]: K extends keyof Map
    ? Map[K] extends (...args: any[]) => infer R
      ? R extends ZodType<any, any>
        ? R
        : Shape[K]
      : Shape[K]
    : Shape[K];
};

export function zodMapEachKey<Shape extends Record<string, ZodType<any, any>>, Map extends MapperForShape<Shape>>(
  schema: ZodObject<Shape>,
  map: Map,
): ZodObject<MappedShape<Shape, Map>> {
  return schema.clone({
    ...schema.def,
    shape: Object.fromEntries(
      Object.entries(schema.shape).map(([key, value]) => [
        key,
        key in map ? map[key as keyof Map]!(value as any) : value,
      ]),
    ) as MappedShape<Shape, Map>,
  }) as ZodObject<MappedShape<Shape, Map>>;
}
