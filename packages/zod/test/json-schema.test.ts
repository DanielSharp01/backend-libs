import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodJsonSchemas } from "../src/json-schema";
import { zodReferences } from "../src/references";

describe("Zod JSON Schemas", () => {
  it("projects the left input and right output sides of pipes without running transforms", () => {
    let calls = 0;
    const schema = z
      .string()
      .transform((value) => {
        calls++;
        return value.length;
      })
      .pipe(z.int().min(1));

    const result = zodJsonSchemas({
      schemas: {
        input: { schemas: [schema], io: "input" },
        output: { schemas: [schema], io: "output" },
      },
    });

    expect(result.schemas.input).toEqual({ type: "string" });
    expect(result.schemas.output).toEqual({
      type: "integer",
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    });
    expect(calls).toBe(0);
  });

  it("omits a bare output transform and reports a warning", () => {
    const schema = z.string().transform((value) => value.length);

    const result = zodJsonSchemas({
      schemas: {
        valid: { schemas: [z.string()], io: "output" },
        output: { schemas: [schema], io: "output" },
      },
    });

    expect(result.schemas).toEqual({ valid: { type: "string" } });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        schema: "output",
        reason: "unrepresentable",
        message: "Transforms cannot be represented in JSON Schema",
      }),
    ]);
  });

  it("omits NaN because JSON has no corresponding value", () => {
    const result = zodJsonSchemas({
      schemas: {
        valid: { schemas: [z.number()], io: "output" },
        nan: { schemas: [z.object({ value: z.nan() })], io: "output" },
      },
    });

    expect(result.schemas).toEqual({ valid: { type: "number" } });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        schema: "nan",
        reason: "unrepresentable",
        message: "NaN cannot be represented in JSON Schema",
      }),
    ]);
  });

  it("uses the HTTP date transport schemas in each direction", () => {
    const explicit = new Date("2026-08-20T07:00:00.000Z");
    const references = zodReferences();
    const input = z.date().register(references.registry, { examples: [explicit] });
    const result = zodJsonSchemas({
      references,
      schemas: {
        input: { schemas: [input], io: "input" },
        output: { schemas: [z.date().default(explicit)], io: "output" },
      },
    });

    expect(result.schemas.input).toEqual({
      anyOf: [
        { type: "string", format: "date" },
        { type: "string", format: "date-time" },
      ],
      examples: [explicit.toISOString()],
    });
    expect(result.schemas.output).toEqual({
      type: "string",
      format: "date-time",
      default: explicit.toISOString(),
    });
  });

  it("documents bounded dates additively and reports the approximation", () => {
    const references = zodReferences();
    const schema = z
      .date()
      .min(new Date("2026-01-01"))
      .max(new Date("2026-12-31"))
      .register(references.registry, { description: "Creation date." });

    const result = zodJsonSchemas({ references, schemas: { input: { schemas: [schema], io: "input" } } });

    expect(result.schemas.input).toHaveProperty(
      "description",
      "Creation date.\n\nRuntime date constraint: the value must be on or after 2026-01-01T00:00:00.000Z and on or before 2026-12-31T00:00:00.000Z.",
    );
    expect(result.warnings).toEqual([
      {
        schema: "input",
        reason: "bounded-date",
        message:
          "A bounded Zod date was represented as an ISO string; its runtime bounds are documented in the description.",
      },
    ]);
  });

  it("uses described JSON approximations for bigint and non-JSON literals", () => {
    const result = zodJsonSchemas({
      schemas: {
        bigint: { schemas: [z.bigint()], io: "input" },
        bigintLiteral: { schemas: [z.literal(42n)], io: "input" },
        undefinedLiteral: { schemas: [z.literal(undefined)], io: "input" },
      },
    });

    expect(result.schemas.bigint).toEqual({
      type: "number",
      description:
        "Runtime values are JavaScript bigint values represented as JSON numbers. Values outside the safe integer range may lose precision.",
    });
    expect(result.schemas.bigintLiteral).toEqual({
      type: "number",
      const: 42,
      description: "Runtime literal representation: 42n as 42.",
    });
    expect(result.schemas.undefinedLiteral).toEqual({
      type: "null",
      const: null,
      description: "Runtime literal representation: undefined as null.",
    });
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.map((warning) => warning.reason)).toEqual([
      "bigint",
      "non-json-literal",
      "non-json-literal",
    ]);
  });

  it("unwraps lazy schemas and follows defaults on the selected pipe side", () => {
    const lazy = z.lazy(() => z.object({ value: z.string() }));
    const piped = z.string().transform(Number).pipe(z.number()).default(1);

    const result = zodJsonSchemas({
      schemas: {
        lazy: { schemas: [lazy], io: "output" },
        input: { schemas: [piped], io: "input" },
        output: { schemas: [piped], io: "output" },
      },
    });

    expect(result.schemas.lazy).toEqual({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    });
    expect(result.schemas.input).toEqual({ type: "string" });
    expect(result.schemas.output).toEqual({ type: "number", default: 1 });
    expect(result.warnings).toEqual([]);
  });

  it("keeps explicit object intersections visible", () => {
    const schema = z.intersection(
      z.object({ left: z.string(), shared: z.string().min(2) }),
      z.object({ right: z.number(), shared: z.string().max(4) }),
    );

    const result = zodJsonSchemas({
      schemas: {
        input: { schemas: [schema], io: "input" },
        output: { schemas: [schema], io: "output" },
      },
    });

    expect(result.schemas.input).toEqual({
      allOf: [
        {
          type: "object",
          properties: { left: { type: "string" }, shared: { type: "string", minLength: 2 } },
          required: ["left", "shared"],
        },
        {
          type: "object",
          properties: { right: { type: "number" }, shared: { type: "string", maxLength: 4 } },
          required: ["right", "shared"],
        },
      ],
    });
    expect(result.schemas.output).toHaveProperty("allOf");
  });

  it("keeps intersections with strict or checked object branches visible", () => {
    const strict = z.intersection(z.strictObject({ left: z.string() }), z.object({ right: z.string() }));
    const checked = z.intersection(
      z.object({ left: z.string() }).refine(({ left }) => left.length > 0),
      z.object({ right: z.string() }),
    );

    const result = zodJsonSchemas({
      schemas: {
        strict: { schemas: [strict], io: "input" },
        checked: { schemas: [checked], io: "input" },
      },
    });

    expect(result.schemas.strict).toHaveProperty("allOf");
    expect(result.schemas.checked).toHaveProperty("allOf");
  });

  it("merges ordered object schema lists in full and flat modes", () => {
    const schemas = [
      z.object({ first: z.string(), shared: z.string().min(2) }),
      z.object({ second: z.number(), shared: z.string().max(4) }),
      z.object({ third: z.boolean() }),
    ] as const;

    const result = zodJsonSchemas({
      schemas: {
        full: { schemas, io: "input" },
        flat: { schemas, io: "input", mode: "flat" },
      },
    });

    const expectedProperties = {
      first: { type: "string" },
      shared: { type: "string", maxLength: 4 },
      second: { type: "number" },
      third: { type: "boolean" },
    };
    expect(result.schemas.full).toMatchObject({ type: "object", properties: expectedProperties });
    expect(result.schemas.flat).toMatchObject({ type: "object", properties: expectedProperties });
  });

  it("merges adjacent object runs and retains other full-mode schemas as allOf branches", () => {
    const result = zodJsonSchemas({
      schemas: {
        value: {
          schemas: [
            z.object({ first: z.string() }),
            z.object({ second: z.number() }),
            z.string(),
            z.object({ third: z.boolean() }),
            z.object({ fourth: z.null() }),
          ],
          io: "input",
        },
      },
    });

    expect(result.schemas.value).toEqual({
      allOf: [
        {
          type: "object",
          properties: { first: { type: "string" }, second: { type: "number" } },
          required: ["first", "second"],
        },
        { type: "string" },
        {
          type: "object",
          properties: { third: { type: "boolean" }, fourth: { type: "null" } },
          required: ["third", "fourth"],
        },
      ],
    });
  });

  it("omits an unrepresentable list member and retains successful allOf branches", () => {
    const result = zodJsonSchemas({
      schemas: {
        value: { schemas: [z.string(), z.nan(), z.number()], io: "input" },
      },
    });

    expect(result.schemas.value).toEqual({ allOf: [{ type: "string" }, { type: "number" }] });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        schema: "value",
        reason: "unrepresentable",
        message: "NaN cannot be represented in JSON Schema",
      }),
    ]);
  });

  it("merges the object representations Zod emits through root wrappers", () => {
    const result = zodJsonSchemas({
      schemas: {
        value: {
          schemas: [
            z.object({ first: z.string() }).optional(),
            z.object({ second: z.string() }).default({ second: "default" }),
          ],
          io: "input",
        },
      },
    });

    expect(result.schemas.value).toEqual({
      type: "object",
      properties: { first: { type: "string" }, second: { type: "string" } },
      required: ["first", "second"],
      default: { second: "default" },
    });
    expect(result.requiredSchemas).toEqual(new Set());
  });

  it("emits only reachable named references", () => {
    const references = zodReferences();
    const Address = references.asReference(z.object({ city: z.string() }), "Address");
    const User = references.asReference(z.object({ id: z.string(), address: Address }), "User");
    references.asReference(z.object({ ignored: z.boolean() }), "Unused");

    const result = zodJsonSchemas({
      references,
      schemas: {
        body: { schemas: [z.object({ user: User })], io: "input" },
      },
    });

    expect(result.schemas.body).toEqual({
      type: "object",
      properties: { user: { $ref: "#/components/schemas/User" } },
      required: ["user"],
    });
    expect(result.components).toEqual({
      Address: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          address: { $ref: "#/components/schemas/Address" },
        },
        required: ["id", "address"],
      },
    });
  });

  it("does not merge named references into adjacent object runs", () => {
    const references = zodReferences();
    const Named = references.asReference(z.object({ named: z.string() }), "Named");

    const result = zodJsonSchemas({
      references,
      schemas: {
        body: { schemas: [Named, z.object({ local: z.number() })], io: "input" },
      },
    });

    expect(result.schemas.body).toEqual({
      allOf: [
        { $ref: "#/components/schemas/Named" },
        { type: "object", properties: { local: { type: "number" } }, required: ["local"] },
      ],
    });
    expect(result.components.Named).toEqual({
      type: "object",
      properties: { named: { type: "string" } },
      required: ["named"],
    });
  });

  it("keeps intersections visible inside named components", () => {
    const references = zodReferences();
    const Combined = references.asReference(
      z.intersection(z.object({ left: z.string() }), z.object({ right: z.number() })),
      "Combined",
    );

    const result = zodJsonSchemas({
      references,
      schemas: { body: { schemas: [Combined], io: "input" } },
    });

    expect(result.schemas.body).toEqual({ $ref: "#/components/schemas/Combined" });
    expect(result.components.Combined).toEqual({
      allOf: [
        { type: "object", properties: { left: { type: "string" } }, required: ["left"] },
        { type: "object", properties: { right: { type: "number" } }, required: ["right"] },
      ],
    });
  });

  it("keeps parameter-group references inline", () => {
    const references = zodReferences();
    const Filter = references.asReference(
      z.object({ value: z.string().register(references.registry, { description: "Filter value" }) }),
      "Filter",
    );

    const result = zodJsonSchemas({
      references,
      schemas: {
        query: {
          schemas: [z.object({ filter: Filter })],
          io: "input",
          referenceMode: "inline",
        },
      },
    });

    expect(result.components).toEqual({});
    expect(result.schemas.query).toEqual({
      type: "object",
      properties: {
        filter: {
          type: "object",
          properties: { value: { type: "string", description: "Filter value" } },
          required: ["value"],
        },
      },
      required: ["filter"],
    });
  });

  it("merges fixed object representations in flat mode", () => {
    const result = zodJsonSchemas({
      schemas: {
        params: {
          schemas: [
            z.strictObject({ id: z.string(), shared: z.string().min(2) }),
            z.object({ shared: z.string().max(4), page: z.number().optional() }),
          ],
          io: "input",
          referenceMode: "inline",
          mode: "flat",
        },
      },
    });

    expect(result.schemas.params).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        shared: { type: "string", maxLength: 4 },
        page: { type: "number" },
      },
      required: ["id", "shared"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("omits unsupported properties from flat JSON Schema representations", () => {
    const result = zodJsonSchemas({
      schemas: {
        headers: {
          schemas: [
            z.object({ scalar: z.string(), array: z.array(z.string()), nested: z.object({ value: z.string() }) }),
          ],
          io: "input",
          mode: "flat",
        },
        query: {
          schemas: [
            z.object({ scalar: z.string(), array: z.array(z.number()), nested: z.object({ value: z.string() }) }),
          ],
          io: "input",
          mode: "flat-array",
        },
      },
    });

    expect(result.schemas.headers).toEqual({
      type: "object",
      properties: { scalar: { type: "string" } },
      required: ["scalar"],
    });
    expect(result.schemas.query).toEqual({
      type: "object",
      properties: {
        scalar: { type: "string" },
        array: { type: "array", items: { type: "number" } },
      },
      required: ["scalar", "array"],
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        schema: "headers",
        property: "array",
        reason: "unsupported-schema-property",
      }),
      expect.objectContaining({
        schema: "headers",
        property: "nested",
        reason: "unsupported-schema-property",
      }),
      expect.objectContaining({
        schema: "query",
        property: "nested",
        reason: "unsupported-schema-property",
      }),
    ]);
  });

  it("classifies unions, nullability, arrays, and tuples from their JSON Schema representations", () => {
    const properties = {
      scalarUnion: z.union([z.string(), z.number()]),
      nullable: z.string().nullable(),
      nullableArray: z.array(z.string()).nullable(),
      tuple: z.tuple([z.string(), z.number()]),
    };
    const result = zodJsonSchemas({
      schemas: {
        flat: { schemas: [z.object(properties)], io: "input", mode: "flat" },
        flatArray: { schemas: [z.object(properties)], io: "input", mode: "flat-array" },
      },
    });

    expect(result.schemas.flat).toMatchObject({
      properties: {
        scalarUnion: { anyOf: [{ type: "string" }, { type: "number" }] },
        nullable: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["scalarUnion", "nullable"],
    });
    expect(result.schemas.flat).not.toHaveProperty("properties.nullableArray");
    expect(result.schemas.flat).not.toHaveProperty("properties.tuple");
    expect(result.schemas.flatArray).toMatchObject({
      properties: {
        nullableArray: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
        tuple: { type: "array", prefixItems: [{ type: "string" }, { type: "number" }] },
      },
      required: ["scalarUnion", "nullable", "nullableArray", "tuple"],
    });
  });

  it("omits flat groups without a fixed object representation", () => {
    const result = zodJsonSchemas({
      schemas: {
        union: {
          schemas: [z.union([z.object({ left: z.string() }), z.object({ right: z.string() })])],
          io: "input",
          mode: "flat",
        },
        catchall: {
          schemas: [z.object({ known: z.string() }).catchall(z.string())],
          io: "input",
          mode: "flat",
        },
        intersection: {
          schemas: [z.intersection(z.object({ left: z.string() }), z.object({ right: z.string() }))],
          io: "input",
          mode: "flat",
        },
      },
    });

    expect(result.schemas).toEqual({});
    expect(result.warnings.map((warning) => warning.reason)).toEqual([
      "unsupported-schema-group",
      "unsupported-schema-group",
      "unsupported-schema-group",
    ]);
    expect(result.requiredSchemas).toEqual(new Set());
  });

  it("uses the selected pipe side for flat shape detection", () => {
    let calls = 0;
    const schema = z
      .object({
        input: z
          .string()
          .transform((value) => {
            calls++;
            return value.length;
          })
          .default(1)
          .refine((value) => value > 0),
      })
      .transform(({ input }) => ({ output: input }))
      .pipe(z.object({ output: z.number() }));

    const result = zodJsonSchemas({
      schemas: {
        input: { schemas: [schema], io: "input", mode: "flat" },
        output: { schemas: [schema], io: "output", mode: "flat" },
      },
    });

    expect(result.schemas.input).toHaveProperty("properties.input.type", "string");
    expect(result.schemas.output).toHaveProperty("properties.output.type", "number");
    expect(calls).toBe(0);
  });

  it("reports which successful root projections are required", () => {
    const result = zodJsonSchemas({
      schemas: {
        required: { schemas: [z.object({ value: z.string() })], io: "input" },
        optional: { schemas: [z.object({ value: z.string() }).optional()], io: "input" },
        defaulted: { schemas: [z.object({ value: z.string() }).default({ value: "x" })], io: "input" },
      },
    });

    expect(result.requiredSchemas).toEqual(new Set(["required"]));
  });

  it("inlines direction conflicts while preserving nonconflicting references", () => {
    const references = zodReferences();
    const Shared = references.asReference(z.object({ value: z.string() }), "Shared");
    const InputOnly = references.asReference(z.object({ input: z.string() }), "InputOnly");
    const OutputOnly = references.asReference(z.object({ output: z.string() }), "OutputOnly");

    const result = zodJsonSchemas({
      references,
      schemas: {
        input: { schemas: [z.object({ shared: Shared, inputOnly: InputOnly })], io: "input" },
        output: { schemas: [z.object({ shared: Shared, outputOnly: OutputOnly })], io: "output" },
      },
    });

    expect(result.referenceDirectionConflicts).toEqual(["Shared"]);
    expect(result.components).toEqual({
      InputOnly: {
        type: "object",
        properties: { input: { type: "string" } },
        required: ["input"],
      },
      OutputOnly: {
        type: "object",
        properties: { output: { type: "string" } },
        required: ["output"],
        additionalProperties: false,
      },
    });
    expect(result.schemas.input).not.toHaveProperty("$defs");
    expect(result.schemas.input).not.toHaveProperty("properties.shared.$ref");
    expect(result.schemas.output).not.toHaveProperty("properties.shared.$ref");
    expect(result.schemas.input).toHaveProperty("properties.inputOnly.$ref", "#/components/schemas/InputOnly");
    expect(result.schemas.output).toHaveProperty("properties.outputOnly.$ref", "#/components/schemas/OutputOnly");
  });

  it("keeps independently registered schemas in their own directions", () => {
    const references = zodReferences();
    const UserInput = references.asReference(
      z.object({ value: z.string() }).register(references.registry, { description: "A user" }),
      "UserInput",
    );
    const UserOutput = references.asReference(
      z.object({ value: z.string() }).register(references.registry, { description: "A user" }),
      "UserOutput",
    );

    const result = zodJsonSchemas({
      references,
      schemas: {
        input: { schemas: [UserInput], io: "input" },
        output: { schemas: [UserOutput], io: "output" },
      },
    });

    expect(result.referenceDirectionConflicts).toEqual([]);
    expect(result.schemas).toEqual({
      input: { $ref: "#/components/schemas/UserInput" },
      output: { $ref: "#/components/schemas/UserOutput" },
    });
    expect(result.components.UserInput).toHaveProperty("description", "A user");
    expect(result.components.UserOutput).toHaveProperty("description", "A user");
  });

  it("ignores global reference IDs when no reference registry is provided", () => {
    const schema = z.object({ value: z.string() }).meta({ id: "GlobalSchema" });

    const result = zodJsonSchemas({ schemas: { body: { schemas: [schema], io: "input" } } });

    expect(result.components).toEqual({});
    expect(result.schemas.body).toEqual({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    });
  });

  it("preserves native numeric bounds without inventing examples or defaults", () => {
    const result = zodJsonSchemas({
      schemas: {
        integer: { schemas: [z.int()], io: "input" },
        bounded: { schemas: [z.number().min(5).max(10)], io: "input" },
      },
    });

    expect(result.schemas.integer).toEqual({
      type: "integer",
      minimum: Number.MIN_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER,
    });
    expect(result.schemas.bounded).toEqual({ type: "number", minimum: 5, maximum: 10 });
  });
});
