import type { SQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

export function toQuery(expression: SQLWrapper) {
  const { sql, params } = dialect.sqlToQuery(expression.getSQL());
  return { sql, params };
}
