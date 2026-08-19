import type { RedisClientType } from "redis";

import {
  codecs,
  type CodecValue,
  type EntriesCodecInput,
  type EntriesInput,
  type EntriesOf,
  type EntriesShape,
  type RedisEntriesCodec,
} from "../codec";
import { createTransactionQueue, type RedisTransaction, type RedisTransactionOperations } from "../transaction";
import {
  booleanReply,
  scopedKey,
  ttlReply,
  tupleArgToArray,
  type RedisExpiry,
  type RedisOperationOptions,
  type TupleArg,
  type TupleShape,
} from "../utils";
import type { ExpireCondition, ScanCommonOptions, ScanCursor, ScanPage } from "./generic";

export type HashFields<TCodec extends RedisEntriesCodec<any, any>> = keyof EntriesShape<TCodec> & string;
export type HashFieldValue<
  TCodec extends RedisEntriesCodec<any, any>,
  Field extends HashFields<TCodec>,
> = EntriesShape<TCodec>[Field];
export type HashValue<TCodec extends RedisEntriesCodec<any, any>> = EntriesShape<TCodec>[HashFields<TCodec>];
export type HashData<TCodec extends RedisEntriesCodec<any, any>> = CodecValue<TCodec>;
export type HashEntries<TCodec extends RedisEntriesCodec<any, any>> = EntriesCodecInput<TCodec>;
export type HashEntry<TCodec extends RedisEntriesCodec<any, any>> = EntriesOf<TCodec>[number];
export type HashFieldResults<Fields extends TupleArg<string>, Value> = TupleShape<Fields, Value>;

export type HashExpireResult = -2 | 0 | 1 | 2;
export type HashPersistResult = -2 | -1 | 1;

export type HashGetExExpiration =
  | {
      type: "EX" | "PX" | "EXAT" | "PXAT";
      value: number;
    }
  | {
      type: "PERSIST";
    };

export type HashSetExExpiration =
  | {
      type: "EX" | "PX" | "EXAT" | "PXAT";
      value: number;
    }
  | {
      type: "KEEPTTL";
    };

export interface HashSetExOptions {
  condition?: "NX" | "XX";
  fieldCondition?: "FNX" | "FXX";
  expiration?: HashSetExExpiration;
}

export interface HashScanOptions<NoValues extends boolean = false> extends ScanCommonOptions {
  noValues?: NoValues;
}

export type HashRandFieldOptions =
  | {
      count: number;
      withValues?: false;
    }
  | {
      count: number;
      withValues: true;
    };

type StringHashCodec = RedisEntriesCodec<Record<string, string>, Record<string, string>>;

