import z, {
  ZodType,
  ZodOptional,
  ZodNullable,
  ZodDefault,
  ZodPrefault,
  ZodArray,
  ZodObject,
  ZodPipe,
  ZodTuple,
  ZodUnion,
  ZodIntersection,
  ZodNonOptional,
  ZodReadonly,
  ZodCatch,
  ZodLazy,
} from "zod";

export type AsZodType<T> = T extends ZodType<any, any> ? T : never;

export function mapZodInput<Z extends ZodType<any, any>>(
  schema: Z,
  map: (schema: ZodType) => ZodType | undefined,
): ZodType<any, any> {
  const mapped = map(schema);
  if (mapped) return mapped;

  if (schema instanceof ZodOptional) {
    return schema.clone({
      ...schema.def,
      innerType: mapZodInput(schema.unwrap() as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodNullable) {
    return schema.clone({
      ...schema.def,
      innerType: mapZodInput(schema.unwrap() as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodDefault) {
    return schema.clone({
      ...schema.def,
      innerType: mapZodInput(schema.unwrap() as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodPrefault) {
    const inner = schema.unwrap() as ZodType<any, any>;
    // The prefault is expressed in the original input type, not the mapped transport type.
    // Run that value through the original schema while defined inputs use the mapped schema.
    const prefault = z
      .undefined()
      .transform(() => schema.def.defaultValue)
      .pipe(inner);

    return z.union([prefault, mapZodInput(inner, map)]);
  }

  if (schema instanceof ZodNonOptional) {
    return schema.clone({
      ...schema.def,
      innerType: mapZodInput(schema.unwrap() as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodReadonly) {
    return schema.clone({
      ...schema.def,
      innerType: mapZodInput(schema.def.innerType as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodCatch) {
    return schema.clone({
      ...schema.def,
      innerType: mapZodInput(schema.unwrap() as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodPipe) {
    const pipe = schema as unknown as ZodPipe<ZodType<any, any>, ZodType<any, any>>;

    return pipe.clone({
      ...pipe.def,
      in: mapZodInput(pipe.def.in as ZodType<any, any>, map),
      out: pipe.def.out,
    });
  }

  if (schema instanceof ZodArray) {
    return schema.clone({
      ...schema.def,
      element: mapZodInput(schema.element as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodObject) {
    return schema.clone({
      ...schema.def,
      shape: Object.fromEntries(Object.entries(schema.shape).map(([key, value]) => [key, mapZodInput(value, map)])),
    });
  }

  if (schema instanceof ZodTuple) {
    return schema.clone({
      ...schema.def,
      items: schema.def.items.map((item) => mapZodInput(item as ZodType<any, any>, map)),
      rest: schema.def.rest ? mapZodInput(schema.def.rest as ZodType<any, any>, map) : null,
    });
  }

  if (schema instanceof ZodUnion) {
    return schema.clone({
      ...schema.def,
      options: schema.def.options.map((option) => mapZodInput(option as ZodType<any, any>, map)),
    });
  }

  if (schema instanceof ZodIntersection) {
    return schema.clone({
      ...schema.def,
      left: mapZodInput(schema.def.left as ZodType<any, any>, map),
      right: mapZodInput(schema.def.right as ZodType<any, any>, map),
    });
  }

  if (schema instanceof ZodLazy) {
    return schema.clone({
      ...schema.def,
      getter: () => mapZodInput(schema.unwrap() as ZodType<any, any>, map),
    });
  }

  return schema;
}
