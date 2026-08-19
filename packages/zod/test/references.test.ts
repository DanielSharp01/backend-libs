import { describe, expect, it } from "vitest";
import { z } from "zod";

import { zodReferences } from "../src/references";

describe("Zod references", () => {
  it("registers and returns the original schema", () => {
    const references = zodReferences();
    const schema = z.object({ id: z.string() });

    expect(references.asReference(schema, "User")).toBe(schema);
    expect(references.asReference(schema, "User")).toBe(schema);
    expect(references.registry.get(schema)).toEqual({ id: "User" });
    expect(references.names.get("User")).toBe(schema);
    expect(references.schemas.get(schema)).toBe("User");
    expect(schema.parse({ id: "one" })).toEqual({ id: "one" });
  });

  it("rejects invalid OpenAPI component names", () => {
    const references = zodReferences();

    for (const name of ["", "User Profile", "User/Profile", "ümlaut"]) {
      expect(() => references.asReference(z.string(), name)).toThrow(TypeError);
    }
  });

  it("rejects a name reused for another schema", () => {
    const references = zodReferences();
    references.asReference(z.string(), "Value");

    expect(() => references.asReference(z.number(), "Value")).toThrow(
      'OpenAPI component schema name "Value" is already registered.',
    );
  });

  it("rejects a schema registered under another name", () => {
    const references = zodReferences();
    const schema = z.string();
    references.asReference(schema, "First");

    expect(() => references.asReference(schema, "Second")).toThrow(
      'This Zod schema is already registered as OpenAPI component "First".',
    );
  });
});