export interface RedisHashConnection {
  hDel<Fields extends TupleArg<string>>(key: string, fields: Fields): Promise<number>;
  hExists(key: string, field: string): Promise<boolean>;
  hGet<
    TCodec extends RedisEntriesCodec<any, any> = StringHashCodec,
    Field extends HashFields<TCodec> = HashFields<TCodec>,
  >(
    key: string,
    field: Field,
    codec?: TCodec,
  ): Promise<HashFieldValue<TCodec, Field> | null>;
  hMGet<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec>(
    key: string,
    fields: TupleArg<HashFields<TCodec>>,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>>;
  hGetAll<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec>(
    key: string,
    codec?: TCodec,
  ): Promise<HashData<TCodec>>;
  hGetDel<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec>(
    key: string,
    fields: TupleArg<HashFields<TCodec>>,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>>;
  hGetEx<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec>(
    key: string,
    fields: TupleArg<HashFields<TCodec>>,
    codec?: TCodec,
    expiration?: HashGetExExpiration,
  ): Promise<CodecValue<TCodec>>;
  hSet<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec>(
    key: string,
    entries: HashEntries<TCodec>,
    codec?: TCodec,
  ): Promise<number>;
  hSetNx<
    TCodec extends RedisEntriesCodec<any, any> = StringHashCodec,
    Field extends HashFields<TCodec> = HashFields<TCodec>,
  >(
    key: string,
    field: Field,
    value: HashFieldValue<TCodec, Field>,
    codec?: TCodec,
  ): Promise<boolean>;
  hSetEx<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec>(
    key: string,
    entries: HashEntries<TCodec>,
    codec?: TCodec,
    opts?: HashSetExOptions,
  ): Promise<boolean>;
  hIncrBy(key: string, field: string, amount: number): Promise<number>;
  hIncrByFloat(key: string, field: string, amount: number): Promise<number>;
  hStrLen(key: string, field: string): Promise<number>;
  hKeys(key: string): Promise<string[]>;
  hLen(key: string): Promise<number>;
  hVals<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec>(
    key: string,
    codec?: TCodec,
  ): Promise<HashValue<TCodec>[]>;
  hRandField<
    TCodec extends RedisEntriesCodec<any, any> = StringHashCodec,
    Options extends HashRandFieldOptions | undefined = undefined,
  >(
    key: string,
    codec?: TCodec,
    opts?: Options,
  ): Promise<
    Options extends { withValues: true }
      ? HashEntry<TCodec>[]
      : Options extends { count: number }
        ? string[]
        : string | null
  >;
  hScan<TCodec extends RedisEntriesCodec<any, any> = StringHashCodec, NoValues extends boolean = false>(
    key: string,
    cursor: ScanCursor,
    codec?: TCodec,
    opts?: HashScanOptions<NoValues>,
  ): Promise<ScanPage<NoValues extends true ? string : HashEntry<TCodec>>>;
  hExpire<Fields extends TupleArg<string>>(
    key: string,
    seconds: number,
    fields: Fields,
    condition?: ExpireCondition,
  ): Promise<HashFieldResults<Fields, HashExpireResult>>;
  hPExpire<Fields extends TupleArg<string>>(
    key: string,
    milliseconds: number,
    fields: Fields,
    condition?: ExpireCondition,
  ): Promise<HashFieldResults<Fields, HashExpireResult>>;
  hExpireAt<Fields extends TupleArg<string>>(
    key: string,
    timestampS: number,
    fields: Fields,
    condition?: ExpireCondition,
  ): Promise<HashFieldResults<Fields, HashExpireResult>>;
  hPExpireAt<Fields extends TupleArg<string>>(
    key: string,
    timestampMs: number,
    fields: Fields,
    condition?: ExpireCondition,
  ): Promise<HashFieldResults<Fields, HashExpireResult>>;
  hPersist<Fields extends TupleArg<string>>(
    key: string,
    fields: Fields,
  ): Promise<HashFieldResults<Fields, HashPersistResult>>;
  hTtl<Fields extends TupleArg<string>>(key: string, fields: Fields): Promise<HashFieldResults<Fields, RedisExpiry>>;
  hPTtl<Fields extends TupleArg<string>>(key: string, fields: Fields): Promise<HashFieldResults<Fields, RedisExpiry>>;
  hExpireTime<Fields extends TupleArg<string>>(
    key: string,
    fields: Fields,
  ): Promise<HashFieldResults<Fields, RedisExpiry>>;
  hPExpireTime<Fields extends TupleArg<string>>(
    key: string,
    fields: Fields,
  ): Promise<HashFieldResults<Fields, RedisExpiry>>;
}

export type RedisHashTransaction<Output extends readonly unknown[] = []> = {
  [Key in keyof RedisHashConnection]: (
    ...params: Parameters<RedisHashConnection[Key]>
  ) => RedisTransaction<[...Output, Awaited<ReturnType<RedisHashConnection[Key]>>]>;
};

export type RedisHashClient = Pick<
  RedisClientType,
  | "sendCommand"
  | "hDel"
  | "hExists"
  | "hGet"
  | "hmGet"
  | "hGetAll"
  | "hGetDel"
  | "hGetEx"
  | "hSet"
  | "hSetNX"
  | "hIncrBy"
  | "hIncrByFloat"
  | "hStrLen"
  | "hKeys"
  | "hLen"
  | "hRandField"
  | "hRandFieldCount"
  | "hRandFieldCountWithValues"
  | "hScan"
  | "hScanNoValues"
  | "hExpire"
  | "hpExpire"
  | "hExpireAt"
  | "hpExpireAt"
  | "hPersist"
  | "hTTL"
  | "hpTTL"
  | "hExpireTime"
  | "hpExpireTime"
>;

type RawHashEntries =
  | Record<string, string>
  | ReadonlyMap<string, string>
  | readonly (string | readonly [string, string])[];

function rawHashEntries(value: RawHashEntries): Array<[string, string]> {
  if (value instanceof Map) {
    return [...value.entries()];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }

    if (Array.isArray(value[0])) {
      return value as Array<[string, string]>;
    }

    const entries: Array<[string, string]> = [];
    for (let index = 0; index < value.length; index += 2) {
      entries.push([String(value[index]), String(value[index + 1])]);
    }
    return entries;
  }

  return Object.entries(value);
}

function decodeEntryValue(codec: RedisEntriesCodec<any, any>, field: string, value: string) {
  const decoded = codec.decode([[field, value]]);
  if (Array.isArray(decoded)) return decoded[0]?.[1];
  if (decoded instanceof Map) return decoded.get(field);
  return decoded[field];
}

function decodeHashEntries(codec: RedisEntriesCodec<any, any>, value: RawHashEntries) {
  return codec.decode(rawHashEntries(value));
}

function encodeHashEntry(codec: RedisEntriesCodec<any, any>, field: string, value: unknown): [string, string] {
  const entry = codec.encode([[field, value]] as any)[0];
  if (entry === undefined) throw new TypeError(`Hash codec did not encode field "${field}"`);
  return [entry[0], entry[1]];
}

function hashValueResults(
  codec: RedisEntriesCodec<any, any>,
  fields: TupleArg<string>,
  values: readonly (string | null)[],
) {
  return codec.decode(tupleArgToArray(fields).map((field, index) => [field, values[index] ?? null]) as any);
}

function hashFieldResults<Value>(
  fields: TupleArg<string>,
  values: readonly Value[] | null,
  missing: Value,
  transform: (value: Value) => unknown = (value) => value,
): Record<PropertyKey, unknown> {
  return Object.fromEntries(
    tupleArgToArray(fields).map((field, index) => [field, transform(values?.[index] ?? missing)]),
  );
}

type ClientHashScanOptions = NonNullable<Parameters<RedisClientType["hScan"]>[2]>;

function clientHashScanOptions(opts: HashScanOptions<boolean> | undefined): ClientHashScanOptions | undefined {
  if (opts?.match === undefined && opts?.count === undefined) {
    return undefined;
  }

  const result: ClientHashScanOptions = {};
  if (opts.match !== undefined) result.MATCH = opts.match;
  if (opts.count !== undefined) result.COUNT = opts.count;
  return result;
}

function hSetExArguments(key: string, entries: Array<[string, string]>, opts?: HashSetExOptions): string[] {
  const args = ["HSETEX", key];
  if (opts?.condition !== undefined) args.push(opts.condition);
  if (opts?.fieldCondition !== undefined) args.push(opts.fieldCondition);
  if (opts?.expiration !== undefined) {
    args.push(opts.expiration.type);
    if (opts.expiration.type !== "KEEPTTL") {
      args.push(String(opts.expiration.value));
    }
  }
  args.push("FIELDS", String(entries.length));
  for (const [field, value] of entries) args.push(field, value);
  return args;
}

export function connectionHash(client: RedisHashClient, { scope }: RedisOperationOptions = {}): RedisHashConnection {
  return {
    async hDel(key, fields) {
      return client.hDel(scopedKey(key, scope), tupleArgToArray(fields));
    },

    async hExists(key, field) {
      return booleanReply(await client.hExists(scopedKey(key, scope), field));
    },

    async hGet(key, field, codec = codecs.entries(codecs.string()).object() as any) {
      const value = await client.hGet(scopedKey(key, scope), field);
      return (value === null ? null : decodeEntryValue(codec, field, value)) as any;
    },

    async hMGet(key, fields, codec = codecs.entries(codecs.string()).object() as any) {
      const fieldArray = tupleArgToArray(fields);
      return hashValueResults(codec, fields, await client.hmGet(scopedKey(key, scope), fieldArray)) as any;
    },

    async hGetAll(key, codec = codecs.entries(codecs.string()).object() as any) {
      return decodeHashEntries(codec, (await client.hGetAll(scopedKey(key, scope))) as RawHashEntries) as any;
    },

    async hGetDel(key, fields, codec = codecs.entries(codecs.string()).object() as any) {
      const fieldArray = tupleArgToArray(fields);
      return hashValueResults(codec, fields, await client.hGetDel(scopedKey(key, scope), fieldArray)) as any;
    },

    async hGetEx(key, fields, codec = codecs.entries(codecs.string()).object() as any, expiration) {
      const fieldArray = tupleArgToArray(fields);
      return hashValueResults(
        codec,
        fields,
        await client.hGetEx(scopedKey(key, scope), fieldArray, expiration === undefined ? undefined : { expiration }),
      ) as any;
    },

    async hSet(
      key: string,
      entries: EntriesInput<any>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
    ) {
      return client.hSet(scopedKey(key, scope), codec.encode(entries) as [string, string][]);
    },

    async hSetNx(
      key: string,
      field: string,
      value: unknown,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
    ) {
      const [name, encoded] = encodeHashEntry(codec, field, value);
      return booleanReply(await client.hSetNX(scopedKey(key, scope), name, encoded));
    },

    async hSetEx(
      key: string,
      entries: EntriesInput<any>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
      opts?: HashSetExOptions,
    ) {
      const args = hSetExArguments(scopedKey(key, scope), codec.encode(entries) as [string, string][], opts);
      return booleanReply(Number(await client.sendCommand(args)));
    },

    async hIncrBy(key, field, amount) {
      return client.hIncrBy(scopedKey(key, scope), field, amount);
    },

    async hIncrByFloat(key, field, amount) {
      return Number(await client.hIncrByFloat(scopedKey(key, scope), field, amount));
    },

    async hStrLen(key, field) {
      return Number(await client.hStrLen(scopedKey(key, scope), field));
    },

    async hKeys(key) {
      return client.hKeys(scopedKey(key, scope));
    },

    hLen(key) {
      return client.hLen(scopedKey(key, scope));
    },

    async hVals(key, codec = codecs.entries(codecs.string()).object() as any) {
      const decoded = decodeHashEntries(codec, (await client.hGetAll(scopedKey(key, scope))) as RawHashEntries);
      return (
        decoded instanceof Map
          ? [...decoded.values()]
          : Array.isArray(decoded)
            ? decoded.map((entry) => entry[1])
            : Object.values(decoded)
      ) as any;
    },

    async hRandField(key, codec = codecs.entries(codecs.string()).object() as any, opts) {
      const redisKey = scopedKey(key, scope);

      if (opts?.withValues === true) {
        return (await client.hRandFieldCountWithValues(redisKey, opts.count)).map(({ field, value }) => [
          field,
          decodeEntryValue(codec, field, value),
        ]) as any;
      }

      if (opts !== undefined) {
        return client.hRandFieldCount(redisKey, opts.count) as any;
      }

      const field = await client.hRandField(redisKey);
      return field as any;
    },

    async hScan(key, cursor, codec = codecs.entries(codecs.string()).object() as any, opts) {
      const redisKey = scopedKey(key, scope);
      const clientOpts = clientHashScanOptions(opts);

      if (opts?.noValues === true) {
        const page = await client.hScanNoValues(redisKey, cursor, clientOpts);
        return {
          cursor: page.cursor,
          items: page.fields,
        } as any;
      }

      const page = await client.hScan(redisKey, cursor, clientOpts);
      return {
        cursor: page.cursor,
        items: page.entries.map(({ field, value }) => [field, decodeEntryValue(codec, field, value)]),
      } as any;
    },

    async hExpire(key, seconds, fields, condition) {
      const replies = await client.hExpire(scopedKey(key, scope), tupleArgToArray(fields), seconds, condition);
      return hashFieldResults(fields, replies, -2) as any;
    },

    async hPExpire(key, milliseconds, fields, condition) {
      const replies = await client.hpExpire(scopedKey(key, scope), tupleArgToArray(fields), milliseconds, condition);
      return hashFieldResults(fields, replies, -2) as any;
    },

    async hExpireAt(key, timestampS, fields, condition) {
      const replies = await client.hExpireAt(scopedKey(key, scope), tupleArgToArray(fields), timestampS, condition);
      return hashFieldResults(fields, replies, -2) as any;
    },

    async hPExpireAt(key, timestampMs, fields, condition) {
      const replies = await client.hpExpireAt(scopedKey(key, scope), tupleArgToArray(fields), timestampMs, condition);
      return hashFieldResults(fields, replies, -2) as any;
    },

    async hPersist(key, fields) {
      const replies = await client.hPersist(scopedKey(key, scope), tupleArgToArray(fields));
      return hashFieldResults(fields, replies, -2) as any;
    },

    async hTtl(key, fields) {
      const replies = await client.hTTL(scopedKey(key, scope), tupleArgToArray(fields));
      return hashFieldResults(fields, replies, -2, ttlReply) as any;
    },

    async hPTtl(key, fields) {
      const replies = await client.hpTTL(scopedKey(key, scope), tupleArgToArray(fields));
      return hashFieldResults(fields, replies, -2, ttlReply) as any;
    },

    async hExpireTime(key, fields) {
      const replies = await client.hExpireTime(scopedKey(key, scope), tupleArgToArray(fields));
      return hashFieldResults(fields, replies, -2, ttlReply) as any;
    },

    async hPExpireTime(key, fields) {
      const replies = await client.hpExpireTime(scopedKey(key, scope), tupleArgToArray(fields));
      return hashFieldResults(fields, replies, -2, ttlReply) as any;
    },
  };
}

export function transactionHash<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  { scope }: RedisOperationOptions = {},
): RedisHashTransaction<Output> {
  const queue = createTransactionQueue(operations);

  return {
    hDel(key: string, fields: TupleArg<string>) {
      const fieldArray = tupleArgToArray(fields);
      return queue(this, (transaction) => {
        transaction.hDel(scopedKey(key, scope), fieldArray);
      });
    },

    hExists(key: string, field: string) {
      return queue(
        this,
        (transaction) => {
          transaction.hExists(scopedKey(key, scope), field);
        },
        (reply) => booleanReply(reply as number),
      );
    },

    hGet(key: string, field: string, codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object()) {
      return queue(
        this,
        (transaction) => {
          transaction.hGet(scopedKey(key, scope), field);
        },
        (reply) => (reply === null ? null : decodeEntryValue(codec, field, reply as string)),
      );
    },

    hMGet(
      key: string,
      fields: TupleArg<string>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
    ) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hmGet(scopedKey(key, scope), fieldArray);
        },
        (reply) => hashValueResults(codec, fields, reply as Array<string | null>),
      );
    },

    hGetAll(key: string, codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object()) {
      return queue(
        this,
        (transaction) => {
          transaction.hGetAll(scopedKey(key, scope));
        },
        (reply) => decodeHashEntries(codec, reply as RawHashEntries),
      );
    },

    hGetDel(
      key: string,
      fields: TupleArg<string>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
    ) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hGetDel(scopedKey(key, scope), fieldArray);
        },
        (reply) => hashValueResults(codec, fields, reply as Array<string | null>),
      );
    },

    hGetEx(
      key: string,
      fields: TupleArg<string>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
      expiration?: HashGetExExpiration,
    ) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hGetEx(scopedKey(key, scope), fieldArray, expiration === undefined ? undefined : { expiration });
        },
        (reply) => hashValueResults(codec, fields, reply as Array<string | null>),
      );
    },

    hSet(key: string, entries: unknown, codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object()) {
      const encoded = codec.encode(entries as any) as [string, string][];
      return queue(this, (transaction) => {
        transaction.hSet(scopedKey(key, scope), encoded);
      });
    },

    hSetNx(
      key: string,
      field: string,
      value: unknown,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
    ) {
      const [name, encoded] = encodeHashEntry(codec, field, value);
      return queue(
        this,
        (transaction) => {
          transaction.hSetNX(scopedKey(key, scope), name, encoded);
        },
        (reply) => booleanReply(reply as number),
      );
    },

    hSetEx(
      key: string,
      entries: unknown,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
      opts?: HashSetExOptions,
    ) {
      const args = hSetExArguments(scopedKey(key, scope), codec.encode(entries as any) as [string, string][], opts);
      return queue(
        this,
        (transaction) => {
          transaction.sendCommand(args);
        },
        (reply) => booleanReply(Number(reply)),
      );
    },

    hIncrBy(key: string, field: string, amount: number) {
      return queue(
        this,
        (transaction) => {
          transaction.hIncrBy(scopedKey(key, scope), field, amount);
        },
        (reply) => Number(reply),
      );
    },

    hIncrByFloat(key: string, field: string, amount: number) {
      return queue(
        this,
        (transaction) => {
          transaction.hIncrByFloat(scopedKey(key, scope), field, amount);
        },
        (reply) => Number(reply),
      );
    },

    hStrLen(key: string, field: string) {
      return queue(
        this,
        (transaction) => {
          transaction.hStrLen(scopedKey(key, scope), field);
        },
        (reply) => Number(reply),
      );
    },

    hKeys(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.hKeys(scopedKey(key, scope));
        },
        (reply) => reply,
      );
    },

    hLen(key: string) {
      return queue(this, (transaction) => {
        transaction.hLen(scopedKey(key, scope));
      });
    },

    hVals(key: string, codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object()) {
      return queue(
        this,
        (transaction) => {
          transaction.hGetAll(scopedKey(key, scope));
        },
        (reply) => {
          const decoded = decodeHashEntries(codec, reply as RawHashEntries);
          return decoded instanceof Map
            ? [...decoded.values()]
            : Array.isArray(decoded)
              ? decoded.map((entry) => entry[1])
              : Object.values(decoded);
        },
      );
    },

    hRandField(
      key: string,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
      opts?: HashRandFieldOptions,
    ) {
      const redisKey = scopedKey(key, scope);

      if (opts?.withValues === true) {
        return queue(
          this,
          (transaction) => {
            transaction.hRandFieldCountWithValues(redisKey, opts.count);
          },
          (reply) =>
            (reply as Array<{ field: string; value: string }>).map(({ field, value }) => [
              field,
              decodeEntryValue(codec, field, value),
            ]),
        );
      } else if (opts !== undefined) {
        return queue(
          this,
          (transaction) => {
            transaction.hRandFieldCount(redisKey, opts.count);
          },
          (reply) => reply,
        );
      } else {
        return queue(
          this,
          (transaction) => {
            transaction.hRandField(redisKey);
          },
          (reply) => reply,
        );
      }
    },

    hScan(
      key: string,
      cursor: ScanCursor,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object(),
      opts?: HashScanOptions<boolean>,
    ) {
      const redisKey = scopedKey(key, scope);
      const clientOpts = clientHashScanOptions(opts);

      if (opts?.noValues === true) {
        return queue(
          this,
          (transaction) => {
            transaction.hScanNoValues(redisKey, cursor, clientOpts);
          },
          (reply) => {
            const page = reply as { cursor: string; fields: string[] };
            return {
              cursor: page.cursor,
              items: page.fields,
            };
          },
        );
      } else {
        return queue(
          this,
          (transaction) => {
            transaction.hScan(redisKey, cursor, clientOpts);
          },
          (reply) => {
            const page = reply as {
              cursor: string;
              entries: Array<{ field: string; value: string }>;
            };
            return {
              cursor: page.cursor,
              items: page.entries.map(({ field, value }) => [field, decodeEntryValue(codec, field, value)]),
            };
          },
        );
      }
    },

    hExpire(key: string, seconds: number, fields: TupleArg<string>, condition?: ExpireCondition) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hExpire(scopedKey(key, scope), fieldArray, seconds, condition);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2),
      );
    },

    hPExpire(key: string, milliseconds: number, fields: TupleArg<string>, condition?: ExpireCondition) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hpExpire(scopedKey(key, scope), fieldArray, milliseconds, condition);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2),
      );
    },

    hExpireAt(key: string, timestampS: number, fields: TupleArg<string>, condition?: ExpireCondition) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hExpireAt(scopedKey(key, scope), fieldArray, timestampS, condition);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2),
      );
    },

    hPExpireAt(key: string, timestampMs: number, fields: TupleArg<string>, condition?: ExpireCondition) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hpExpireAt(scopedKey(key, scope), fieldArray, timestampMs, condition);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2),
      );
    },

    hPersist(key: string, fields: TupleArg<string>) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hPersist(scopedKey(key, scope), fieldArray);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2),
      );
    },

    hTtl(key: string, fields: TupleArg<string>) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hTTL(scopedKey(key, scope), fieldArray);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2, ttlReply),
      );
    },

    hPTtl(key: string, fields: TupleArg<string>) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hpTTL(scopedKey(key, scope), fieldArray);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2, ttlReply),
      );
    },

    hExpireTime(key: string, fields: TupleArg<string>) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hExpireTime(scopedKey(key, scope), fieldArray);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2, ttlReply),
      );
    },

    hPExpireTime(key: string, fields: TupleArg<string>) {
      const fieldArray = tupleArgToArray(fields);
      return queue(
        this,
        (transaction) => {
          transaction.hpExpireTime(scopedKey(key, scope), fieldArray);
        },
        (reply) => hashFieldResults(fields, reply as number[] | null, -2, ttlReply),
      );
    },
  } as RedisHashTransaction<Output>;
}
