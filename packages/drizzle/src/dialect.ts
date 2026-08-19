import { sql, type SQLWrapper } from "drizzle-orm";

const likeStrategies = {
  standardExplicit: {
    escape: (value: string) => value.replace(/[!%_]/g, (character) => `!${character}`),
    like: (expression: SQLWrapper, pattern: string) => sql`${expression} LIKE ${pattern} ESCAPE '!'`,
    notLike: (expression: SQLWrapper, pattern: string) => sql`${expression} NOT LIKE ${pattern} ESCAPE '!'`,
  },
  backslash: {
    escape: (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`),
    like: (expression: SQLWrapper, pattern: string) => sql`${expression} LIKE ${pattern}`,
    notLike: (expression: SQLWrapper, pattern: string) => sql`${expression} NOT LIKE ${pattern}`,
  },
};

export type SqlDialect = "postgresql" | "mysql" | "sqlite" | "singlestore";

export function getLikeStrategy(dialect: SqlDialect) {
  switch (dialect) {
    case "postgresql":
    case "mysql":
    case "sqlite":
      return likeStrategies.standardExplicit;
    case "singlestore":
      return likeStrategies.backslash;
    default:
      throw new TypeError(`Unsupported dialect: ${dialect}`);
  }
}
