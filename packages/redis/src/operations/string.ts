import type { RedisClientType, SetOptions as RedisSetOptions } from "redis";
import { codecs, type CodecValue, type EntriesCodecInput, type RedisCodec, type RedisEntriesCodec } from "../codec";
import { createTransactionQueue, type RedisTransaction, type RedisTransactionOperations } from "../transaction";
import {
  keysArgument,
  scopedKey,
  tupleArgToArray,
  type RedisOperationOptions,
  type TupleArg,
  type TupleShape,
} from "../utils";

interface SetBaseOptions {
  expiration?: RedisSetOptions["expiration"];
}

export type SetOptions<Value = string> = SetBaseOptions &
  (
    | {
        condition?: "NX" | "XX";
        matchValue?: never;
      }
    | {
        condition: "IFEQ";
        matchValue: Value;
      }
  );

export type Bit = 0 | 1;
export type BitOperation = "AND" | "OR" | "XOR" | "NOT" | "DIFF" | "DIFF1" | "ANDOR" | "ONE";

export interface BitRange {
  start: number;
  end: number;
  mode?: "BYTE" | "BIT";
}

export type BitFieldEncoding = `${"i" | "u"}${number}`;
export type BitFieldOffset = number | `#${number}`;
export type BitFieldOverflow = "WRAP" | "SAT" | "FAIL";

export type BitFieldOperation =
  | {
      operation: "GET";
      encoding: BitFieldEncoding;
      offset: BitFieldOffset;
    }
  | {
      operation: "SET";
      encoding: BitFieldEncoding;
      offset: BitFieldOffset;
      value: number;
    }
  | {
      operation: "INCRBY";
      encoding: BitFieldEncoding;
      offset: BitFieldOffset;
      increment: number;
    }
  | {
      operation: "OVERFLOW";
      behavior: BitFieldOverflow;
    };

export type BitFieldOperationResult<Operation> = Operation extends {
  operation: "INCRBY";
}
  ? number | null
  : Operation extends { operation: "GET" | "SET" }
    ? number
    : never;

export type BitFieldResults<Operations extends readonly BitFieldOperation[]> = number extends Operations["length"]
  ? (number | null)[]
  : Operations extends readonly [
        infer Head extends BitFieldOperation,
        ...infer Tail extends readonly BitFieldOperation[],
      ]
    ? Head extends { operation: "OVERFLOW" }
      ? BitFieldResults<Tail>
      : readonly [BitFieldOperationResult<Head>, ...BitFieldResults<Tail>]
    : readonly [];

type StringEntriesCodec<TKeys extends TupleArg<string>> = RedisEntriesCodec<
  TupleShape<TKeys, string>,
  TupleShape<TKeys, string | null>
>;
type StringRecordCodec = RedisEntriesCodec<Record<string, string>, Record<string, string>>;

export interface RedisStringConnection {
  get<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec> | null>;
  mGet<TKeys extends TupleArg<string>, TCodec extends RedisEntriesCodec<any, any> = StringEntriesCodec<TKeys>>(
    keys: TKeys,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>>;

  set<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    value: CodecValue<TCodec>,
    codec?: TCodec,
    opts?: SetOptions<CodecValue<TCodec>>,
  ): Promise<void>;
  getThenSet<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    value: CodecValue<TCodec>,
    codec?: TCodec,
    opts?: SetOptions<CodecValue<TCodec>>,
  ): Promise<CodecValue<TCodec> | null>;
  mSet<TCodec extends RedisEntriesCodec<any, any> = StringRecordCodec>(
    entries: EntriesCodecInput<TCodec>,
    codec?: TCodec,
  ): Promise<void>;

  getDel<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec> | null>;

  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  incrBy(key: string, amount: number): Promise<number>;
  decrBy(key: string, amount: number): Promise<number>;
  incrByFloat(key: string, amount: number): Promise<number>;

  append(key: string, value: string): Promise<number>;
  strLen(key: string): Promise<number>;

  getRange(key: string, start: number, end: number): Promise<string>;

  setRange(key: string, offset: number, value: string): Promise<number>;

  getBit(key: string, offset: number): Promise<Bit>;
  setBit(key: string, offset: number, value: Bit): Promise<Bit>;
  bitCount(key: string, range?: BitRange): Promise<number>;
  bitPos(key: string, bit: Bit, start?: number, end?: number, mode?: "BYTE" | "BIT"): Promise<number>;
  bitOp(operation: BitOperation, destination: string, keys: TupleArg<string>): Promise<number>;
  bitField<const Operations extends readonly BitFieldOperation[]>(
    key: string,
    operations: Operations,
  ): Promise<BitFieldResults<Operations>>;
}

