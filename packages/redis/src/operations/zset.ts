import type { RedisClientType } from "redis";
import { codecs, type CodecValue, type EntriesOf, type RedisCodec, type RedisEntriesCodec } from "../codec";
import { createTransactionQueue, type RedisTransaction, type RedisTransactionOperations } from "../transaction";
import {
  keysArgument,
  scopedKey,
  tupleArgToArray,
  unscopedKey,
  type RedisOperationOptions,
  type TupleArg,
  type TupleValue,
} from "../utils";
import type { ScanCommonOptions, ScanCursor, ScanPage } from "./generic";

export interface ZSetEntry<Value = string> {
  value: Value;
  score: number;
}

export type ZSetAggregate = "SUM" | "MIN" | "MAX";
export type ZSetPopDirection = "MIN" | "MAX";
export type ZSetScoreBoundary = number | `(${number}` | "-inf" | "+inf";
export type ZSetLexBoundary = `(${string}` | `[${string}` | "-" | "+";

export type ZSetRange =
  | {
      by: "rank";
      start: number;
      stop: number;
      reverse?: boolean;
    }
  | {
      by: "score";
      start: ZSetScoreBoundary;
      stop: ZSetScoreBoundary;
      reverse?: boolean;
      limit?: {
        offset: number;
        count: number;
      };
    }
  | {
      by: "lex";
      start: ZSetLexBoundary;
      stop: ZSetLexBoundary;
      reverse?: boolean;
      limit?: {
        offset: number;
        count: number;
      };
    };

type ZSetAddConditions =
  | {
      condition: "NX";
      comparison?: never;
    }
  | {
      condition?: "XX";
      comparison?: "GT" | "LT";
    };

export type ZSetAddOptions = ZSetAddConditions & {
  change?: boolean;
  increment?: false;
};

export type ZSetAddIncrementOptions = ZSetAddConditions & {
  change?: boolean;
  increment: true;
};

export type ZSetRandMemberOptions =
  | {
      count: number;
      withScores?: false;
    }
  | {
      count: number;
      withScores: true;
    };

export interface ZSetInput<K extends string> {
  key: K;
  weight?: number;
}

export interface ZSetAggregateOptions<WithScores extends boolean = false> {
  aggregate?: ZSetAggregate;
  withScores?: WithScores;
}

export type ZSetInputKeys<Inputs> = Inputs extends readonly (infer Input)[]
  ? Input extends { key: infer K }
    ? K
    : never
  : Inputs extends { key: infer K }
    ? K
    : never;

type EntriesValue<TCodec extends RedisEntriesCodec<any, any>> = EntriesOf<TCodec>[number][1];
type StringEntriesCodec = RedisEntriesCodec<Record<string, string>, readonly (readonly [string, string])[]>;

export type ZSetMPopResult<Keys extends TupleArg<string>, Value = string> = {
  key: TupleValue<Keys>;
  entries: ZSetEntry<Value>[];
} | null;

export type ZSetPopResult<Keys extends TupleArg<string>, Value = string> = {
  key: TupleValue<Keys>;
  entry: ZSetEntry<Value>;
} | null;

type ZSetRangeResult<Value, WithScores extends boolean> = WithScores extends true ? ZSetEntry<Value>[] : Value[];

type ZSetAggregateResult<Value, WithScores extends boolean> = WithScores extends true
  ? Array<ZSetEntry<Value>>
  : Value[];

