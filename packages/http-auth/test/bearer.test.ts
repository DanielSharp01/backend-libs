import type { HttpContext, HttpRequest, HttpResponse } from "@danielsharp/typeline-http";
import { describe, expect, it } from "vitest";

import { bearerTokenScheme, MalformedBearerHeader } from "../src/bearer";

describe("bearerTokenScheme", () => {
  it("is bearer security metadata and reads the Authorization header", async () => {
    const scheme = bearerTokenScheme("accessToken", { bearerFormat: "JWT", description: "Access token" });

    expect(scheme.metadata).toEqual({
      securitySchemes: {
        accessToken: { scheme: "bearer", bearerFormat: "JWT", description: "Access token" },
      },
    });
    await expect(scheme.read(context({ authorization: "bEaReR abc.def-_123" }))).resolves.toBe("abc.def-_123");
  });

  it("leaves a missing header for auth to decide", async () => {
    await expect(bearerTokenScheme("accessToken").read(context())).resolves.toBeUndefined();
  });

  it.each(["Basic credentials", "Bearer", "Bearer first second", "Bearer\ttoken"])(
    "rejects the malformed Authorization header %j",
    async (authorization) => {
      await expect(bearerTokenScheme("accessToken").read(context({ authorization }))).rejects.toBeInstanceOf(
        MalformedBearerHeader,
      );
    },
  );

  it("rejects repeated Authorization values", async () => {
    await expect(
      bearerTokenScheme("accessToken").read(context({ authorization: ["Bearer one", "Bearer two"] })),
    ).rejects.toBeInstanceOf(MalformedBearerHeader);
  });
});

function context(headers: Record<string, string | string[] | undefined> = {}): HttpContext {
  return { req: { headers } as unknown as HttpRequest, res: {} as HttpResponse };
}
