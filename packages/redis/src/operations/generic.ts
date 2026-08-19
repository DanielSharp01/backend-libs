import type { RedisClientType } from "redis";

import { createTransactionQueue, type RedisTransactionOperations } from "../transaction";
import type { RedisTransaction } from "../transaction";
import {
  booleanReply,
  keysArgument,
  scopedKey,
  scopedPattern,
  ttlReply,
  unscopedKey,
  type RedisExpiry,
  type RedisOperationOptions,
  type TupleArg,
} from "../utils";

export type ExpireCondition = "NX" | "XX" | "GT" | "LT";
export type { RedisExpiry } from "../utils";

export type ScanCursor = string;

export interface ScanPage<T> {
  cursor: ScanCursor;
  items: T[];
}

export interface ScanCommonOptions {
  match?: string;
  count?: number;
}

export interface ScanOptions extends ScanCommonOptions {
  type?: "string" | "hash" | "list" | "set" | "zset" | "stream";
}

export interface RedisGenericConnection {
  del(keys: TupleArg<string>): Promise<void>;

  keys(pattern: string): Promise<Array<string & string>>;
  scan(cursor: ScanCursor, opts?: ScanOptions): Promise<ScanPage<string & string>>;

  exists<KArg extends TupleArg<string>>(keys: KArg): Promise<KArg extends readonly unknown[] ? number : boolean>;

  ttl(key: string): Promise<RedisExpiry>;
  pTtl(key: string): Promise<RedisExpiry>;
  expireTime(key: string): Promise<RedisExpiry>;
  pExpireTime(key: string): Promise<RedisExpiry>;

  persist(key: string): Promise<boolean>;
  expire(key: string, seconds: number, condition?: ExpireCondition): Promise<boolean>;
  pExpire(key: string, milliseconds: number, condition?: ExpireCondition): Promise<boolean>;
  expireAt(key: string, timestampS: number, condition?: ExpireCondition): Promise<boolean>;
  pExpireAt(key: string, timestampMs: number, condition?: ExpireCondition): Promise<boolean>;
}

export type RedisGenericTransaction<Output extends readonly unknown[] = []> = {
  [Key in keyof RedisGenericConnection]: (
    ...params: Parameters<RedisGenericConnection[Key]>
  ) => RedisTransaction<[...Output, Awaited<ReturnType<RedisGenericConnection[Key]>>]>;
};

export type RedisGenericClient = Pick<
  RedisClientType,
  | "del"
  | "keys"
  | "scan"
  | "exists"
  | "ttl"
  | "pTTL"
  | "expireTime"
  | "pExpireTime"
  | "persist"
  | "expire"
  | "pExpire"
  | "expireAt"
  | "pExpireAt"
>;

type ClientScanOptions = NonNullable<Parameters<RedisClientType["scan"]>[1]>;

function clientScanOptions(opts: ScanOptions | undefined, scope?: string): ClientScanOptions | undefined {
  if (opts === undefined && scope === undefined) {
    return undefined;
  }

  const result: ClientScanOptions = {};

  if (opts?.match !== undefined || scope !== undefined) {
    result.MATCH = scopedPattern(opts?.match ?? "*", scope);
  }

  if (opts?.count !== undefined) {
    result.COUNT = opts.count;
  }

  if (opts?.type !== undefined) {
    result.TYPE = opts.type;
  }

  return result;
}

