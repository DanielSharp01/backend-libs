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

export type ListDirection = "LEFT" | "RIGHT";
export type ListInsertPosition = "BEFORE" | "AFTER";
export type ListPosOptions =
  | { rank?: number; count?: never; maxLen?: number }
  | { rank?: number; count: number; maxLen?: number };

export type ListPopResult<Keys extends TupleArg<string>, Value = string> = {
  key: TupleValue<Keys>;
  value: Value;
} | null;

type EntriesValue<TCodec extends RedisEntriesCodec<any, any>> = EntriesOf<TCodec>[number][1];
type StringEntriesCodec = RedisEntriesCodec<Record<string, string>, readonly (readonly [string, string])[]>;

export type ListMPopResult<Keys extends TupleArg<string>, Value = string> = {
  key: TupleValue<Keys>;
  values: Value[];
} | null;

export interface RedisListConnection {
  lIndex<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    index: number,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec> | null>;
  lInsert(
    key: string,
    position: ListInsertPosition,
    pivot: unknown,
    element: unknown,
    codec?: RedisCodec<any>,
  ): Promise<number>;
  lLen(key: string): Promise<number>;
  lMove<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    source: string,
    destination: string,
    sourceDirection: ListDirection,
    destinationDirection: ListDirection,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec> | null>;
  lMPop<Keys extends TupleArg<string>, TCodec extends RedisEntriesCodec<any, any> = StringEntriesCodec>(
    keys: Keys,
    direction: ListDirection,
    codec?: TCodec,
    count?: number,
  ): Promise<ListMPopResult<Keys, EntriesValue<TCodec>>>;
  lPop<TCodec extends RedisCodec<any> = RedisCodec<string>, Count extends number | undefined = undefined>(
    key: string,
    count?: Count,
    codec?: TCodec,
  ): Promise<Count extends number ? CodecValue<TCodec>[] : CodecValue<TCodec> | null>;
  lPos<Options extends ListPosOptions | undefined = undefined>(
    key: string,
    element: unknown,
    codec?: RedisCodec<any>,
    opts?: Options,
  ): Promise<Options extends { count: number } ? number[] : number | null>;
  lPush(key: string, elements: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<number>;
  lPushX(key: string, elements: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<number>;
  lRange<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    start: number,
    stop: number,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>[]>;
  lRem(key: string, count: number, element: unknown, codec?: RedisCodec<any>): Promise<number>;
  lSet(key: string, index: number, element: unknown, codec?: RedisCodec<any>): Promise<void>;
  lTrim(key: string, start: number, stop: number): Promise<void>;
  rPop<TCodec extends RedisCodec<any> = RedisCodec<string>, Count extends number | undefined = undefined>(
    key: string,
    count?: Count,
    codec?: TCodec,
  ): Promise<Count extends number ? CodecValue<TCodec>[] : CodecValue<TCodec> | null>;
  rPush(key: string, elements: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<number>;
  rPushX(key: string, elements: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<number>;
  blMove<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    source: string,
    destination: string,
    sourceDirection: ListDirection,
    destinationDirection: ListDirection,
    timeoutS: number,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec> | null>;
  blMPop<Keys extends TupleArg<string>, TCodec extends RedisEntriesCodec<any, any> = StringEntriesCodec>(
    keys: Keys,
    direction: ListDirection,
    timeoutS: number,
    codec?: TCodec,
    count?: number,
  ): Promise<ListMPopResult<Keys, EntriesValue<TCodec>>>;
  blPop<Keys extends TupleArg<string>, TCodec extends RedisCodec<any> = RedisCodec<string>>(
    keys: Keys,
    timeoutS: number,
    codec?: TCodec,
  ): Promise<ListPopResult<Keys, CodecValue<TCodec>>>;
  brPop<Keys extends TupleArg<string>, TCodec extends RedisCodec<any> = RedisCodec<string>>(
    keys: Keys,
    timeoutS: number,
    codec?: TCodec,
  ): Promise<ListPopResult<Keys, CodecValue<TCodec>>>;
}

export type RedisListTransaction<Output extends readonly unknown[] = []> = {
  [Key in keyof RedisListConnection]: (
    ...params: Parameters<RedisListConnection[Key]>
  ) => RedisTransaction<[...Output, Awaited<ReturnType<RedisListConnection[Key]>>]>;
};

export type RedisListClient = Pick<
  RedisClientType,
  | "lIndex"
  | "lInsert"
  | "lLen"
  | "lMove"
  | "lmPop"
  | "lPop"
  | "lPopCount"
  | "lPos"
  | "lPosCount"
  | "lPush"
  | "lPushX"
  | "lRange"
  | "lRem"
  | "lSet"
  | "lTrim"
  | "rPop"
  | "rPopCount"
  | "rPush"
  | "rPushX"
  | "blMove"
  | "blmPop"
  | "blPop"
  | "brPop"
>;

function listPosOptions(opts?: ListPosOptions) {
  if (opts?.rank === undefined && opts?.maxLen === undefined) return undefined;
  const result: { RANK?: number; MAXLEN?: number } = {};
  if (opts.rank !== undefined) result.RANK = opts.rank;
  if (opts.maxLen !== undefined) result.MAXLEN = opts.maxLen;
  return result;
}

type RawListMPop = readonly [string, string[]] | null;
type RawListPop = { key: string; element: string } | null;

function decodeNullable(codec: RedisCodec<any>, value: string | null) {
  return value === null ? null : codec.decode(value);
}

function decodeListMPop(reply: RawListMPop, codec: RedisEntriesCodec<any, any>, scope?: string) {
  if (reply === null) return null;
  const key = unscopedKey(reply[0], scope);
  return { key, values: reply[1].map((value) => decodeEntryValue(codec, key, value)) };
}

function decodeEntryValue(codec: RedisEntriesCodec<any, any>, key: string, value: string) {
  const decoded = codec.decode([[key, value]]);
  if (Array.isArray(decoded)) return decoded[0]?.[1];
  if (decoded instanceof Map) return decoded.get(key);
  return decoded[key];
}

function decodeListPop(reply: RawListPop, codec: RedisCodec<any>, scope?: string) {
  if (reply === null) return null;
  return { key: unscopedKey(reply.key, scope), value: codec.decode(reply.element) };
}

export function connectionList(client: RedisListClient, { scope }: RedisOperationOptions = {}): RedisListConnection {
  return {
    async lIndex(k, index, codec = codecs.string() as any) {
      return decodeNullable(codec, await client.lIndex(scopedKey(k, scope), index));
    },
    async lInsert(k, position, pivot, element, codec = codecs.string()) {
      return client.lInsert(scopedKey(k, scope), position, codec.encode(pivot), codec.encode(element));
    },
    lLen(k) {
      return client.lLen(scopedKey(k, scope));
    },
    async lMove(source, destination, sourceDirection, destinationDirection, codec = codecs.string() as any) {
      return decodeNullable(
        codec,
        await client.lMove(
          scopedKey(source, scope),
          scopedKey(destination, scope),
          sourceDirection,
          destinationDirection,
        ),
      );
    },
    async lMPop(
      ks: TupleArg<string>,
      direction: ListDirection,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return decodeListMPop(
        (await client.lmPop(
          keysArgument(ks, scope),
          direction,
          count === undefined ? undefined : { COUNT: count },
        )) as RawListMPop,
        codec,
        scope,
      ) as any;
    },
    async lPop(k, count, codec = codecs.string() as any) {
      return (
        count === undefined
          ? decodeNullable(codec, await client.lPop(scopedKey(k, scope)))
          : ((await client.lPopCount(scopedKey(k, scope), count))?.map((value) => codec.decode(value)) ?? [])
      ) as any;
    },
    async lPos(k, element, codec = codecs.string(), opts) {
      const encoded = codec.encode(element);
      return (
        opts?.count === undefined
          ? client.lPos(scopedKey(k, scope), encoded, listPosOptions(opts))
          : client.lPosCount(scopedKey(k, scope), encoded, opts.count, listPosOptions(opts))
      ) as any;
    },
    lPush(k, elements, codec = codecs.string()) {
      return client.lPush(
        scopedKey(k, scope),
        tupleArgToArray(elements).map((value) => codec.encode(value)),
      );
    },
    lPushX(k, elements, codec = codecs.string()) {
      return client.lPushX(
        scopedKey(k, scope),
        tupleArgToArray(elements).map((value) => codec.encode(value)),
      );
    },
    async lRange(k, start, stop, codec = codecs.string() as any) {
      return (await client.lRange(scopedKey(k, scope), start, stop)).map((value) => codec.decode(value));
    },
    lRem(k, count, element, codec = codecs.string()) {
      return client.lRem(scopedKey(k, scope), count, codec.encode(element));
    },
    async lSet(k, index, element, codec = codecs.string()) {
      await client.lSet(scopedKey(k, scope), index, codec.encode(element));
    },
    async lTrim(k, start, stop) {
      await client.lTrim(scopedKey(k, scope), start, stop);
    },
    async rPop(k, count, codec = codecs.string() as any) {
      return (
        count === undefined
          ? decodeNullable(codec, await client.rPop(scopedKey(k, scope)))
          : ((await client.rPopCount(scopedKey(k, scope), count))?.map((value) => codec.decode(value)) ?? [])
      ) as any;
    },
    rPush(k, elements, codec = codecs.string()) {
      return client.rPush(
        scopedKey(k, scope),
        tupleArgToArray(elements).map((value) => codec.encode(value)),
      );
    },
    rPushX(k, elements, codec = codecs.string()) {
      return client.rPushX(
        scopedKey(k, scope),
        tupleArgToArray(elements).map((value) => codec.encode(value)),
      );
    },
    async blMove(source, destination, sourceDirection, destinationDirection, timeoutS, codec = codecs.string() as any) {
      return decodeNullable(
        codec,
        await client.blMove(
          scopedKey(source, scope),
          scopedKey(destination, scope),
          sourceDirection,
          destinationDirection,
          timeoutS,
        ),
      );
    },
    async blMPop(
      ks: TupleArg<string>,
      direction: ListDirection,
      timeoutS: number,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return decodeListMPop(
        (await client.blmPop(
          timeoutS,
          keysArgument(ks, scope),
          direction,
          count === undefined ? undefined : { COUNT: count },
        )) as RawListMPop,
        codec,
        scope,
      ) as any;
    },
    async blPop(ks, timeoutS, codec = codecs.string() as any) {
      return decodeListPop(await client.blPop(keysArgument(ks, scope), timeoutS), codec, scope) as any;
    },
    async brPop(ks, timeoutS, codec = codecs.string() as any) {
      return decodeListPop(await client.brPop(keysArgument(ks, scope), timeoutS), codec, scope) as any;
    },
  };
}

export function transactionList<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  { scope }: RedisOperationOptions = {},
): RedisListTransaction<Output> {
  const queue = createTransactionQueue(operations);

  const api = {
    lIndex(k: string, index: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => tx.lIndex(scopedKey(k, scope), index),
        (reply) => decodeNullable(codec, reply as string | null),
      );
    },
    lInsert(
      k: string,
      position: ListInsertPosition,
      pivot: unknown,
      element: unknown,
      codec: RedisCodec<any> = codecs.string(),
    ) {
      const encodedPivot = codec.encode(pivot);
      const encodedElement = codec.encode(element);
      return queue(this, (tx) => tx.lInsert(scopedKey(k, scope), position, encodedPivot, encodedElement));
    },
    lLen(k: string) {
      return queue(this, (tx) => tx.lLen(scopedKey(k, scope)));
    },
    lMove(
      source: string,
      destination: string,
      sourceDirection: ListDirection,
      destinationDirection: ListDirection,
      codec: RedisCodec<any> = codecs.string(),
    ) {
      return queue(
        this,
        (tx) =>
          tx.lMove(scopedKey(source, scope), scopedKey(destination, scope), sourceDirection, destinationDirection),
        (reply) => decodeNullable(codec, reply as string | null),
      );
    },
    lMPop(
      ks: TupleArg<string>,
      direction: ListDirection,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return queue(
        this,
        (tx) => tx.lmPop(keysArgument(ks, scope), direction, count === undefined ? undefined : { COUNT: count }),
        (reply) => decodeListMPop(reply as RawListMPop, codec, scope),
      );
    },
    lPop(k: string, count?: number, codec: RedisCodec<any> = codecs.string()) {
      return count === undefined
        ? queue(
            this,
            (tx) => tx.lPop(scopedKey(k, scope)),
            (reply) => decodeNullable(codec, reply as string | null),
          )
        : queue(
            this,
            (tx) => tx.lPopCount(scopedKey(k, scope), count),
            (reply) => (reply as string[] | null)?.map((value) => codec.decode(value)) ?? [],
          );
    },
    lPos(k: string, element: unknown, codec: RedisCodec<any> = codecs.string(), opts?: ListPosOptions) {
      const encoded = codec.encode(element);
      return opts?.count === undefined
        ? queue(this, (tx) => tx.lPos(scopedKey(k, scope), encoded, listPosOptions(opts)))
        : queue(this, (tx) => tx.lPosCount(scopedKey(k, scope), encoded, opts.count, listPosOptions(opts)));
    },
    lPush(k: string, elements: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      const encoded = tupleArgToArray(elements).map((value) => codec.encode(value));
      return queue(this, (tx) => tx.lPush(scopedKey(k, scope), encoded));
    },
    lPushX(k: string, elements: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      const encoded = tupleArgToArray(elements).map((value) => codec.encode(value));
      return queue(this, (tx) => tx.lPushX(scopedKey(k, scope), encoded));
    },
    lRange(k: string, start: number, stop: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => tx.lRange(scopedKey(k, scope), start, stop),
        (reply) => (reply as string[]).map((value) => codec.decode(value)),
      );
    },
    lRem(k: string, count: number, element: unknown, codec: RedisCodec<any> = codecs.string()) {
      const encoded = codec.encode(element);
      return queue(this, (tx) => tx.lRem(scopedKey(k, scope), count, encoded));
    },
    lSet(k: string, index: number, element: unknown, codec: RedisCodec<any> = codecs.string()) {
      const encoded = codec.encode(element);
      return queue(
        this,
        (tx) => tx.lSet(scopedKey(k, scope), index, encoded),
        () => undefined,
      );
    },
    lTrim(k: string, start: number, stop: number) {
      return queue(
        this,
        (tx) => tx.lTrim(scopedKey(k, scope), start, stop),
        () => undefined,
      );
    },
    rPop(k: string, count?: number, codec: RedisCodec<any> = codecs.string()) {
      return count === undefined
        ? queue(
            this,
            (tx) => tx.rPop(scopedKey(k, scope)),
            (reply) => decodeNullable(codec, reply as string | null),
          )
        : queue(
            this,
            (tx) => tx.rPopCount(scopedKey(k, scope), count),
            (reply) => (reply as string[] | null)?.map((value) => codec.decode(value)) ?? [],
          );
    },
    rPush(k: string, elements: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      const encoded = tupleArgToArray(elements).map((value) => codec.encode(value));
      return queue(this, (tx) => tx.rPush(scopedKey(k, scope), encoded));
    },
    rPushX(k: string, elements: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      const encoded = tupleArgToArray(elements).map((value) => codec.encode(value));
      return queue(this, (tx) => tx.rPushX(scopedKey(k, scope), encoded));
    },
    blMove(
      source: string,
      destination: string,
      sourceDirection: ListDirection,
      destinationDirection: ListDirection,
      timeoutS: number,
      codec: RedisCodec<any> = codecs.string(),
    ) {
      return queue(
        this,
        (tx) =>
          tx.blMove(
            scopedKey(source, scope),
            scopedKey(destination, scope),
            sourceDirection,
            destinationDirection,
            timeoutS,
          ),
        (reply) => decodeNullable(codec, reply as string | null),
      );
    },
    blMPop(
      ks: TupleArg<string>,
      direction: ListDirection,
      timeoutS: number,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      count?: number,
    ) {
      return queue(
        this,
        (tx) =>
          tx.blmPop(timeoutS, keysArgument(ks, scope), direction, count === undefined ? undefined : { COUNT: count }),
        (reply) => decodeListMPop(reply as RawListMPop, codec, scope),
      );
    },
    blPop(ks: TupleArg<string>, timeoutS: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => tx.blPop(keysArgument(ks, scope), timeoutS),
        (reply) => decodeListPop(reply as RawListPop, codec, scope),
      );
    },
    brPop(ks: TupleArg<string>, timeoutS: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => tx.brPop(keysArgument(ks, scope), timeoutS),
        (reply) => decodeListPop(reply as RawListPop, codec, scope),
      );
    },
  };

  return api as RedisListTransaction<Output>;
}
