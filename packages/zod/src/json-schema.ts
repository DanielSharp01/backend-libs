import { z, type ZodType } from "zod";

import { ZodSchemaConversionError } from "./errors";
import { appendJsonSchemaDescription } from "./json-schema-description";
import type { ZodReferenceRegistry } from "./references";

type ZodJsonSchemaIo = "input" | "output";
type ZodJsonSchemaReferenceMode = "inline" | "preserve";
type ZodJsonSchemaMode = "flat" | "flat-array" | "full";
type ZodJsonSchema = Record<string, unknown>;

interface ZodJsonSchemaProjection {
  readonly schemas: readonly [ZodType<any, any>, ...ZodType<any, any>[]];
  readonly io: ZodJsonSchemaIo;
  readonly referenceMode?: ZodJsonSchemaReferenceMode;
  readonly mode?: ZodJsonSchemaMode;
}

export interface ZodJsonSchemasOptions {
  readonly schemas: Readonly<Record<string, ZodJsonSchemaProjection>>;
  readonly references?: ZodReferenceRegistry;
}

interface ZodJsonSchemaWarningBase {
  readonly schema: string;
  readonly message: string;
}

export type ZodJsonSchemaWarning =
  | (ZodJsonSchemaWarningBase & {
      readonly reason: "bigint" | "bounded-date" | "non-json-literal" | "unrepresentable";
      readonly cause?: unknown;
      readonly referenceName?: string;
    })
  | (ZodJsonSchemaWarningBase & {
      readonly reason: "reference-direction-conflict";
      readonly referenceName: string;
    })
  | (ZodJsonSchemaWarningBase & { readonly reason: "unsupported-schema-group" })
  | (ZodJsonSchemaWarningBase & {
      readonly reason: "unsupported-schema-property";
      readonly property: string;
    });

export interface ZodJsonSchemasResult {
  readonly schemas: Partial<Record<string, ZodJsonSchema>>;
  readonly components: Record<string, ZodJsonSchema>;
  readonly requiredSchemas: ReadonlySet<string>;
  readonly referenceDirectionConflicts: readonly string[];
  readonly warnings: readonly ZodJsonSchemaWarning[];
}

interface ConversionProjection {
  readonly schema: ZodType<any, any>;
  readonly io: ZodJsonSchemaIo;
  readonly referenceMode?: ZodJsonSchemaReferenceMode;
}

type ProjectionEntry = readonly [key: string, projection: ConversionProjection];
type RequestedProjectionEntry = readonly [key: string, projection: ZodJsonSchemaProjection];

interface ProjectionGroup {
  readonly key: string;
  readonly memberKeys: readonly string[];
  readonly mode: ZodJsonSchemaMode;
}

interface PreparedProjections {
  readonly entries: ProjectionEntry[];
  readonly groups: readonly ProjectionGroup[];
  readonly originalKeys: ReadonlyMap<string, string>;
}

interface MappedProjectionGroups {
  readonly schemas: Partial<Record<string, ZodJsonSchema>>;
  readonly warnings: ZodJsonSchemaWarning[];
}

interface ConvertedBatch {
  readonly schemas: Record<string, ZodJsonSchema>;
  readonly components: Record<string, ZodJsonSchema>;
  readonly requiredSchemas: ReadonlySet<string>;
  readonly warnings: readonly ZodJsonSchemaWarning[];
}

type WithoutSchema<T> = T extends unknown ? Omit<T, "schema"> : never;
type ConversionIssue = WithoutSchema<ZodJsonSchemaWarning>;

const componentReferencePrefix = "#/$defs/";
const unrepresentableMessages: Readonly<Record<string, string>> = {
  symbol: "Symbols cannot be represented in JSON Schema",
  undefined: "Undefined cannot be represented in JSON Schema",
  void: "Void cannot be represented in JSON Schema",
  custom: "Custom types cannot be represented in JSON Schema",
  function: "Function types cannot be represented in JSON Schema",
  transform: "Transforms cannot be represented in JSON Schema",
  map: "Map cannot be represented in JSON Schema",
  nan: "NaN cannot be represented in JSON Schema",
  set: "Set cannot be represented in JSON Schema",
};
const emptySchemaTypes = new Set([
  "any",
  "unknown",
  "optional",
  "nonoptional",
  "default",
  "prefault",
  "catch",
  "pipe",
  "readonly",
  "promise",
  "lazy",
]);

