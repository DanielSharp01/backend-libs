import { z, type ZodType } from "zod";

const componentNamePattern = /^[A-Za-z0-9._-]+$/;

export interface ZodReferenceRegistry {
  readonly registry: z.core.$ZodRegistry<Record<string, unknown>>;
  readonly names: ReadonlyMap<string, ZodType<any, any>>;
  readonly schemas: ReadonlyMap<ZodType<any, any>, string>;
  asReference<TSchema extends ZodType<any, any>>(schema: TSchema, name: string): TSchema;
}

export function zodReferences(
  registry: z.core.$ZodRegistry<Record<string, unknown>> = z.registry(),
): ZodReferenceRegistry {
  const names = new Map<string, ZodType<any, any>>();
  const schemas = new Map<ZodType<any, any>, string>();
  return {
    registry,
    names,
    schemas,
    asReference<TSchema extends ZodType<any, any>>(schema: TSchema, name: string): TSchema {
      if (!componentNamePattern.test(name)) {
        throw new TypeError(`Invalid OpenAPI component schema name: ${JSON.stringify(name)}.`);
      }

      const namedSchema = names.get(name);
      if (namedSchema !== undefined && namedSchema !== schema) {
        throw new TypeError(`OpenAPI component schema name ${JSON.stringify(name)} is already registered.`);
      }

      const schemaName = schemas.get(schema);
      if (schemaName !== undefined && schemaName !== name) {
        throw new TypeError(
          `This Zod schema is already registered as OpenAPI component ${JSON.stringify(schemaName)}.`,
        );
      }

      if (namedSchema === schema) return schema;
      names.set(name, schema);
      schemas.set(schema, name);
      registry.add(schema, { ...registry.get(schema), id: name });
      return schema;
    },
  };
}
