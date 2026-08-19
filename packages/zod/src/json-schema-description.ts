export function appendJsonSchemaDescription(schema: Record<string, unknown>, addition: string): void {
  const description = schema.description;
  schema.description =
    typeof description === "string" && description.length > 0 ? `${description}\n\n${addition}` : addition;
}