export function zodJsonSchemas(options: ZodJsonSchemasOptions): ZodJsonSchemasResult {
  const prepared = prepareProjections(Object.entries(options.schemas));
  const entries = prepared.entries;
  const referenceState = options.references;
  const preservedInput = selectEntries(entries, "input", "preserve");
  const preservedOutput = selectEntries(entries, "output", "preserve");
  const inlineInput = selectEntries(entries, "input", "inline");
  const inlineOutput = selectEntries(entries, "output", "inline");

  const inputReferences = collectReachableReferences(preservedInput, "input", referenceState);
  const outputReferences = collectReachableReferences(preservedOutput, "output", referenceState);
  const referenceDirectionConflicts = referenceState
    ? [...referenceState.names.keys()].filter((name) => inputReferences.has(name) && outputReferences.has(name))
    : [];
  const inlinedReferences = new Set(referenceDirectionConflicts);
  const allReferences = new Set(referenceState?.names.keys() ?? []);
  const input = convertBatch(preservedInput, "input", referenceState, inlinedReferences);
  const output = convertBatch(preservedOutput, "output", referenceState, inlinedReferences);
  const inlineInputs = convertBatch(inlineInput, "input", referenceState, allReferences);
  const inlineOutputs = convertBatch(inlineOutput, "output", referenceState, allReferences);
  const convertedMembers = { ...input.schemas, ...output.schemas, ...inlineInputs.schemas, ...inlineOutputs.schemas };
  const requiredMembers = new Set([
    ...input.requiredSchemas,
    ...output.requiredSchemas,
    ...inlineInputs.requiredSchemas,
    ...inlineOutputs.requiredSchemas,
  ]);
  const conflictWarnings = collectReferenceConflictWarnings(
    [...preservedInput, ...preservedOutput],
    inlinedReferences,
    referenceState,
  );
  const mapped = mapProjectionGroups(prepared.groups, convertedMembers);

  return {
    schemas: mapped.schemas,
    components: { ...input.components, ...output.components },
    requiredSchemas: requiredProjectionGroups(prepared.groups, requiredMembers, mapped.schemas),
    referenceDirectionConflicts,
    warnings: [
      ...remapWarnings(
        [
          ...input.warnings,
          ...output.warnings,
          ...inlineInputs.warnings,
          ...inlineOutputs.warnings,
          ...conflictWarnings,
        ],
        prepared.originalKeys,
      ),
      ...mapped.warnings,
    ],
  };
}

function prepareProjections(entries: readonly RequestedProjectionEntry[]): PreparedProjections {
  const prepared: ProjectionEntry[] = [];
  const groups: ProjectionGroup[] = [];
  const originalKeys = new Map<string, string>();
  let memberIndex = 0;

  for (const [key, projection] of entries) {
    const mode = projection.mode ?? "full";
    const memberKeys = projection.schemas.map((schema) => {
      const memberKey = String(memberIndex++);
      prepared.push([
        memberKey,
        {
          schema,
          io: projection.io,
          ...(projection.referenceMode === undefined ? {} : { referenceMode: projection.referenceMode }),
        },
      ]);
      originalKeys.set(memberKey, key);
      return memberKey;
    });
    groups.push({ key, memberKeys, mode });
  }

  return { entries: prepared, groups, originalKeys };
}

function mapProjectionGroups(
  groups: readonly ProjectionGroup[],
  members: Readonly<Record<string, ZodJsonSchema>>,
): MappedProjectionGroups {
  const schemas: Partial<Record<string, ZodJsonSchema>> = {};
  const warnings: ZodJsonSchemaWarning[] = [];
  for (const group of groups) {
    const converted = group.memberKeys.flatMap((key) => (members[key] === undefined ? [] : [members[key]]));
    if (converted.length === 0) continue;
    if (group.mode === "full") {
      schemas[group.key] = mapFullProjection(converted);
      continue;
    }

    const flat = mapFlatProjection(group.key, converted, group.mode === "flat-array");
    if (flat.schema !== undefined) schemas[group.key] = flat.schema;
    warnings.push(...flat.warnings);
  }
  return { schemas, warnings };
}