export type RedisStringTransaction<Output extends readonly unknown[] = []> = {
  [Key in keyof RedisStringConnection]: (
    ...params: Parameters<RedisStringConnection[Key]>
  ) => RedisTransaction<[...Output, Awaited<ReturnType<RedisStringConnection[Key]>>]>;
};

export type RedisStringClient = Pick<
  RedisClientType,
  | "get"
  | "mGet"
  | "set"
  | "mSet"
  | "getDel"
  | "incr"
  | "decr"
  | "incrBy"
  | "decrBy"
  | "incrByFloat"
  | "append"
  | "strLen"
  | "getRange"
  | "setRange"
  | "getBit"
  | "setBit"
  | "bitCount"
  | "bitPos"
  | "bitOp"
  | "bitField"
>;

function bitFieldArgument(operations: readonly BitFieldOperation[]): Parameters<RedisClientType["bitField"]>[1] {
  return operations.map((operation) => ({ ...operation }));
}

function clientSetOptions<T>(
  codec: RedisCodec<T>,
  opts: SetOptions<T> | undefined,
  get = false,
): RedisSetOptions | undefined {
  if (opts === undefined) {
    return get ? { GET: true } : undefined;
  }

  const result: RedisSetOptions = {};

  if (opts.expiration !== undefined) {
    result.expiration = opts.expiration;
  }

  if (opts.condition === "IFEQ") {
    result.condition = "IFEQ";
    result.matchValue = codec.encode(opts.matchValue);
  } else if (opts.condition !== undefined) {
    result.condition = opts.condition;
  }

  if (get) {
    result.GET = true;
  }

  return result;
}

export function connectionString(
  client: RedisStringClient,
  { scope }: RedisOperationOptions = {},
): RedisStringConnection {
  return {
    async get(key, codec: RedisCodec<any> = codecs.string()) {
      const value = await client.get(scopedKey(key, scope));
      if (value === null) {
        return null;
      }

      return codec.decode(value);
    },

    async mGet(keys, codec = codecs.entries(codecs.string()).object() as any) {
      const keyArray = tupleArgToArray(keys);
      const values = await client.mGet(keyArray.map((key) => scopedKey(key, scope)));
      return codec.decode(keyArray.map((key, index) => [key, values[index] ?? null]) as any);
    },

    async set(key, value, codec: RedisCodec<any> = codecs.string(), opts) {
      await client.set(scopedKey(key, scope), codec.encode(value), clientSetOptions(codec, opts));
    },

    async getThenSet(key, value, codec: RedisCodec<any> = codecs.string(), opts) {
      const reply = await client.set(scopedKey(key, scope), codec.encode(value), clientSetOptions(codec, opts, true));
      if (reply === null) {
        return null;
      }

      return codec.decode(reply);
    },

    async mSet(entries: any, codec = codecs.entries(codecs.string()).object() as any) {
      await client.mSet(
        codec
          .encode(entries)
          .map(([key, value]: readonly [string, string]) => [scopedKey(key, scope), value] as [string, string]),
      );
    },

    async getDel(key, codec: RedisCodec<any> = codecs.string()) {
      const value = await client.getDel(scopedKey(key, scope));
      if (value === null) {
        return null;
      }

      return codec.decode(value);
    },

    async incr(key) {
      return await client.incr(scopedKey(key, scope));
    },

    async decr(key) {
      return await client.decr(scopedKey(key, scope));
    },

    async incrBy(key, amount) {
      return await client.incrBy(scopedKey(key, scope), amount);
    },

    async decrBy(key, amount) {
      return await client.decrBy(scopedKey(key, scope), amount);
    },

    async incrByFloat(key, amount) {
      return Number(await client.incrByFloat(scopedKey(key, scope), amount));
    },

    append(key, value) {
      return client.append(scopedKey(key, scope), value);
    },

    strLen(key) {
      return client.strLen(scopedKey(key, scope));
    },

    async getRange(key, start, end) {
      return (await client.getRange(scopedKey(key, scope), start, end)) ?? "";
    },

    setRange(key, offset, value) {
      return client.setRange(scopedKey(key, scope), offset, value);
    },

    getBit(key, offset) {
      return client.getBit(scopedKey(key, scope), offset);
    },

    setBit(key, offset, value) {
      return client.setBit(scopedKey(key, scope), offset, value);
    },

    bitCount(key, range) {
      return client.bitCount(scopedKey(key, scope), range);
    },

    bitPos(key, bit, start, end, mode) {
      return client.bitPos(scopedKey(key, scope), bit, start, end, mode);
    },

    bitOp(operation, destination, keys) {
      return client.bitOp(operation, scopedKey(destination, scope), keysArgument(keys, scope));
    },

    async bitField(key, operations) {
      return (await client.bitField(scopedKey(key, scope), bitFieldArgument(operations))) as any;
    },
  };
}

