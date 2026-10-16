import { expectTypeOf } from "vitest";
import { z, type ZodType } from "zod";

import {
  ZodError,
  ZodSchemaConversionError,
  zodJsonSchemas,
  zodReferences,
  zodJsonString,
  zodJsonify,
  zodMapEachKey,
  zodStringify,
  type ZodJsonSchemasResult,
  type ZodReferenceRegistry,
  type ZodJsonify,
  type ZodStringify,
  type FlatZodObject,
} from "../src/index";

expectTypeOf(ZodError.is).toBeFunction();
expectTypeOf(ZodSchemaConversionError.is).toBeFunction();
expectTypeOf(zodJsonString).toBeFunction();
expectTypeOf(zodJsonify).toBeFunction();
expectTypeOf(zodMapEachKey).toBeFunction();
expectTypeOf(zodJsonSchemas).toBeFunction();
expectTypeOf(zodReferences).returns.toEqualTypeOf<ZodReferenceRegistry>();
expectTypeOf(zodReferences(z.globalRegistry)).toEqualTypeOf<ZodReferenceRegistry>();
expectTypeOf(zodStringify).toBeFunction();

expectTypeOf(
  zodJsonSchemas({ schemas: { value: { schemas: [z.string()], io: "input" } } }),
).toEqualTypeOf<ZodJsonSchemasResult>();

zodJsonSchemas({
  schemas: {
    value: {
      // @ts-expect-error A projection must contain at least one schema.
      schemas: [],
      io: "input",
    },
  },
});

const schema = z.object({ createdAt: z.date(), count: z.number() });
const references = zodReferences();
expectTypeOf(references.asReference(schema, "Schema")).toEqualTypeOf<typeof schema>();
expectTypeOf(references.registry).toEqualTypeOf<z.core.$ZodRegistry<Record<string, unknown>>>();
expectTypeOf(references.names).toEqualTypeOf<ReadonlyMap<string, ZodType<any, any>>>();
expectTypeOf(references.schemas).toEqualTypeOf<ReadonlyMap<ZodType<any, any>, string>>();
expectTypeOf<ZodJsonify<typeof schema>>().not.toBeNever();
expectTypeOf<ZodStringify<typeof schema>>().not.toBeNever();
expectTypeOf<FlatZodObject<typeof schema>>().not.toBeNever();