function mapFullProjection(members: readonly ZodJsonSchema[]): ZodJsonSchema {
  const mapped: ZodJsonSchema[] = [];
  let objects: ZodJsonSchema[] = [];

  function flushObjects(): void {
    if (objects.length === 1) mapped.push(objects[0]!);
    else if (objects.length > 1) mapped.push(mergeJsonObjectSchemas(objects));
    objects = [];
  }

  for (const member of members) {
    if (jsonObjectProperties(member) === undefined) {
      flushObjects();
      mapped.push(member);
    } else {
      objects.push(member);
    }
  }
  flushObjects();

  return mapped.length === 1 ? mapped[0]! : { allOf: mapped };
}

function mapFlatProjection(
  key: string,
  members: readonly ZodJsonSchema[],
  arrays: boolean,
): { readonly schema?: ZodJsonSchema; readonly warnings: ZodJsonSchemaWarning[] } {
  if (members.some((schema) => !fixedJsonObjectSchema(schema))) {
    return {
      warnings: [
        {
          schema: key,
          reason: "unsupported-schema-group",
          message: "Every converted schema must describe an object with a fixed property list.",
        },
      ],
    };
  }

  const merged = mergeJsonObjectSchemas(members);
  const properties = jsonObjectProperties(merged)!;
  const requiredProperties = new Set(jsonRequiredProperties(merged));
  const supportedProperties: Record<string, unknown> = {};
  const warnings: ZodJsonSchemaWarning[] = [];

  for (const [property, schema] of Object.entries(properties)) {
    if (flatJsonSchemaSupported(schema, arrays)) {
      supportedProperties[property] = schema;
    } else {
      requiredProperties.delete(property);
      warnings.push({
        schema: key,
        property,
        reason: "unsupported-schema-property",
        message: arrays
          ? `Property ${JSON.stringify(property)} is not a scalar or an array or tuple of scalars.`
          : `Property ${JSON.stringify(property)} is not a scalar.`,
      });
    }
  }

  const required = Object.keys(supportedProperties).filter((property) => requiredProperties.has(property));
  const schema: ZodJsonSchema = { ...merged, properties: supportedProperties };
  if (required.length === 0) delete schema.required;
  else schema.required = required;
  return { schema, warnings };
}

function mergeJsonObjectSchemas(schemas: readonly ZodJsonSchema[]): ZodJsonSchema {
  const merged: ZodJsonSchema = {};
  const properties: Record<string, unknown> = {};
  const required = new Set<string>();
  let hasProperties = false;

  for (const schema of schemas) {
    const { properties: currentProperties, required: currentRequired, additionalProperties, ...annotations } = schema;
    Object.assign(merged, annotations);
    if (additionalProperties === undefined) delete merged.additionalProperties;
    else merged.additionalProperties = additionalProperties;

    const objectProperties = isSchemaRecord(currentProperties) ? currentProperties : {};
    hasProperties ||= currentProperties !== undefined;
    const requiredProperties = new Set(jsonRequiredProperties({ required: currentRequired }));
    for (const [property, value] of Object.entries(objectProperties)) {
      properties[property] = value;
      if (requiredProperties.has(property)) required.add(property);
      else required.delete(property);
    }
  }

  if (hasProperties) merged.properties = properties;
  const requiredList = Object.keys(properties).filter((property) => required.has(property));
  if (requiredList.length > 0) merged.required = requiredList;
  return merged;
}

function fixedJsonObjectSchema(schema: ZodJsonSchema): boolean {
  return (
    jsonObjectProperties(schema) !== undefined &&
    (schema.additionalProperties === undefined || schema.additionalProperties === false)
  );
}

function jsonObjectProperties(schema: ZodJsonSchema): Record<string, unknown> | undefined {
  if (schema.type !== "object") return undefined;
  if (schema.properties === undefined) return {};
  return isSchemaRecord(schema.properties) ? schema.properties : undefined;
}

