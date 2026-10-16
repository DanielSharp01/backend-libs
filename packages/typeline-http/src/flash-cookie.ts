import type { Merge } from "@danielsharp/common";
import { z, type output, type ZodType } from "zod";

import type { HttpCookieOptions } from "./response";
import type { HttpContext } from "./router";
import { validateCookies } from "./validate";

export type FlashCookieOptions = Omit<HttpCookieOptions, "expires" | "maxAge"> & { maxAge: number };

/**
 * A cookie read once: one request sets it, and the request that takes it clears it whether or not
 * the value is valid. The schema decides what a missing or malformed value means, e.g.
 * `.optional().catch(undefined)` to treat both as absent.
 */
export function flashCookie<TName extends string, TSchema extends ZodType<unknown, string | undefined>>(
  name: TName,
  schema: TSchema,
  options: FlashCookieOptions,
) {
  const validator = validateCookies(z.object({ [name]: schema }));
  const clearOptions = clearCookieOptions(options);

  return {
    set(value: string, context: HttpContext): void {
      context.res.cookie(name, value, options);
    },
    take<TInput extends object, TKey extends string>(key: TKey) {
      return {
        metadata: validator.metadata,
        async mw(input: TInput, context: HttpContext): Promise<Merge<TInput, Record<TKey, output<TSchema>>>> {
          context.res.clearCookie(name, clearOptions);
          const { cookies } = await validator.mw({}, context);
          return { ...input, [key]: cookies[name] } as Merge<TInput, Record<TKey, output<TSchema>>>;
        },
      };
    },
  };
}

function clearCookieOptions({
  domain,
  partitioned,
  path,
  secure,
}: FlashCookieOptions): Pick<HttpCookieOptions, "domain" | "partitioned" | "path" | "secure"> {
  return {
    ...(domain === undefined ? {} : { domain }),
    ...(partitioned === undefined ? {} : { partitioned }),
    ...(path === undefined ? {} : { path }),
    ...(secure === undefined ? {} : { secure }),
  };
}
