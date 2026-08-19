export type TupleArg<T> = T | readonly T[];

export type TupleValue<T> = T extends readonly (infer Value)[] ? Value : T;

export type TupleShape<T extends string | readonly string[], V = unknown> = T extends readonly string[]
  ? { -readonly [K in keyof T as T[K] & string]: V }
  : { [key in T & string]: V };

export function tupleArgToArray<T>(value: TupleArg<T>): T[] {
  return Array.isArray(value) ? [...value] : [value as T];
}

export interface RedisOperationOptions {
  scope?: string | undefined;
}

export function combineRedisScope(parent: string | undefined, child: PropertyKey): string {
  return parent === undefined ? String(child) : `${parent}.${String(child)}`;
}

export function scopedKey(key: PropertyKey, scope?: string): string {
  return scope === undefined ? String(key) : `${scope}.${String(key)}`;
}

export function keysArgument(keys: TupleArg<PropertyKey>, scope?: string): string[] {
  return tupleArgToArray(keys).map((key) => scopedKey(key, scope));
}

function escapeRedisGlob(value: string): string {
  return value.replace(/[\\*?\[\]]/g, "\\$&");
}

export function scopedPattern(pattern: string, scope?: string): string {
  return scope === undefined ? pattern : `${escapeRedisGlob(scope)}.${pattern}`;
}

export function unscopedKey(key: string, scope?: string): string {
  if (scope === undefined) {
    return key;
  }

  const prefix = `${scope}.`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

export type RedisExpiry = number | "no-expiry" | null;

export function ttlReply(reply: number): RedisExpiry {
  if (reply === -2) {
    return null;
  }

  return reply === -1 ? "no-expiry" : reply;
}

export function booleanReply(reply: number): boolean {
  return reply !== 0;
}