function jsonRequiredProperties(schema: ZodJsonSchema): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((property): property is string => typeof property === "string")
    : [];
}

function flatJsonSchemaSupported(
  value: unknown,
  arrays: boolean,
  active: Set<ZodJsonSchema> = new Set(),
): boolean {
  if (!isSchemaRecord(value) || active.has(value)) return false;
  active.add(value);

  let supported = scalarJsonSchema(value, active);
  if (!supported && arrays && value.type === "array") {
    const prefixItems = value.prefixItems;
    const items = value.items;
    supported =
      (prefixItems === undefined ||
        (Array.isArray(prefixItems) && prefixItems.every((item) => flatJsonSchemaSupported(item, false, active)))) &&
      (items === undefined || items === false || flatJsonSchemaSupported(items, false, active));
  }
  if (!supported) supported = combinedJsonSchemaSupported(value, arrays, active);

  active.delete(value);
  return supported;
}

function scalarJsonSchema(schema: ZodJsonSchema, active: Set<ZodJsonSchema>): boolean {
  const scalarTypes = new Set(["boolean", "integer", "null", "number", "string"]);
  const type = schema.type;
  if (typeof type === "string") return scalarTypes.has(type);
  if (Array.isArray(type) && type.length > 0) {
    return type.every((item) => typeof item === "string" && scalarTypes.has(item));
  }
  if (Object.hasOwn(schema, "const")) return jsonScalar(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum.every(jsonScalar);
  return combinedJsonSchemaSupported(schema, false, active);
}

function combinedJsonSchemaSupported(
  schema: ZodJsonSchema,
  arrays: boolean,
  active: Set<ZodJsonSchema>,
): boolean {
  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    const members = schema[keyword];
    if (Array.isArray(members) && members.length > 0) {
      return members.every((member) => flatJsonSchemaSupported(member, arrays, active));
    }
  }
  return false;
}