export interface RedisZSetConnection {
  zAdd<
    TCodec extends RedisCodec<any> = RedisCodec<string>,
    Options extends ZSetAddOptions | ZSetAddIncrementOptions | undefined = undefined,
  >(
    key: string,
    entries: Options extends ZSetAddIncrementOptions
      ? ZSetEntry<CodecValue<TCodec>>
      : TupleArg<ZSetEntry<CodecValue<TCodec>>>,
    codec?: TCodec,
    opts?: Options,
  ): Promise<Options extends ZSetAddIncrementOptions ? number | null : number>;
  zCard(key: string): Promise<number>;
  zCount(key: string, min: ZSetScoreBoundary, max: ZSetScoreBoundary): Promise<number>;
  zIncrBy(key: string, increment: number, member: unknown, codec?: RedisCodec<any>): Promise<number>;
  zLexCount(key: string, min: ZSetLexBoundary, max: ZSetLexBoundary): Promise<number>;
  zScore(key: string, member: unknown, codec?: RedisCodec<any>): Promise<number | null>;
  zMScore(key: string, members: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<Array<number | null>>;
  zRank<WithScore extends boolean = false>(
    key: string,
    member: unknown,
    codec?: RedisCodec<any>,
    opts?: { withScore?: WithScore },
  ): Promise<WithScore extends true ? { rank: number; score: number } | null : number | null>;
  zRevRank<WithScore extends boolean = false>(
    key: string,
    member: unknown,
    codec?: RedisCodec<any>,
    opts?: { withScore?: WithScore },
  ): Promise<WithScore extends true ? { rank: number; score: number } | null : number | null>;
  zRange<TCodec extends RedisCodec<any> = RedisCodec<string>, WithScores extends boolean = false>(
    key: string,
    range: ZSetRange,
    codec?: TCodec,
    opts?: { withScores?: WithScores },
  ): Promise<ZSetRangeResult<CodecValue<TCodec>, WithScores>>;
  zRangeStore(destination: string, source: string, range: ZSetRange): Promise<number>;
  zRem(key: string, members: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<number>;
  zRemRangeByLex(key: string, min: ZSetLexBoundary, max: ZSetLexBoundary): Promise<number>;
  zRemRangeByRank(key: string, start: number, stop: number): Promise<number>;
  zRemRangeByScore(key: string, min: ZSetScoreBoundary, max: ZSetScoreBoundary): Promise<number>;
  zPopMin<TCodec extends RedisCodec<any> = RedisCodec<string>, Count extends number | undefined = undefined>(
    key: string,
    count?: Count,
    codec?: TCodec,
  ): Promise<Count extends number ? ZSetEntry<CodecValue<TCodec>>[] : ZSetEntry<CodecValue<TCodec>> | null>;
  zPopMax<TCodec extends RedisCodec<any> = RedisCodec<string>, Count extends number | undefined = undefined>(
    key: string,
    count?: Count,
    codec?: TCodec,
  ): Promise<Count extends number ? ZSetEntry<CodecValue<TCodec>>[] : ZSetEntry<CodecValue<TCodec>> | null>;
  zMPop<Keys extends TupleArg<string>, TCodec extends RedisEntriesCodec<any, any> = StringEntriesCodec>(
    keys: Keys,
    direction: ZSetPopDirection,
    codec?: TCodec,
    count?: number,
  ): Promise<ZSetMPopResult<Keys, EntriesValue<TCodec>>>;
  zRandMember<
    TCodec extends RedisCodec<any> = RedisCodec<string>,
    Options extends ZSetRandMemberOptions | undefined = undefined,
  >(
    key: string,
    codec?: TCodec,
    opts?: Options,
  ): Promise<
    Options extends { withScores: true }
      ? ZSetEntry<CodecValue<TCodec>>[]
      : Options extends { count: number }
        ? CodecValue<TCodec>[]
        : CodecValue<TCodec> | null
  >;
  zScan<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    cursor: ScanCursor,
    codec?: TCodec,
    opts?: ScanCommonOptions,
  ): Promise<ScanPage<ZSetEntry<CodecValue<TCodec>>>>;
  zDiff<TCodec extends RedisCodec<any> = RedisCodec<string>, WithScores extends boolean = false>(
    keys: TupleArg<string>,
    codec?: TCodec,
    opts?: { withScores?: WithScores },
  ): Promise<ZSetAggregateResult<CodecValue<TCodec>, WithScores>>;
  zDiffStore(destination: string, keys: TupleArg<string>): Promise<number>;
  zInter<TCodec extends RedisCodec<any> = RedisCodec<string>, WithScores extends boolean = false>(
    inputs: TupleArg<ZSetInput<string>>,
    codec?: TCodec,
    opts?: ZSetAggregateOptions<WithScores>,
  ): Promise<ZSetAggregateResult<CodecValue<TCodec>, WithScores>>;
  zInterCard(keys: TupleArg<string>, limit?: number): Promise<number>;
  zInterStore(
    destination: string,
    inputs: TupleArg<ZSetInput<string>>,
    opts?: Omit<ZSetAggregateOptions, "withScores">,
  ): Promise<number>;
  zUnion<TCodec extends RedisCodec<any> = RedisCodec<string>, WithScores extends boolean = false>(
    inputs: TupleArg<ZSetInput<string>>,
    codec?: TCodec,
    opts?: ZSetAggregateOptions<WithScores>,
  ): Promise<ZSetAggregateResult<CodecValue<TCodec>, WithScores>>;
  zUnionStore(
    destination: string,
    inputs: TupleArg<ZSetInput<string>>,
    opts?: Omit<ZSetAggregateOptions, "withScores">,
  ): Promise<number>;
  bzMPop<Keys extends TupleArg<string>, TCodec extends RedisEntriesCodec<any, any> = StringEntriesCodec>(
    keys: Keys,
    direction: ZSetPopDirection,
    timeoutS: number,
    codec?: TCodec,
    count?: number,
  ): Promise<ZSetMPopResult<Keys, EntriesValue<TCodec>>>;
  bzPopMin<Keys extends TupleArg<string>, TCodec extends RedisCodec<any> = RedisCodec<string>>(
    keys: Keys,
    timeoutS: number,
    codec?: TCodec,
  ): Promise<ZSetPopResult<Keys, CodecValue<TCodec>>>;
  bzPopMax<Keys extends TupleArg<string>, TCodec extends RedisCodec<any> = RedisCodec<string>>(
    keys: Keys,
    timeoutS: number,
    codec?: TCodec,
  ): Promise<ZSetPopResult<Keys, CodecValue<TCodec>>>;
}

export type RedisZSetTransaction<Output extends readonly unknown[] = []> = {
  [Key in keyof RedisZSetConnection]: (
    ...params: Parameters<RedisZSetConnection[Key]>
  ) => RedisTransaction<[...Output, Awaited<ReturnType<RedisZSetConnection[Key]>>]>;
};

export type RedisZSetClient = RedisClientType;

type RawZEntry = { value: string; score: number };
type RawZMPop = { key: string; members: RawZEntry[] } | null;
type RawZPop = { key: string; value: string; score: number } | null;

function zRangeOptions(range: ZSetRange) {
  const options: {
    BY?: "SCORE" | "LEX";
    REV?: boolean;
    LIMIT?: { offset: number; count: number };
  } = {};
  if (range.by !== "rank") options.BY = range.by === "score" ? "SCORE" : "LEX";
  if (range.reverse === true) options.REV = true;
  if (range.by !== "rank" && range.limit !== undefined) options.LIMIT = range.limit;
  return Object.keys(options).length === 0 ? undefined : options;
}

function zAddOptions(opts?: ZSetAddOptions | ZSetAddIncrementOptions) {
  if (opts === undefined) return undefined;
  const result: {
    condition?: "NX" | "XX";
    comparison?: "GT" | "LT";
    CH?: boolean;
  } = {};
  if (opts.condition !== undefined) result.condition = opts.condition;
  if (opts.comparison !== undefined) result.comparison = opts.comparison;
  if (opts.change !== undefined) result.CH = opts.change;
  return result;
}

function zAggregateOptions(opts?: { aggregate?: ZSetAggregate }) {
  return opts?.aggregate === undefined ? undefined : { AGGREGATE: opts.aggregate };
}

function zScanOptions(opts?: ScanCommonOptions) {
  if (opts?.match === undefined && opts?.count === undefined) return undefined;
  const result: { MATCH?: string; COUNT?: number } = {};
  if (opts.match !== undefined) result.MATCH = opts.match;
  if (opts.count !== undefined) result.COUNT = opts.count;
  return result;
}

function decodeZEntries(codec: RedisCodec<any>, entries: readonly RawZEntry[]) {
  return entries.map(({ value, score }) => ({
    value: codec.decode(value),
    score,
  }));
}

function decodeEntryValue(codec: RedisEntriesCodec<any, any>, key: string, value: string) {
  const decoded = codec.decode([[key, value]]);
  if (Array.isArray(decoded)) return decoded[0]?.[1];
  if (decoded instanceof Map) return decoded.get(key);
  return decoded[key];
}

function decodeZMPop(reply: RawZMPop, codec: RedisEntriesCodec<any, any>, scope?: string) {
  if (reply === null) return null;
  const key = unscopedKey(reply.key, scope);
  return {
    key,
    entries: reply.members.map(({ value, score }) => ({ value: decodeEntryValue(codec, key, value), score })),
  };
}

function decodeZPop(reply: RawZPop, codec: RedisCodec<any>, scope?: string) {
  if (reply === null) return null;
  const key = unscopedKey(reply.key, scope);
  return {
    key,
    entry: { value: codec.decode(reply.value), score: reply.score },
  };
}

function zInputs(inputs: TupleArg<ZSetInput<string>>, scope?: string) {
  return tupleArgToArray(inputs).map((input) => ({
    key: scopedKey(input.key, scope),
    weight: input.weight ?? 1,
  })) as [{ key: string; weight: number }, ...Array<{ key: string; weight: number }>];
}

export function connectionZSet(client: RedisZSetClient, { scope }: RedisOperationOptions = {}): RedisZSetConnection {
  return {
    async zAdd(k, entries, codec = codecs.string() as any, opts) {
      const encoded = tupleArgToArray(entries).map(({ value, score }) => ({
        value: codec.encode(value),
        score,
      }));
      return (
        opts?.increment === true
          ? client.zAddIncr(scopedKey(k, scope), encoded[0]!, zAddOptions(opts))
          : client.zAdd(scopedKey(k, scope), encoded, zAddOptions(opts))
      ) as any;
    },
    async zCard(k) {
      return client.zCard(scopedKey(k, scope));
    },
    async zCount(k, min, max) {
      return client.zCount(scopedKey(k, scope), min, max);
    },
    async zIncrBy(k, increment, member, codec = codecs.string()) {
      return client.zIncrBy(scopedKey(k, scope), increment, codec.encode(member));
    },
    async zLexCount(k, min, max) {
      return client.zLexCount(scopedKey(k, scope), min, max);
    },
    async zScore(k, member, codec = codecs.string()) {
      return client.zScore(scopedKey(k, scope), codec.encode(member));
    },
    async zMScore(k, members, codec = codecs.string()) {
      return client.zmScore(
        scopedKey(k, scope),
        tupleArgToArray(members).map((v) => codec.encode(v)),
      );
    },
    async zRank(k, member, codec = codecs.string(), opts) {
      const encoded = codec.encode(member);
      return (
        opts?.withScore === true
          ? client.zRankWithScore(scopedKey(k, scope), encoded)
          : client.zRank(scopedKey(k, scope), encoded)
      ) as any;
    },
    async zRevRank(k, member, codec = codecs.string(), opts) {
      const encoded = codec.encode(member);
      return (
        opts?.withScore === true
          ? client.zRevRankWithScore(scopedKey(k, scope), encoded)
          : client.zRevRank(scopedKey(k, scope), encoded)
      ) as any;
    },
    async zRange(k, range, codec = codecs.string() as any, opts) {
      const reply =
        opts?.withScores === true
          ? await client.zRangeWithScores(scopedKey(k, scope), range.start, range.stop, zRangeOptions(range))
          : await client.zRange(scopedKey(k, scope), range.start, range.stop, zRangeOptions(range));
      return (
        opts?.withScores === true
          ? decodeZEntries(codec, reply as RawZEntry[])
          : (reply as string[]).map((v) => codec.decode(v))
      ) as any;
    },
    async zRangeStore(destination, source, range) {
      return client.zRangeStore(
        scopedKey(destination, scope),
        scopedKey(source, scope),
        range.start,
        range.stop,
        zRangeOptions(range) as Parameters<RedisClientType["zRangeStore"]>[4],
      );
    },
    async zRem(k, members, codec = codecs.string()) {
      return client.zRem(
        scopedKey(k, scope),
        tupleArgToArray(members).map((v) => codec.encode(v)),
      );
    },
    async zRemRangeByLex(k, min, max) {
      return client.zRemRangeByLex(scopedKey(k, scope), min, max);
    },
    async zRemRangeByRank(k, start, stop) {
      return client.zRemRangeByRank(scopedKey(k, scope), start, stop);
    },
    async zRemRangeByScore(k, min, max) {
      return client.zRemRangeByScore(scopedKey(k, scope), min, max);
    },
    async zPopMin(k, count, codec = codecs.string() as any) {
      return (
        count === undefined
          ? ((entry) => (entry === null ? null : { value: codec.decode(entry.value), score: entry.score }))(
              await client.zPopMin(scopedKey(k, scope)),
            )
          : decodeZEntries(codec, await client.zPopMinCount(scopedKey(k, scope), count))
      ) as any;
    },
    async zPopMax(k, count, codec = codecs.string() as any) {
      return (
        count === undefined
          ? ((entry) => (entry === null ? null : { value: codec.decode(entry.value), score: entry.score }))(
              await client.zPopMax(scopedKey(k, scope)),
            )
          : decodeZEntries(codec, await client.zPopMaxCount(scopedKey(k, scope), count))
      ) as any;
    },
    async zMPop(
      ks: TupleArg<string>,
      direction: ZSetPopDirection,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return decodeZMPop(
        await client.zmPop(keysArgument(ks, scope), direction, count === undefined ? undefined : { COUNT: count }),
        codec,
        scope,
      ) as any;
    },
    async zRandMember(k, codec = codecs.string() as any, opts) {
      if (opts?.withScores === true)
        return decodeZEntries(codec, await client.zRandMemberCountWithScores(scopedKey(k, scope), opts.count)) as any;
      if (opts !== undefined)
        return (await client.zRandMemberCount(scopedKey(k, scope), opts.count)).map((v) => codec.decode(v)) as any;
      const value = await client.zRandMember(scopedKey(k, scope));
      return (value === null ? null : codec.decode(value)) as any;
    },
    async zScan(k, cursor, codec = codecs.string() as any, opts) {
      const page = await client.zScan(scopedKey(k, scope), cursor, zScanOptions(opts));
      return {
        cursor: page.cursor,
        items: decodeZEntries(codec, page.members),
      } as any;
    },
    async zDiff(ks, codec = codecs.string() as any, opts) {
      return (
        opts?.withScores === true
          ? decodeZEntries(codec, await client.zDiffWithScores(keysArgument(ks, scope)))
          : (await client.zDiff(keysArgument(ks, scope))).map((v) => codec.decode(v))
      ) as any;
    },
    async zDiffStore(destination, ks) {
      return client.zDiffStore(scopedKey(destination, scope), keysArgument(ks, scope));
    },
    async zInter(inputs, codec = codecs.string() as any, opts) {
      return (
        opts?.withScores === true
          ? decodeZEntries(codec, await client.zInterWithScores(zInputs(inputs, scope), zAggregateOptions(opts)))
          : (await client.zInter(zInputs(inputs, scope), zAggregateOptions(opts))).map((v) => codec.decode(v))
      ) as any;
    },
    async zInterCard(ks, limit) {
      return client.zInterCard(keysArgument(ks, scope), limit);
    },
    async zInterStore(destination, inputs, opts) {
      return client.zInterStore(scopedKey(destination, scope), zInputs(inputs, scope), zAggregateOptions(opts));
    },
    async zUnion(inputs, codec = codecs.string() as any, opts) {
      return (
        opts?.withScores === true
          ? decodeZEntries(codec, await client.zUnionWithScores(zInputs(inputs, scope), zAggregateOptions(opts)))
          : (await client.zUnion(zInputs(inputs, scope), zAggregateOptions(opts))).map((v) => codec.decode(v))
      ) as any;
    },
    async zUnionStore(destination, inputs, opts) {
      return client.zUnionStore(scopedKey(destination, scope), zInputs(inputs, scope), zAggregateOptions(opts));
    },
    async bzMPop(
      ks: TupleArg<string>,
      direction: ZSetPopDirection,
      timeoutS: number,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return decodeZMPop(
        await client.bzmPop(
          timeoutS,
          keysArgument(ks, scope),
          direction,
          count === undefined ? undefined : { COUNT: count },
        ),
        codec,
        scope,
      ) as any;
    },
    async bzPopMin(ks, timeoutS, codec = codecs.string() as any) {
      return decodeZPop(await client.bzPopMin(keysArgument(ks, scope), timeoutS), codec, scope) as any;
    },
    async bzPopMax(ks, timeoutS, codec = codecs.string() as any) {
      return decodeZPop(await client.bzPopMax(keysArgument(ks, scope), timeoutS), codec, scope) as any;
    },
  };
}

export function transactionZSet<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  { scope }: RedisOperationOptions = {},
): RedisZSetTransaction<Output> {
  const queue = createTransactionQueue(operations);
  const api = {
    zAdd(
      k: string,
      entries: TupleArg<ZSetEntry<unknown>>,
      codec: RedisCodec<any> = codecs.string(),
      opts?: ZSetAddOptions | ZSetAddIncrementOptions,
    ) {
      const encoded = tupleArgToArray(entries).map(({ value, score }) => ({
        value: codec.encode(value),
        score,
      }));
      return opts?.increment === true
        ? queue(this, (tx) => {
            tx.zAddIncr(scopedKey(k, scope), encoded[0]!, zAddOptions(opts));
          })
        : queue(this, (tx) => {
            tx.zAdd(scopedKey(k, scope), encoded, zAddOptions(opts));
          });
    },
    zCard(k: string) {
      return queue(this, (tx) => {
        tx.zCard(scopedKey(k, scope));
      });
    },
    zCount(k: string, min: ZSetScoreBoundary, max: ZSetScoreBoundary) {
      return queue(this, (tx) => {
        tx.zCount(scopedKey(k, scope), min, max);
      });
    },
    zIncrBy(k: string, increment: number, member: unknown, codec: RedisCodec<any> = codecs.string()) {
      const encoded = codec.encode(member);
      return queue(
        this,
        (tx) => {
          tx.zIncrBy(scopedKey(k, scope), increment, encoded);
        },
        Number,
      );
    },
    zLexCount(k: string, min: ZSetLexBoundary, max: ZSetLexBoundary) {
      return queue(this, (tx) => {
        tx.zLexCount(scopedKey(k, scope), min, max);
      });
    },
    zScore(k: string, member: unknown, codec: RedisCodec<any> = codecs.string()) {
      const encoded = codec.encode(member);
      return queue(
        this,
        (tx) => {
          tx.zScore(scopedKey(k, scope), encoded);
        },
        (r) => (r === null ? null : Number(r)),
      );
    },
    zMScore(k: string, members: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      const encoded = tupleArgToArray(members).map((v) => codec.encode(v));
      return queue(
        this,
        (tx) => {
          tx.zmScore(scopedKey(k, scope), encoded);
        },
        (r) => (r as Array<number | string | null>).map((v) => (v === null ? null : Number(v))),
      );
    },
    zRank(k: string, member: unknown, codec: RedisCodec<any> = codecs.string(), opts?: { withScore?: boolean }) {
      const encoded = codec.encode(member);
      return opts?.withScore === true
        ? queue(this, (tx) => {
            tx.zRankWithScore(scopedKey(k, scope), encoded);
          })
        : queue(this, (tx) => {
            tx.zRank(scopedKey(k, scope), encoded);
          });
    },
    zRevRank(k: string, member: unknown, codec: RedisCodec<any> = codecs.string(), opts?: { withScore?: boolean }) {
      const encoded = codec.encode(member);
      return opts?.withScore === true
        ? queue(this, (tx) => {
            tx.zRevRankWithScore(scopedKey(k, scope), encoded);
          })
        : queue(this, (tx) => {
            tx.zRevRank(scopedKey(k, scope), encoded);
          });
    },
    zRange(k: string, range: ZSetRange, codec: RedisCodec<any> = codecs.string(), opts?: { withScores?: boolean }) {
      return opts?.withScores === true
        ? queue(
            this,
            (tx) => {
              tx.zRangeWithScores(scopedKey(k, scope), range.start, range.stop, zRangeOptions(range));
            },
            (r) => decodeZEntries(codec, r as RawZEntry[]),
          )
        : queue(
            this,
            (tx) => {
              tx.zRange(scopedKey(k, scope), range.start, range.stop, zRangeOptions(range));
            },
            (r) => (r as string[]).map((v) => codec.decode(v)),
          );
    },
    zRangeStore(destination: string, source: string, range: ZSetRange) {
      return queue(this, (tx) => {
        tx.zRangeStore(
          scopedKey(destination, scope),
          scopedKey(source, scope),
          range.start,
          range.stop,
          zRangeOptions(range) as Parameters<RedisClientType["zRangeStore"]>[4],
        );
      });
    },
    zRem(k: string, members: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      const encoded = tupleArgToArray(members).map((v) => codec.encode(v));
      return queue(this, (tx) => {
        tx.zRem(scopedKey(k, scope), encoded);
      });
    },
    zRemRangeByLex(k: string, min: ZSetLexBoundary, max: ZSetLexBoundary) {
      return queue(this, (tx) => {
        tx.zRemRangeByLex(scopedKey(k, scope), min, max);
      });
    },
    zRemRangeByRank(k: string, start: number, stop: number) {
      return queue(this, (tx) => {
        tx.zRemRangeByRank(scopedKey(k, scope), start, stop);
      });
    },
    zRemRangeByScore(k: string, min: ZSetScoreBoundary, max: ZSetScoreBoundary) {
      return queue(this, (tx) => {
        tx.zRemRangeByScore(scopedKey(k, scope), min, max);
      });
    },
    zPopMin(k: string, count?: number, codec: RedisCodec<any> = codecs.string()) {
      return count === undefined
        ? queue(
            this,
            (tx) => {
              tx.zPopMin(scopedKey(k, scope));
            },
            (r) => {
              const entry = r as RawZEntry | null;
              return entry === null ? null : { value: codec.decode(entry.value), score: entry.score };
            },
          )
        : queue(
            this,
            (tx) => {
              tx.zPopMinCount(scopedKey(k, scope), count);
            },
            (r) => decodeZEntries(codec, r as RawZEntry[]),
          );
    },
    zPopMax(k: string, count?: number, codec: RedisCodec<any> = codecs.string()) {
      return count === undefined
        ? queue(
            this,
            (tx) => {
              tx.zPopMax(scopedKey(k, scope));
            },
            (r) => {
              const entry = r as RawZEntry | null;
              return entry === null ? null : { value: codec.decode(entry.value), score: entry.score };
            },
          )
        : queue(
            this,
            (tx) => {
              tx.zPopMaxCount(scopedKey(k, scope), count);
            },
            (r) => decodeZEntries(codec, r as RawZEntry[]),
          );
    },
    zMPop(
      ks: TupleArg<string>,
      direction: ZSetPopDirection,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return queue(
        this,
        (tx) => {
          tx.zmPop(keysArgument(ks, scope), direction, count === undefined ? undefined : { COUNT: count });
        },
        (r) => decodeZMPop(r as RawZMPop, codec, scope),
      );
    },
    zRandMember(k: string, codec: RedisCodec<any> = codecs.string(), opts?: ZSetRandMemberOptions) {
      if (opts?.withScores === true)
        return queue(
          this,
          (tx) => {
            tx.zRandMemberCountWithScores(scopedKey(k, scope), opts.count);
          },
          (r) => decodeZEntries(codec, r as RawZEntry[]),
        );
      if (opts !== undefined)
        return queue(
          this,
          (tx) => {
            tx.zRandMemberCount(scopedKey(k, scope), opts.count);
          },
          (r) => (r as string[]).map((v) => codec.decode(v)),
        );
      return queue(
        this,
        (tx) => {
          tx.zRandMember(scopedKey(k, scope));
        },
        (r) => (r === null ? null : codec.decode(r as string)),
      );
    },
    zScan(k: string, cursor: ScanCursor, codec: RedisCodec<any> = codecs.string(), opts?: ScanCommonOptions) {
      return queue(
        this,
        (tx) => {
          tx.zScan(scopedKey(k, scope), cursor, zScanOptions(opts));
        },
        (r) => {
          const page = r as { cursor: string; members: RawZEntry[] };
          return {
            cursor: page.cursor,
            items: decodeZEntries(codec, page.members),
          };
        },
      );
    },
    zDiff(ks: TupleArg<string>, codec: RedisCodec<any> = codecs.string(), opts?: { withScores?: boolean }) {
      return opts?.withScores === true
        ? queue(
            this,
            (tx) => {
              tx.zDiffWithScores(keysArgument(ks, scope));
            },
            (r) => decodeZEntries(codec, r as RawZEntry[]),
          )
        : queue(
            this,
            (tx) => {
              tx.zDiff(keysArgument(ks, scope));
            },
            (r) => (r as string[]).map((v) => codec.decode(v)),
          );
    },
    zDiffStore(destination: string, ks: TupleArg<string>) {
      return queue(this, (tx) => {
        tx.zDiffStore(scopedKey(destination, scope), keysArgument(ks, scope));
      });
    },
    zInter(
      inputs: TupleArg<ZSetInput<string>>,
      codec: RedisCodec<any> = codecs.string(),
      opts?: ZSetAggregateOptions<boolean>,
    ) {
      return opts?.withScores === true
        ? queue(
            this,
            (tx) => {
              tx.zInterWithScores(zInputs(inputs, scope), zAggregateOptions(opts));
            },
            (r) => decodeZEntries(codec, r as RawZEntry[]),
          )
        : queue(
            this,
            (tx) => {
              tx.zInter(zInputs(inputs, scope), zAggregateOptions(opts));
            },
            (r) => (r as string[]).map((v) => codec.decode(v)),
          );
    },
    zInterCard(ks: TupleArg<string>, limit?: number) {
      return queue(this, (tx) => {
        tx.zInterCard(keysArgument(ks, scope), limit);
      });
    },
    zInterStore(
      destination: string,
      inputs: TupleArg<ZSetInput<string>>,
      opts?: Omit<ZSetAggregateOptions, "withScores">,
    ) {
      return queue(this, (tx) => {
        tx.zInterStore(scopedKey(destination, scope), zInputs(inputs, scope), zAggregateOptions(opts));
      });
    },
    zUnion(
      inputs: TupleArg<ZSetInput<string>>,
      codec: RedisCodec<any> = codecs.string(),
      opts?: ZSetAggregateOptions<boolean>,
    ) {
      return opts?.withScores === true
        ? queue(
            this,
            (tx) => {
              tx.zUnionWithScores(zInputs(inputs, scope), zAggregateOptions(opts));
            },
            (r) => decodeZEntries(codec, r as RawZEntry[]),
          )
        : queue(
            this,
            (tx) => {
              tx.zUnion(zInputs(inputs, scope), zAggregateOptions(opts));
            },
            (r) => (r as string[]).map((v) => codec.decode(v)),
          );
    },
    zUnionStore(
      destination: string,
      inputs: TupleArg<ZSetInput<string>>,
      opts?: Omit<ZSetAggregateOptions, "withScores">,
    ) {
      return queue(this, (tx) => {
        tx.zUnionStore(scopedKey(destination, scope), zInputs(inputs, scope), zAggregateOptions(opts));
      });
    },
    bzMPop(
      ks: TupleArg<string>,
      direction: ZSetPopDirection,
      timeoutS: number,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return queue(
        this,
        (tx) => {
          tx.bzmPop(timeoutS, keysArgument(ks, scope), direction, count === undefined ? undefined : { COUNT: count });
        },
        (r) => decodeZMPop(r as RawZMPop, codec, scope),
      );
    },
    bzPopMin(ks: TupleArg<string>, timeoutS: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.bzPopMin(keysArgument(ks, scope), timeoutS);
        },
        (r) => decodeZPop(r as RawZPop, codec, scope),
      );
    },
    bzPopMax(ks: TupleArg<string>, timeoutS: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.bzPopMax(keysArgument(ks, scope), timeoutS);
        },
        (r) => decodeZPop(r as RawZPop, codec, scope),
      );
    },
  };
  return api as any;
}