export function transactionString<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  { scope }: RedisOperationOptions = {},
): RedisStringTransaction<Output> {
  const queue = createTransactionQueue(operations);

  return {
    get(key: string, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (transaction) => {
          transaction.get(scopedKey(key, scope));
        },
        (reply) => (reply === null ? null : codec.decode(reply as string)),
      );
    },

    mGet(keys: TupleArg<string>, codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).object()) {
      const keyArray = tupleArgToArray(keys);
      return queue(
        this,
        (transaction) => {
          transaction.mGet(keyArray.map((key) => scopedKey(key, scope)));
        },
        (reply) =>
          codec.decode(keyArray.map((key, index) => [key, (reply as Array<string | null>)[index] ?? null]) as any),
      );
    },

    set(key: string, value: unknown, codec: RedisCodec<any> = codecs.string(), opts?: SetOptions<unknown>) {
      const clientOpts = clientSetOptions(codec, opts);
      return queue(
        this,
        (transaction) => {
          transaction.set(scopedKey(key, scope), codec.encode(value), clientOpts);
        },
        () => undefined,
      );
    },

    getThenSet(key: string, value: unknown, codec: RedisCodec<any> = codecs.string(), opts?: SetOptions<unknown>) {
      const clientOpts = clientSetOptions(codec, opts, true);
      return queue(
        this,
        (transaction) => {
          transaction.set(scopedKey(key, scope), codec.encode(value), clientOpts);
        },
        (reply) => (reply === null ? null : codec.decode(reply as string)),
      );
    },

    mSet(entries: any, codec = codecs.entries(codecs.string()).object() as any) {
      return queue(
        this,
        (transaction) => {
          transaction.mSet(
            codec
              .encode(entries)
              .map(([key, value]: readonly [string, string]) => [scopedKey(key, scope), value] as [string, string]),
          );
        },
        () => undefined,
      );
    },

    getDel(key: string, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (transaction) => {
          transaction.getDel(scopedKey(key, scope));
        },
        (reply) => (reply === null ? null : codec.decode(reply as string)),
      );
    },

    incr(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.incr(scopedKey(key, scope));
        },
        (reply) => reply,
      );
    },

    decr(key: string) {
      return queue(
        this,
        (transaction) => {
          transaction.decr(scopedKey(key, scope));
        },
        (reply) => reply,
      );
    },

    incrBy(key: string, amount: number) {
      return queue(
        this,
        (transaction) => {
          transaction.incrBy(scopedKey(key, scope), amount);
        },
        (reply) => reply,
      );
    },

    decrBy(key: string, amount: number) {
      return queue(
        this,
        (transaction) => {
          transaction.decrBy(scopedKey(key, scope), amount);
        },
        (reply) => reply,
      );
    },

    incrByFloat(key: string, amount: number) {
      return queue(
        this,
        (transaction) => {
          transaction.incrByFloat(scopedKey(key, scope), amount);
        },
        (reply) => Number(reply),
      );
    },

    append(key: string, value: string) {
      return queue(this, (transaction) => {
        transaction.append(scopedKey(key, scope), value);
      });
    },

    strLen(key: string) {
      return queue(this, (transaction) => {
        transaction.strLen(scopedKey(key, scope));
      });
    },

    getRange(key: string, start: number, end: number) {
      return queue(
        this,
        (transaction) => {
          transaction.getRange(scopedKey(key, scope), start, end);
        },
        (reply) => (reply as string | null) ?? "",
      );
    },

    setRange(key: string, offset: number, value: string) {
      return queue(this, (transaction) => {
        transaction.setRange(scopedKey(key, scope), offset, value);
      });
    },

    getBit(key: string, offset: number) {
      return queue(this, (transaction) => {
        transaction.getBit(scopedKey(key, scope), offset);
      });
    },

    setBit(key: string, offset: number, value: Bit) {
      return queue(this, (transaction) => {
        transaction.setBit(scopedKey(key, scope), offset, value);
      });
    },

    bitCount(key: string, range?: BitRange) {
      return queue(this, (transaction) => {
        transaction.bitCount(scopedKey(key, scope), range);
      });
    },

    bitPos(key: string, bit: Bit, start?: number, end?: number, mode?: "BYTE" | "BIT") {
      return queue(this, (transaction) => {
        transaction.bitPos(scopedKey(key, scope), bit, start, end, mode);
      });
    },

    bitOp(operation: BitOperation, destination: string, keys: readonly string[]) {
      return queue(this, (transaction) => {
        transaction.bitOp(
          operation,
          scopedKey(destination, scope),
          keys.map((key) => scopedKey(key, scope)),
        );
      });
    },

    bitField(key: string, bitFieldOperations: readonly BitFieldOperation[]) {
      return queue(this, (transaction) => {
        transaction.bitField(scopedKey(key, scope), bitFieldArgument(bitFieldOperations));
      });
    },
  } as RedisStringTransaction<Output>;
}