function jsonScalar(value: unknown): boolean {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

function requiredProjectionGroups(
  groups: readonly ProjectionGroup[],
  requiredMembers: ReadonlySet<string>,
  schemas: Readonly<Partial<Record<string, ZodJsonSchema>>>,
): ReadonlySet<string> {
  return new Set(
    groups
      .filter(
        ({ key, memberKeys }) => Object.hasOwn(schemas, key) && memberKeys.some((member) => requiredMembers.has(member)),
      )
      .map(({ key }) => key),
  );
}

function remapWarnings(
  warnings: readonly ZodJsonSchemaWarning[],
  originalKeys: ReadonlyMap<string, string>,
): ZodJsonSchemaWarning[] {
  return warnings.map((warning) => ({ ...warning, schema: originalKeys.get(warning.schema) ?? warning.schema }));
}

function selectEntries(
  entries: readonly ProjectionEntry[],
  io: ZodJsonSchemaIo,
  referenceMode: ZodJsonSchemaReferenceMode,
): ProjectionEntry[] {
  return entries.filter(
    ([, projection]) => projection.io === io && (projection.referenceMode ?? "preserve") === referenceMode,
  );
}

function convertBatch(
  entries: readonly ProjectionEntry[],
  io: ZodJsonSchemaIo,
  referenceState?: ZodReferenceRegistry,
  inlinedReferences: ReadonlySet<string> = new Set(),
): ConvertedBatch {
  if (entries.length === 0) return { schemas: {}, components: {}, requiredSchemas: new Set(), warnings: [] };

  const issues = new WeakMap<ZodType<any, any>, ConversionIssue[]>();
  const shape = Object.fromEntries(entries.map(([key, projection]) => [key, projection.schema]));
  const converted = z.toJSONSchema(z.object(shape), {
    io,
    metadata: referenceState
      ? metadataRegistryForBatch(referenceState, inlinedReferences)
      : z.registry<Record<string, unknown>>(),
    target: "draft-2020-12",
    unrepresentable: "any",
    cycles: "ref",
    reused: "inline",
    override: createJsonSchemaOverride(io, (schema, issue) => {
      const source = schema as ZodType<any, any>;
      const referenceName = referenceState?.schemas.get(source);
      const reported = referenceName === undefined ? issue : { ...issue, referenceName };
      const schemaIssues = issues.get(source);
      if (schemaIssues === undefined) issues.set(source, [reported]);
      else schemaIssues.push(reported);
    }),
  }) as ZodJsonSchema;
  const properties = asSchemaRecord(converted.properties);
  const definitions = asSchemaRecord(converted.$defs);
  const components: Record<string, ZodJsonSchema> = {};
  const componentNames = new Set<string>();
  const required = new Set(
    Array.isArray(converted.required) ? converted.required.filter((key): key is string => typeof key === "string") : [],
  );
  const requiredSchemas = new Set<string>();
  const warnings: ZodJsonSchemaWarning[] = [];

  if (referenceState !== undefined) {
    for (const name of referenceState.names.keys()) {
      if (inlinedReferences.has(name) || !Object.hasOwn(definitions, name)) continue;
      componentNames.add(name);
    }
  }

  const schemas: Record<string, ZodJsonSchema> = {};
  for (const [key, projection] of entries) {
    const schema = properties[key];
    if (schema === undefined) {
      throw new TypeError(`Zod did not emit the requested schema projection ${JSON.stringify(key)}.`);
    }
    const schemaIssues = collectConversionIssues(projection.schema, schema, io, definitions, componentNames, issues);
    warnings.push(...schemaIssues.map((issue) => ({ schema: key, ...issue })));
    if (schemaIssues.some((issue) => issue.reason === "unrepresentable")) continue;
    schemas[key] = embedJsonSchema(schema, false);
    if (required.has(key)) requiredSchemas.add(key);
  }

  for (const name of componentNames) {
    const definition = definitions[name]!;
    const source = referenceState?.names.get(name);
    const componentIssues = collectConversionIssues(source, definition, io, definitions, componentNames, issues);
    if (componentIssues.some((issue) => issue.reason === "unrepresentable")) continue;
    components[name] = embedJsonSchema(definition, true);
  }

  return { schemas, components, requiredSchemas, warnings };
}

function collectReferenceConflictWarnings(
  entries: readonly ProjectionEntry[],
  conflicts: ReadonlySet<string>,
  references: ZodReferenceRegistry | undefined,
): ZodJsonSchemaWarning[] {
  if (references === undefined || conflicts.size === 0) return [];
  const warnings: ZodJsonSchemaWarning[] = [];

  for (const [key, projection] of entries) {
    const reached = new Set<string>();
    visitZodSchema(projection.schema, projection.io, (schema) => {
      const name = references.schemas.get(schema);
      if (name !== undefined && conflicts.has(name)) reached.add(name);
    });
    for (const referenceName of reached) {
      warnings.push({
        schema: key,
        reason: "reference-direction-conflict",
        referenceName,
        message: `Reference ${JSON.stringify(referenceName)} is used for both input and output and was inlined.`,
      });
    }
  }

  return warnings;
}

function collectConversionIssues(
  source: ZodType<any, any> | undefined,
  schema: ZodJsonSchema,
  io: ZodJsonSchemaIo,
  definitions: Readonly<Record<string, ZodJsonSchema>>,
  componentNames: ReadonlySet<string>,
  issues: WeakMap<ZodType<any, any>, ConversionIssue[]>,
): ConversionIssue[] {
  const collected = new Map<string, ConversionIssue>();
  if (source !== undefined) {
    visitZodSchema(source, io, (current) => {
      for (const issue of issues.get(current) ?? []) collected.set(conversionIssueKey(issue), issue);
    });
  }

  const visited = new Set<ZodJsonSchema>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isSchemaRecord(value) || visited.has(value)) return;
    visited.add(value);

    const reference = value.$ref;
    if (typeof reference === "string" && reference.startsWith(componentReferencePrefix)) {
      const name = reference.slice(componentReferencePrefix.length);
      const definition = definitions[name];
      if (definition !== undefined) {
        if (!componentNames.has(name)) {
          const error = new ZodSchemaConversionError(
            "unrepresentable",
            "Unnamed recursive or reused schemas cannot be embedded in the JSON Schema result.",
          );
          collected.set(`${error.reason}\0${error.message}`, {
            reason: error.reason,
            message: error.message,
          });
        }
        visit(definition);
      }
    }

    for (const item of Object.values(value)) visit(item);
  }

  visit(schema);
  return [...collected.values()];
}

