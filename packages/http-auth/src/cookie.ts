import type { HttpContext, HttpCookieOptions, HttpMetadata } from "@danielsharp/typeline-http";
import { validateCookies } from "@danielsharp/typeline-http";
import { z } from "zod";

export type CookieSchemeOptions = Omit<HttpCookieOptions, "expires" | "maxAge">;

const defaultCookieOptions: CookieSchemeOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: true,
};

export function cookieScheme<TCookieName extends string>(
  cookieName: TCookieName,
  options: CookieSchemeOptions = defaultCookieOptions,
) {
  const validator = validateCookies(z.object({ [cookieName]: z.string().optional() }));
  const metadata = {
    securitySchemes: {
      [cookieName]: { scheme: "cookie", cookieName },
    },
  } satisfies HttpMetadata;

  return {
    metadata,
    async read(context: HttpContext): Promise<string | undefined> {
      const { cookies } = await validator.mw({}, context);
      return cookies[cookieName];
    },
    set(input: { sessionId: string; expiresAt: Date }, context: HttpContext) {
      context.res.cookie(cookieName, input.sessionId, { ...options, expires: input.expiresAt });
    },
    clear(context: HttpContext): void {
      context.res.clearCookie(cookieName, clearCookieOptions(options));
    },
  };
}

function clearCookieOptions({
  domain,
  partitioned,
  path,
  secure,
}: CookieSchemeOptions): Pick<HttpCookieOptions, "domain" | "partitioned" | "path" | "secure"> {
  return {
    ...(domain === undefined ? {} : { domain }),
    ...(partitioned === undefined ? {} : { partitioned }),
    ...(path === undefined ? {} : { path }),
    ...(secure === undefined ? {} : { secure }),
  };
}
