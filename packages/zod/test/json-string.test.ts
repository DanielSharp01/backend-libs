import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { zodJsonString } from "../src/json-string";

const pkce = zodJsonString(z.object({ codeVerifier: z.string(), nonce: z.string() }));

describe("zodJsonString", () => {
  it("parses a JSON string and validates it", () => {
    expect(pkce.parse('{"codeVerifier":"v","nonce":"n"}')).toEqual({ codeVerifier: "v", nonce: "n" });
  });

  it("reports malformed JSON as a validation issue", () => {
    const result = pkce.safeParse("{not json");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Invalid JSON");
  });

  it("reports JSON that doesn't match the schema", () => {
    expect(pkce.safeParse('{"codeVerifier":"v"}').success).toBe(false);
  });

  it("lets .catch() recover from malformed JSON", () => {
    expect(pkce.optional().catch(undefined).parse("{not json")).toBeUndefined();
  });

  it("takes a string and outputs the schema's type", () => {
    expectTypeOf<z.input<typeof pkce>>().toEqualTypeOf<string>();
    expectTypeOf<z.output<typeof pkce>>().toEqualTypeOf<{ codeVerifier: string; nonce: string }>();
  });
});