function conversionIssueKey(issue: ConversionIssue): string {
  return `${issue.reason}\0${"referenceName" in issue ? (issue.referenceName ?? "") : ""}\0${issue.message}`;
}

function metadataRegistryForBatch(
  references: ZodReferenceRegistry,
  inlinedReferences: ReadonlySet<string>,
): z.core.$ZodRegistry<Record<string, unknown>> {
  if (inlinedReferences.size === 0) return references.registry;
  return {
    get(schema: z.core.$ZodType) {
      const metadata = references.registry.get(schema);
      const name = references.schemas.get(schema as ZodType<any, any>);
      if (metadata === undefined || name === undefined || !inlinedReferences.has(name)) return metadata;
      const { id: _, ...withoutId } = metadata;
      return withoutId;
    },
  } as z.core.$ZodRegistry<Record<string, unknown>>;
}

function createJsonSchemaOverride(
  io: ZodJsonSchemaIo,
  reportIssue: (schema: ZodType<any, any>, issue: ConversionIssue) => void,
) {
  return ({ zodSchema, jsonSchema }: { zodSchema: z.core.$ZodTypes; jsonSchema: ZodJsonSchema }) => {
    const source = zodSchema as unknown as ZodType<any, any>;
    if (zodSchema instanceof z.ZodDate) {
      if (io === "input") {
        jsonSchema.anyOf = [
          { type: "string", format: "date" },
          { type: "string", format: "date-time" },
        ];
      } else {
        jsonSchema.type = "string";
        jsonSchema.format = "date-time";
      }
      const bounds = dateBoundsDescription(zodSchema);
      if (bounds !== undefined) {
        appendJsonSchemaDescription(jsonSchema, bounds);
        reportIssue(source, {
          reason: "bounded-date",
          message:
            "A bounded Zod date was represented as an ISO string; its runtime bounds are documented in the description.",
        });
      }
      return;
    }

    if (zodSchema instanceof z.ZodBigInt) {
      jsonSchema.type = "number";
      appendJsonSchemaDescription(
        jsonSchema,
        "Runtime values are JavaScript bigint values represented as JSON numbers. Values outside the safe integer range may lose precision.",
      );
      reportIssue(source, { reason: "bigint", message: "A Zod bigint was represented as a JSON number." });
      return;
    }

    if (zodSchema instanceof z.ZodLiteral && hasNonJsonLiteral(zodSchema)) {
      approximateLiteral(zodSchema, jsonSchema);
      reportIssue(source, {
        reason: "non-json-literal",
        message: "A Zod literal containing a non-JSON value was represented by its closest JSON value.",
      });
      return;
    }

    const type = zodSchema._zod.def.type;
    const message = unrepresentableMessages[type];
    if (message !== undefined) {
      const cause = new Error(message);
      const error = new ZodSchemaConversionError("unrepresentable", cause.message, { cause });
      replaceSchema(jsonSchema, {});
      reportIssue(source, { reason: error.reason, message: error.message, cause: error.cause });
      return;
    }
    if (Object.keys(jsonSchema).length === 0 && !emptySchemaTypes.has(type)) {
      const cause = new Error(`Zod schema type ${JSON.stringify(type)} produced no JSON Schema.`);
      const error = new ZodSchemaConversionError("unrepresentable", cause.message, { cause });
      reportIssue(source, { reason: error.reason, message: error.message, cause: error.cause });
    }
  };
}

function dateBoundsDescription(schema: z.ZodDate): string | undefined {
  const bounds: string[] = [];
  for (const check of schema.def.checks ?? []) {
    const definition = check._zod.def as {
      readonly check: string;
      readonly value?: unknown;
      readonly inclusive?: boolean;
    };
    if (definition.check !== "greater_than" && definition.check !== "less_than") continue;
    if (!(definition.value instanceof Date)) continue;
    const comparison =
      definition.check === "greater_than"
        ? definition.inclusive
          ? "on or after"
          : "after"
        : definition.inclusive
          ? "on or before"
          : "before";
    bounds.push(`${comparison} ${definition.value.toISOString()}`);
  }
  return bounds.length === 0 ? undefined : `Runtime date constraint: the value must be ${bounds.join(" and ")}.`;
}