export function connectionGeneric(
  client: RedisGenericClient,
  options: Pick<RedisOperationOptions, "scope"> = {},
): RedisGenericConnection {
  const { scope } = options;

  return {
    async del(keys) {
      await client.del(keysArgument(keys, scope));
    },

    async keys(pattern) {
      return (await client.keys(scopedPattern(pattern, scope))).map((key) => unscopedKey(key, scope)) as Array<
        string & string
      >;
    },

    async scan(cursor, opts) {
      const page = await client.scan(cursor, clientScanOptions(opts, scope));
      return {
        cursor: page.cursor,
        items: page.keys.map((key) => unscopedKey(key, scope)) as Array<string & string>,
      };
    },

    async exists<KArg extends TupleArg<string>>(keys: KArg) {
      const count = await client.exists(keysArgument(keys, scope));
      return (Array.isArray(keys) ? count : booleanReply(count)) as KArg extends readonly unknown[] ? number : boolean;
    },

    async ttl(key) {
      return ttlReply(await client.ttl(scopedKey(key, scope)));
    },

    async pTtl(key) {
      return ttlReply(await client.pTTL(scopedKey(key, scope)));
    },

    async expireTime(key) {
      return ttlReply(await client.expireTime(scopedKey(key, scope)));
    },

    async pExpireTime(key) {
      return ttlReply(await client.pExpireTime(scopedKey(key, scope)));
    },

    async persist(key) {
      return booleanReply(await client.persist(scopedKey(key, scope)));
    },

    async expire(key, seconds, condition) {
      return booleanReply(await client.expire(scopedKey(key, scope), seconds, condition));
    },

    async pExpire(key, milliseconds, condition) {
      return booleanReply(await client.pExpire(scopedKey(key, scope), milliseconds, condition));
    },

    async expireAt(key, timestampS, condition) {
      return booleanReply(await client.expireAt(scopedKey(key, scope), timestampS, condition));
    },

    async pExpireAt(key, timestampMs, condition) {
      return booleanReply(await client.pExpireAt(scopedKey(key, scope), timestampMs, condition));
    },
  };
}

export function transactionGeneric<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  options: Pick<RedisOperationOptions, "scope"> = {},
): RedisGenericTransaction<Output> {
  const { scope } = options;
  const queue = createTransactionQueue(operations);

  return {
    del(keys: TupleArg<string>) {
      return queue(
        this,
        (transaction) => {
          transaction.del(keysArgument(keys, scope));
        },
        () => undefined,
      );
    },

    keys(pattern: string) {
      return queue(
        this,
        (transaction) => {
          transaction.keys(scopedPattern(pattern, scope));
        },
        (reply) => (reply as string[]).map((key) => unscopedKey(key, scope)),
      );
    },

    scan(cursor: ScanCursor, opts?: ScanOptions) {
      return queue(
        this,
        (transaction) => {
          transaction.scan(cursor, clientScanOptions(opts, scope));
        },
        (reply) => {
          const page = reply as Awaited<ReturnType<RedisClientType["scan"]>>;
          return {
            cursor: page.cursor,
            items: page.keys.map((key) => unscopedKey(key, scope)),
          };
        },
      );
    },

    exists(keys: TupleArg<string>) {
      const multiple = Array.isArray(keys);
      return queue(
        this,
        (transaction) => {
          transaction.exists(keysArgument(keys, scope));
        },
        (reply) => (multiple ? (reply as number) : booleanReply(reply as number)),
      );
    },

    ttl(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.ttl(scopedKey(key, scope));
        },
        (reply) => ttlReply(reply as number),
      );
    },

    pTtl(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.pTTL(scopedKey(key, scope));
        },
        (reply) => ttlReply(reply as number),
      );
    },

    expireTime(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.expireTime(scopedKey(key, scope));
        },
        (reply) => ttlReply(reply as number),
      );
    },

    pExpireTime(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.pExpireTime(scopedKey(key, scope));
        },
        (reply) => ttlReply(reply as number),
      );
    },

    persist(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.persist(scopedKey(key, scope));
        },
        (reply) => booleanReply(reply as number),
      );
    },

    expire(key: string, seconds: number, condition?: ExpireCondition) {
      return queue(
        this,
        (transaction) => {
          transaction.expire(scopedKey(key, scope), seconds, condition);
        },
        (reply) => booleanReply(reply as number),
      );
    },

    pExpire(key: string, milliseconds: number, condition?: ExpireCondition) {
      return queue(
        this,
        (transaction) => {
          transaction.pExpire(scopedKey(key, scope), milliseconds, condition);
        },
        (reply) => booleanReply(reply as number),
      );
    },

    expireAt(key: string, timestampS: number, condition?: ExpireCondition) {
      return queue(
        this,
        (transaction) => {
          transaction.expireAt(scopedKey(key, scope), timestampS, condition);
        },
        (reply) => booleanReply(reply as number),
      );
    },

    pExpireAt(key: string, timestampMs: number, condition?: ExpireCondition) {
      return queue(
        this,
        (transaction) => {
          transaction.pExpireAt(scopedKey(key, scope), timestampMs, condition);
        },
        (reply) => booleanReply(reply as number),
      );
    },
  } as RedisGenericTransaction<Output>;
}
