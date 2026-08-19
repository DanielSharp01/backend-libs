import type { HttpContext, HttpMetadata } from "@danielsharp/typeline-http";

export interface BearerTokenSchemeOptions {
  bearerFormat?: string;
  description?: string;
}

const MALFORMED_BEARER_HEADER = Symbol.for("@danielsharp/http-auth/malformed-bearer-header");

export class MalformedBearerHeader extends Error {
  static readonly code = "MALFORMED_BEARER_HEADER";
  readonly code = MalformedBearerHeader.code;
  readonly [MALFORMED_BEARER_HEADER] = true;

  constructor() {
    super("The Authorization header must contain one Bearer token.");
    this.name = "MalformedBearerHeader";
  }

  static is(error: unknown): error is MalformedBearerHeader {
    return (
      typeof error === "object" &&
      error !== null &&
      MALFORMED_BEARER_HEADER in error &&
      error[MALFORMED_BEARER_HEADER] === true
    );
  }
}

export function bearerTokenScheme(schemeName: string, { bearerFormat, description }: BearerTokenSchemeOptions = {}) {
  const metadata = {
    securitySchemes: {
      [schemeName]: {
        scheme: "bearer",
        ...(bearerFormat === undefined ? {} : { bearerFormat }),
        ...(description === undefined ? {} : { description }),
      },
    },
  } satisfies HttpMetadata;

  return {
    metadata,
    read() {
      return async (context: HttpContext): Promise<string | undefined> => {
        const header = context.req.headers.authorization;
        if (header === undefined) return undefined;
        if (Array.isArray(header)) throw new MalformedBearerHeader();

        const match = /^Bearer +([A-Za-z0-9._~+/-]+=*)[ \t]*$/i.exec(header);
        if (match === null) throw new MalformedBearerHeader();
        return match[1];
      };
    },
  };
}