function hasNonJsonLiteral(schema: z.ZodLiteral): boolean {
  return [...schema.values].some((value) => value === undefined || typeof value === "bigint");
}

function approximateLiteral(schema: z.ZodLiteral, jsonSchema: ZodJsonSchema): void {
  const runtimeValues = [...schema.values];
  const jsonValues = runtimeValues.map(closestJsonLiteral);
  const types = [...new Set(jsonValues.map(jsonLiteralType))];
  jsonSchema.type = types.length === 1 ? types[0] : types;
  delete jsonSchema.const;
  delete jsonSchema.enum;
  if (jsonValues.length === 1) jsonSchema.const = jsonValues[0];
  else jsonSchema.enum = jsonValues;

  const mappings = runtimeValues
    .map((value, index) => `${formatRuntimeLiteral(value)} as ${JSON.stringify(jsonValues[index])}`)
    .join(", ");
  appendJsonSchemaDescription(jsonSchema, `Runtime literal representation: ${mappings}.`);
}

function closestJsonLiteral(value: unknown): string | number | boolean | null {
  if (value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  return value as string | number | boolean | null;
}

function jsonLiteralType(value: string | number | boolean | null): string {
  return value === null ? "null" : typeof value;
}

function formatRuntimeLiteral(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return `${value}n`;
  return JSON.stringify(value);
}

function replaceSchema(target: ZodJsonSchema, replacement: ZodJsonSchema): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, replacement);
}

function embedJsonSchema(schema: ZodJsonSchema, component: boolean): ZodJsonSchema {
  const cleaned = rewriteReferences(schema) as ZodJsonSchema;
  if (component) delete cleaned.id;
  return cleaned;
}

function rewriteReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteReferences);
  if (!isSchemaRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "$ref" && typeof item === "string" && item.startsWith(componentReferencePrefix)) {
        return [key, `#/components/schemas/${item.slice(componentReferencePrefix.length)}`];
      }
      return [key, rewriteReferences(item)];
    }),
  );
}

function asSchemaRecord(value: unknown): Record<string, ZodJsonSchema> {
  if (!isSchemaRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, ZodJsonSchema] => isSchemaRecord(entry[1])),
  );
}

function isSchemaRecord(value: unknown): value is ZodJsonSchema {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function visitZodSchema(
  root: ZodType<any, any>,
  io: ZodJsonSchemaIo,
  visit: (schema: ZodType<any, any>) => void,
): void {
  const visited = new Set<ZodType<any, any>>();

  function walk(schema: ZodType<any, any>): void {
    if (visited.has(schema)) return;
    visited.add(schema);
    visit(schema);

    const definition = schema.def as unknown as Record<string, unknown>;
    if (definition.type === "pipe") {
      const input = definition.in as ZodType<any, any>;
      const output = definition.out as ZodType<any, any>;
      const inputIsTransform = input._zod.traits.has("$ZodTransform");
      walk(io === "input" ? (inputIsTransform ? output : input) : output);
      return;
    }

    function walkValue(value: unknown): void {
      if (value instanceof z.ZodType) {
        walk(value);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) walkValue(item);
        return;
      }
      if (!isSchemaRecord(value)) return;
      for (const item of Object.values(value)) walkValue(item);
    }

    for (const [key, value] of Object.entries(definition)) {
      if (key !== "checks") walkValue(value);
    }
    if (definition.type === "lazy") walk((definition.getter as () => ZodType<any, any>)());
  }

  walk(root);
}

function collectReachableReferences(
  entries: readonly ProjectionEntry[],
  io: ZodJsonSchemaIo,
  state: ZodReferenceRegistry | undefined,
): Set<string> {
  const names = new Set<string>();
  if (state === undefined) return names;
  for (const [, projection] of entries) {
    visitZodSchema(projection.schema, io, (schema) => {
      const name = state.schemas.get(schema);
      if (name !== undefined) names.add(name);
    });
  }
  return names;
}
