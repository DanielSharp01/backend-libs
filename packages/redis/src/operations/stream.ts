import type { RedisClientType } from "redis";
import { codecs, type CodecValue, type EntriesOf, type RedisCodec, type RedisEntriesCodec } from "../codec";
import { createTransactionQueue, type RedisTransaction, type RedisTransactionOperations } from "../transaction";
import {
  booleanReply,
  scopedKey,
  tupleArgToArray,
  unscopedKey,
  type RedisOperationOptions,
  type TupleArg,
} from "../utils";

export type StreamIdComponent = `${bigint}`;
export type StreamId = `${StreamIdComponent}-${StreamIdComponent}`;
export type StreamAddId = "*" | StreamId | `${StreamIdComponent}-*`;
export type StreamPosition = StreamId | StreamIdComponent;
export type StreamReadPosition = StreamPosition | "$";
export type StreamGroupReadPosition = StreamPosition | ">";
export type StreamRangeBoundary = StreamPosition | `(${StreamPosition}` | "-" | "+";

export interface StreamEntry<Value = string> {
  id: StreamId;
  value: Value;
}

export interface StreamDeletedEntry {
  id: StreamId;
  value: null;
}

export interface StreamReadInput<K extends PropertyKey, Position extends StreamReadPosition = StreamReadPosition> {
  key: K;
  after: Position;
}

export interface StreamGroupReadInput<
  K extends PropertyKey,
  Position extends StreamGroupReadPosition = StreamGroupReadPosition,
> {
  key: K;
  after: Position;
}

export type StreamInputKeys<Inputs> = Inputs extends readonly (infer Input)[]
  ? Input extends { key: infer K }
    ? K
    : never
  : Inputs extends { key: infer K }
    ? K
    : never;

type EntriesValue<TCodec extends RedisEntriesCodec<any, any>> = EntriesOf<TCodec>[number][1];
type StringEntriesCodec = RedisEntriesCodec<Record<string, string>, readonly (readonly [string, string])[]>;

export interface StreamReadBatch<Inputs, Value = string> {
  key: Extract<StreamInputKeys<Inputs>, string>;
  entries: StreamEntry<Value>[];
}

export interface StreamGroupReadBatch<Inputs, Value = string> {
  key: Extract<StreamInputKeys<Inputs>, string>;
  entries: Array<StreamEntry<Value> | StreamDeletedEntry>;
}

type StreamTrimMode =
  | {
      approximate?: false;
      limit?: never;
    }
  | {
      approximate: true;
      limit?: number;
    };

export type StreamTrimOptions =
  | (StreamTrimMode & {
      strategy: "MAXLEN";
      threshold: number;
    })
  | (StreamTrimMode & {
      strategy: "MINID";
      threshold: StreamPosition;
    });

export interface StreamAddOptions {
  id?: StreamAddId;
  noMkStream?: boolean;
  trim?: StreamTrimOptions;
}

export interface StreamReadOptions {
  count?: number;
  blockMs?: number;
}

export interface StreamReadGroupOptions extends StreamReadOptions {
  noAck?: boolean;
}

export type StreamClaimOptions<JustId extends boolean = false> = {
  idleMs?: number;
  timeMs?: number;
  retryCount?: number;
  force?: boolean;
  lastId?: StreamId;
  justId?: JustId;
};

export interface StreamAutoClaimResult<Value, JustId extends boolean> {
  nextId: StreamId;
  claimed: JustId extends true ? StreamId[] : StreamEntry<Value>[];
  deletedIds: StreamId[];
}

export interface StreamPendingConsumer {
  name: string;
  pending: number;
}

export interface StreamPendingSummary {
  pending: number;
  firstId: StreamId | null;
  lastId: StreamId | null;
  consumers: StreamPendingConsumer[] | null;
}

export interface StreamPendingOptions {
  start: StreamRangeBoundary;
  end: StreamRangeBoundary;
  count: number;
  minIdleMs?: number;
  consumer?: string;
}

export interface StreamPendingEntry {
  id: StreamId;
  consumer: string;
  idleMs: number;
  deliveries: number;
}

export interface StreamInfoConsumer {
  name: string;
  pending: number;
  idleMs: number;
  inactiveMs: number;
}

export interface StreamInfoGroup {
  name: string;
  consumers: number;
  pending: number;
  lastDeliveredId: StreamId;
  entriesRead: number | null;
  lag: number | null;
}

interface StreamInfoBase {
  length: number;
  radixTreeKeys: number;
  radixTreeNodes: number;
  lastGeneratedId: StreamId;
  maxDeletedEntryId: StreamId;
  entriesAdded: number;
  recordedFirstEntryId: StreamId;
}

export interface StreamInfo<Value = string> extends StreamInfoBase {
  groups: number;
  firstEntry: StreamEntry<Value> | null;
  lastEntry: StreamEntry<Value> | null;
}

export interface StreamInfoFullPendingEntry {
  id: StreamId;
  consumer: string;
  deliveredAtMs: number;
  deliveries: number;
}

export interface StreamInfoFullConsumerPendingEntry {
  id: StreamId;
  deliveredAtMs: number;
  deliveries: number;
}

export interface StreamInfoFullConsumer {
  name: string;
  seenAtMs: number;
  activeAtMs: number;
  pendingCount: number;
  pending: StreamInfoFullConsumerPendingEntry[];
}

export interface StreamInfoFullGroup {
  name: string;
  lastDeliveredId: StreamId;
  entriesRead: number | null;
  lag: number | null;
  pendingCount: number;
  pending: StreamInfoFullPendingEntry[];
  consumers: StreamInfoFullConsumer[];
}

export interface StreamInfoFull<Value = string> extends StreamInfoBase {
  entries: StreamEntry<Value>[];
  groups: StreamInfoFullGroup[];
}

export type StreamInfoOptions =
  | {
      full?: false;
      count?: never;
    }
  | {
      full: true;
      count?: number;
    };

export interface RedisStreamConnection {
  xAdd<TCodec extends RedisCodec<any> = RedisCodec<string>, Options extends StreamAddOptions | undefined = undefined>(
    key: string,
    value: CodecValue<TCodec>,
    codec?: TCodec,
    opts?: Options,
  ): Promise<Options extends { noMkStream: true } ? StreamId | null : StreamId>;
  xLen(key: string): Promise<number>;
  xDel(key: string, ids: TupleArg<StreamId>): Promise<number>;
  xTrim(key: string, opts: StreamTrimOptions): Promise<number>;

  xRange<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    start: StreamRangeBoundary,
    end: StreamRangeBoundary,
    codec?: TCodec,
    opts?: { count?: number },
  ): Promise<StreamEntry<CodecValue<TCodec>>[]>;
  xRevRange<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    start: StreamRangeBoundary,
    end: StreamRangeBoundary,
    codec?: TCodec,
    opts?: { count?: number },
  ): Promise<StreamEntry<CodecValue<TCodec>>[]>;
  xRead<
    Inputs extends TupleArg<StreamReadInput<string>>,
    TCodec extends RedisEntriesCodec<any, any> = StringEntriesCodec,
  >(
    streams: Inputs,
    codec?: TCodec,
    opts?: StreamReadOptions,
  ): Promise<StreamReadBatch<Inputs, EntriesValue<TCodec>>[] | null>;
  xReadGroup<
    Inputs extends TupleArg<StreamGroupReadInput<string>>,
    TCodec extends RedisEntriesCodec<any, any> = StringEntriesCodec,
  >(
    group: string,
    consumer: string,
    streams: Inputs,
    codec?: TCodec,
    opts?: StreamReadGroupOptions,
  ): Promise<StreamGroupReadBatch<Inputs, EntriesValue<TCodec>>[] | null>;

  xAck(key: string, group: string, ids: TupleArg<StreamId>): Promise<number>;
  xPending<Options extends StreamPendingOptions | undefined = undefined>(
    key: string,
    group: string,
    opts?: Options,
  ): Promise<Options extends StreamPendingOptions ? StreamPendingEntry[] : StreamPendingSummary>;
  xClaim<TCodec extends RedisCodec<any> = RedisCodec<string>, JustId extends boolean = false>(
    key: string,
    group: string,
    consumer: string,
    minIdleMs: number,
    ids: TupleArg<StreamId>,
    codec?: TCodec,
    opts?: StreamClaimOptions<JustId>,
  ): Promise<JustId extends true ? StreamId[] : StreamEntry<CodecValue<TCodec>>[]>;
  xAutoClaim<TCodec extends RedisCodec<any> = RedisCodec<string>, JustId extends boolean = false>(
    key: string,
    group: string,
    consumer: string,
    minIdleMs: number,
    start: StreamId,
    codec?: TCodec,
    opts?: {
      count?: number;
      justId?: JustId;
    },
  ): Promise<StreamAutoClaimResult<CodecValue<TCodec>, JustId>>;

  xGroupCreate(
    key: string,
    group: string,
    start: StreamPosition | "$",
    opts?: {
      mkStream?: boolean;
      entriesRead?: number;
    },
  ): Promise<void>;
  xGroupCreateConsumer(key: string, group: string, consumer: string): Promise<boolean>;
  xGroupDelConsumer(key: string, group: string, consumer: string): Promise<number>;
  xGroupDestroy(key: string, group: string): Promise<boolean>;
  xGroupSetId(key: string, group: string, id: StreamPosition | "$", opts?: { entriesRead?: number }): Promise<void>;

  xInfoConsumers(key: string, group: string): Promise<StreamInfoConsumer[]>;
  xInfoGroups(key: string): Promise<StreamInfoGroup[]>;
  xInfoStream<
    TCodec extends RedisCodec<any> = RedisCodec<string>,
    Options extends StreamInfoOptions | undefined = undefined,
  >(
    key: string,
    codec?: TCodec,
    opts?: Options,
  ): Promise<Options extends { full: true } ? StreamInfoFull<CodecValue<TCodec>> : StreamInfo<CodecValue<TCodec>>>;

  xSetId(
    key: string,
    lastId: StreamId,
    opts?: {
      entriesAdded?: number;
      maxDeletedId?: StreamId;
    },
  ): Promise<void>;
}

export type RedisStreamTransaction<Output extends readonly unknown[] = []> = {
  [Key in keyof RedisStreamConnection]: (
    ...params: Parameters<RedisStreamConnection[Key]>
  ) => RedisTransaction<[...Output, Awaited<ReturnType<RedisStreamConnection[Key]>>]>;
};

export type RedisStreamClient = RedisClientType;

const STREAM_VALUE_FIELD = "value";

type RawStreamBody = ReadonlyMap<string, string> | Record<string, string> | readonly string[] | null;
type RawStreamMessage =
  | {
      id: string;
      message: RawStreamBody;
    }
  | readonly [id: string, message: RawStreamBody]
  | null;
type RawStreamBatch = { name: string; messages: RawStreamMessage[] };

function streamMessageParts(entry: Exclude<RawStreamMessage, null>) {
  return Array.isArray(entry)
    ? { id: String(entry[0]), message: entry[1] as RawStreamBody }
    : (entry as { id: string; message: RawStreamBody });
}

function streamMessageValue(message: RawStreamBody): string {
  if (Array.isArray(message)) {
    for (let index = 0; index < message.length; index += 2) {
      if (message[index] === STREAM_VALUE_FIELD) return String(message[index + 1]);
    }
  }
  const value =
    message instanceof Map
      ? message.get(STREAM_VALUE_FIELD)
      : (message as Record<string, string> | null)?.[STREAM_VALUE_FIELD];
  if (value === undefined) throw new TypeError(`Stream entry is missing the ${STREAM_VALUE_FIELD} field`);
  return value;
}

function decodeStreamEntry(codec: RedisCodec<any>, entry: Exclude<RawStreamMessage, null>) {
  const { id, message } = streamMessageParts(entry);
  return { id, value: codec.decode(streamMessageValue(message)) };
}

function decodeEntryValue(codec: RedisEntriesCodec<any, any>, key: string, value: string) {
  const decoded = codec.decode([[key, value]]);
  if (Array.isArray(decoded)) return decoded[0]?.[1];
  if (decoded instanceof Map) return decoded.get(key);
  return decoded[key];
}

function decodeStreamEntries(codec: RedisCodec<any>, entries: readonly RawStreamMessage[]) {
  return entries.flatMap((entry) => (entry === null ? [] : [decodeStreamEntry(codec, entry)]));
}

function decodeStreamBatches(
  batches: RawStreamBatch[] | null,
  codec: RedisEntriesCodec<any, any>,
  scope: string | undefined,
  allowDeleted: boolean,
) {
  if (batches === null) return null;
  return batches.map((batch) => {
    const key = unscopedKey(batch.name, scope);
    return {
      key,
      entries: batch.messages.flatMap((entry) => {
        if (entry === null) return [];
        const parts = streamMessageParts(entry);
        return [
          allowDeleted && parts.message === null
            ? { id: parts.id, value: null }
            : { id: parts.id, value: decodeEntryValue(codec, key, streamMessageValue(parts.message)) },
        ];
      }),
    };
  });
}

function streamTrimOptions(opts: StreamTrimOptions) {
  const result: { strategyModifier?: "=" | "~"; LIMIT?: number } = {
    strategyModifier: opts.approximate === true ? "~" : "=",
  };
  if (opts.limit !== undefined) result.LIMIT = opts.limit;
  return result;
}

function streamAddOptions(opts?: StreamAddOptions) {
  if (opts?.trim === undefined) return undefined;
  const trim: {
    strategy: "MAXLEN" | "MINID";
    strategyModifier: "=" | "~";
    threshold: number | string;
    limit?: number;
  } = {
    strategy: opts.trim.strategy,
    strategyModifier: opts.trim.approximate === true ? "~" : "=",
    threshold: opts.trim.threshold,
  };
  if (opts.trim.limit !== undefined) trim.limit = opts.trim.limit;
  return { TRIM: trim };
}

function streamReadOptions(opts?: StreamReadOptions) {
  if (opts?.count === undefined && opts?.blockMs === undefined) return undefined;
  const result: { COUNT?: number; BLOCK?: number } = {};
  if (opts.count !== undefined) result.COUNT = opts.count;
  if (opts.blockMs !== undefined) result.BLOCK = opts.blockMs;
  return result;
}

function streamReadGroupOptions(opts?: StreamReadGroupOptions) {
  const result = streamReadOptions(opts) as { COUNT?: number; BLOCK?: number; NOACK?: boolean } | undefined;
  if (opts?.noAck === undefined) return result;
  return { ...result, NOACK: opts.noAck };
}

function streamClaimOptions(opts?: StreamClaimOptions<boolean>) {
  if (opts === undefined) return undefined;
  const result: {
    IDLE?: number;
    TIME?: number;
    RETRYCOUNT?: number;
    FORCE?: boolean;
    LASTID?: string;
  } = {};
  if (opts.idleMs !== undefined) result.IDLE = opts.idleMs;
  if (opts.timeMs !== undefined) result.TIME = opts.timeMs;
  if (opts.retryCount !== undefined) result.RETRYCOUNT = opts.retryCount;
  if (opts.force !== undefined) result.FORCE = opts.force;
  if (opts.lastId !== undefined) result.LASTID = opts.lastId;
  return result;
}

function streamGroupOptions(opts?: { mkStream?: boolean; entriesRead?: number }) {
  if (opts === undefined) return undefined;
  const result: { MKSTREAM?: boolean; ENTRIESREAD?: number } = {};
  if (opts.mkStream !== undefined) result.MKSTREAM = opts.mkStream;
  if (opts.entriesRead !== undefined) result.ENTRIESREAD = opts.entriesRead;
  return result;
}

function streamPendingOptions(opts: StreamPendingOptions) {
  const result: { IDLE?: number; consumer?: string } = {};
  if (opts.minIdleMs !== undefined) result.IDLE = opts.minIdleMs;
  if (opts.consumer !== undefined) result.consumer = opts.consumer;
  return result;
}

function streamSetIdOptions(opts?: { entriesAdded?: number; maxDeletedId?: StreamId }) {
  if (opts === undefined) return undefined;
  const result: { ENTRIESADDED?: number; MAXDELETEDID?: string } = {};
  if (opts.entriesAdded !== undefined) result.ENTRIESADDED = opts.entriesAdded;
  if (opts.maxDeletedId !== undefined) result.MAXDELETEDID = opts.maxDeletedId;
  return result;
}

function objectValue(value: unknown, name: string): unknown {
  if (value instanceof Map) return value.get(name);
  return (value as Record<string, unknown>)[name];
}

function baseStreamInfo(value: unknown) {
  return {
    length: Number(objectValue(value, "length")),
    radixTreeKeys: Number(objectValue(value, "radix-tree-keys")),
    radixTreeNodes: Number(objectValue(value, "radix-tree-nodes")),
    lastGeneratedId: String(objectValue(value, "last-generated-id")),
    maxDeletedEntryId: String(objectValue(value, "max-deleted-entry-id")),
    entriesAdded: Number(objectValue(value, "entries-added")),
    recordedFirstEntryId: String(objectValue(value, "recorded-first-entry-id")),
  };
}

function flatReplyObject(value: unknown): Record<string, unknown> {
  if (value instanceof Map) return Object.fromEntries(value);
  if (!Array.isArray(value)) return value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (let index = 0; index < value.length; index += 2) result[String(value[index])] = value[index + 1];
  return result;
}

function decodeStreamInfo(codec: RedisCodec<any>, value: unknown) {
  const first = objectValue(value, "first-entry") as RawStreamMessage;
  const last = objectValue(value, "last-entry") as RawStreamMessage;
  return {
    ...baseStreamInfo(value),
    groups: Number(objectValue(value, "groups")),
    firstEntry: first === null ? null : decodeStreamEntry(codec, first),
    lastEntry: last === null ? null : decodeStreamEntry(codec, last),
  };
}

function decodeStreamInfoFull(codec: RedisCodec<any>, raw: unknown) {
  const value = flatReplyObject(raw);
  const groups = ((value.groups as unknown[] | undefined) ?? []).map((rawGroup) => {
    const group = flatReplyObject(rawGroup);
    return {
      name: String(group.name),
      lastDeliveredId: String(group["last-delivered-id"]),
      entriesRead: group["entries-read"] === null ? null : Number(group["entries-read"]),
      lag: group.lag === null ? null : Number(group.lag),
      pendingCount: Number(group["pel-count"]),
      pending: ((group.pending as unknown[] | undefined) ?? []).map((entry) => {
        const tuple = entry as [string, string, number, number];
        return {
          id: tuple[0],
          consumer: tuple[1],
          deliveredAtMs: Number(tuple[2]),
          deliveries: Number(tuple[3]),
        };
      }),
      consumers: ((group.consumers as unknown[] | undefined) ?? []).map((rawConsumer) => {
        const consumer = flatReplyObject(rawConsumer);
        return {
          name: String(consumer.name),
          seenAtMs: Number(consumer["seen-time"]),
          activeAtMs: Number(consumer["active-time"]),
          pendingCount: Number(consumer["pel-count"]),
          pending: ((consumer.pending as unknown[] | undefined) ?? []).map((entry) => {
            const tuple = entry as [string, number, number];
            return {
              id: tuple[0],
              deliveredAtMs: Number(tuple[1]),
              deliveries: Number(tuple[2]),
            };
          }),
        };
      }),
    };
  });
  return {
    ...baseStreamInfo(value),
    entries: decodeStreamEntries(codec, value.entries as RawStreamMessage[]),
    groups,
  };
}

function xInfoFullArguments(key: string, count?: number): string[] {
  const args = ["XINFO", "STREAM", key, "FULL"];
  if (count !== undefined) args.push("COUNT", String(count));
  return args;
}

export function connectionStream(
  client: RedisStreamClient,
  { scope }: RedisOperationOptions = {},
): RedisStreamConnection {
  return {
    async xAdd(k, value, codec = codecs.string() as any, opts) {
      const args = [
        scopedKey(k, scope),
        opts?.id ?? "*",
        { [STREAM_VALUE_FIELD]: codec.encode(value) },
        streamAddOptions(opts) as Parameters<RedisClientType["xAdd"]>[3],
      ] as const;
      return (opts?.noMkStream === true ? client.xAddNoMkStream(...args) : client.xAdd(...args)) as any;
    },
    async xLen(k) {
      return client.xLen(scopedKey(k, scope));
    },
    async xDel(k, ids) {
      return client.xDel(scopedKey(k, scope), tupleArgToArray(ids));
    },
    async xTrim(k, opts) {
      return client.xTrim(scopedKey(k, scope), opts.strategy, opts.threshold, streamTrimOptions(opts));
    },
    async xRange(k, start, end, codec = codecs.string() as any, opts) {
      return decodeStreamEntries(
        codec,
        await client.xRange(
          scopedKey(k, scope),
          start,
          end,
          opts?.count === undefined ? undefined : { COUNT: opts.count },
        ),
      ) as any;
    },
    async xRevRange(k, start, end, codec = codecs.string() as any, opts) {
      return decodeStreamEntries(
        codec,
        await client.xRevRange(
          scopedKey(k, scope),
          start,
          end,
          opts?.count === undefined ? undefined : { COUNT: opts.count },
        ),
      ) as any;
    },
    async xRead(
      streams: TupleArg<StreamReadInput<string>>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      opts?: StreamReadOptions,
    ) {
      const inputs = tupleArgToArray(streams).map((stream) => ({
        key: scopedKey(stream.key, scope),
        id: stream.after,
      }));
      return decodeStreamBatches(
        (await client.xRead(inputs, streamReadOptions(opts))) as RawStreamBatch[] | null,
        codec,
        scope,
        false,
      ) as any;
    },
    async xReadGroup(
      group: string,
      consumer: string,
      streams: TupleArg<StreamGroupReadInput<string>>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      opts?: StreamReadGroupOptions,
    ) {
      const inputs = tupleArgToArray(streams).map((stream) => ({
        key: scopedKey(stream.key, scope),
        id: stream.after,
      }));
      return decodeStreamBatches(
        (await client.xReadGroup(group, consumer, inputs, streamReadGroupOptions(opts))) as RawStreamBatch[] | null,
        codec,
        scope,
        true,
      ) as any;
    },
    async xAck(k, group, ids) {
      return client.xAck(scopedKey(k, scope), group, tupleArgToArray(ids));
    },
    async xPending(k, group, opts) {
      if (opts !== undefined)
        return (
          await client.xPendingRange(
            scopedKey(k, scope),
            group,
            opts.start,
            opts.end,
            opts.count,
            streamPendingOptions(opts),
          )
        ).map((entry) => ({
          id: entry.id,
          consumer: entry.consumer,
          idleMs: entry.millisecondsSinceLastDelivery,
          deliveries: entry.deliveriesCounter,
        })) as any;
      const reply = await client.xPending(scopedKey(k, scope), group);
      return {
        pending: reply.pending,
        firstId: reply.firstId,
        lastId: reply.lastId,
        consumers:
          reply.consumers?.map((consumer) => ({
            name: consumer.name,
            pending: consumer.deliveriesCounter,
          })) ?? null,
      } as any;
    },
    async xClaim(k, group, consumer, minIdleMs, ids, codec = codecs.string() as any, opts) {
      const args = [
        scopedKey(k, scope),
        group,
        consumer,
        minIdleMs,
        tupleArgToArray(ids),
        streamClaimOptions(opts),
      ] as const;
      return (
        opts?.justId === true
          ? client.xClaimJustId(...args)
          : decodeStreamEntries(codec, (await client.xClaim(...args)) as RawStreamMessage[])
      ) as any;
    },
    async xAutoClaim(k, group, consumer, minIdleMs, start, codec = codecs.string() as any, opts) {
      const args = [
        scopedKey(k, scope),
        group,
        consumer,
        minIdleMs,
        start,
        opts?.count === undefined ? undefined : { COUNT: opts.count },
      ] as const;
      const reply = opts?.justId === true ? await client.xAutoClaimJustId(...args) : await client.xAutoClaim(...args);
      return {
        nextId: reply.nextId,
        claimed:
          opts?.justId === true ? reply.messages : decodeStreamEntries(codec, reply.messages as RawStreamMessage[]),
        deletedIds: reply.deletedMessages,
      } as any;
    },
    async xGroupCreate(k, group, start, opts) {
      await client.xGroupCreate(scopedKey(k, scope), group, start, streamGroupOptions(opts));
    },
    async xGroupCreateConsumer(k, group, consumer) {
      return booleanReply(await client.xGroupCreateConsumer(scopedKey(k, scope), group, consumer));
    },
    async xGroupDelConsumer(k, group, consumer) {
      return client.xGroupDelConsumer(scopedKey(k, scope), group, consumer);
    },
    async xGroupDestroy(k, group) {
      return booleanReply(await client.xGroupDestroy(scopedKey(k, scope), group));
    },
    async xGroupSetId(k, group, id, opts) {
      await client.xGroupSetId(
        scopedKey(k, scope),
        group,
        id,
        opts?.entriesRead === undefined ? undefined : { ENTRIESREAD: opts.entriesRead },
      );
    },
    async xInfoConsumers(k, group) {
      return (await client.xInfoConsumers(scopedKey(k, scope), group)).map((entry) => ({
        name: entry.name,
        pending: entry.pending,
        idleMs: entry.idle,
        inactiveMs: entry.inactive,
      }));
    },
    async xInfoGroups(k) {
      return (await client.xInfoGroups(scopedKey(k, scope))).map((entry) => ({
        name: entry.name,
        consumers: entry.consumers,
        pending: entry.pending,
        lastDeliveredId: String(entry["last-delivered-id"]),
        entriesRead: entry["entries-read"],
        lag: entry.lag,
      })) as any;
    },
    async xInfoStream(k, codec = codecs.string() as any, opts) {
      return (
        opts?.full === true
          ? decodeStreamInfoFull(codec, await client.sendCommand(xInfoFullArguments(scopedKey(k, scope), opts.count)))
          : decodeStreamInfo(codec, await client.xInfoStream(scopedKey(k, scope)))
      ) as any;
    },
    async xSetId(k, lastId, opts) {
      await client.xSetId(scopedKey(k, scope), lastId, streamSetIdOptions(opts));
    },
  };
}

export function transactionStream<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  { scope }: RedisOperationOptions = {},
): RedisStreamTransaction<Output> {
  const queue = createTransactionQueue(operations);
  const api = {
    xAdd(k: string, value: unknown, codec: RedisCodec<any> = codecs.string(), opts?: StreamAddOptions) {
      const args = [
        scopedKey(k, scope),
        opts?.id ?? "*",
        { [STREAM_VALUE_FIELD]: codec.encode(value) },
        streamAddOptions(opts) as Parameters<RedisClientType["xAdd"]>[3],
      ] as const;
      return opts?.noMkStream === true
        ? queue(this, (tx) => {
            tx.xAddNoMkStream(...args);
          })
        : queue(this, (tx) => {
            tx.xAdd(...args);
          });
    },
    xLen(k: string) {
      return queue(this, (tx) => {
        tx.xLen(scopedKey(k, scope));
      });
    },
    xDel(k: string, ids: TupleArg<StreamId>) {
      return queue(this, (tx) => {
        tx.xDel(scopedKey(k, scope), tupleArgToArray(ids));
      });
    },
    xTrim(k: string, opts: StreamTrimOptions) {
      return queue(this, (tx) => {
        tx.xTrim(scopedKey(k, scope), opts.strategy, opts.threshold, streamTrimOptions(opts));
      });
    },
    xRange(
      k: string,
      start: StreamRangeBoundary,
      end: StreamRangeBoundary,
      codec: RedisCodec<any> = codecs.string(),
      opts?: { count?: number },
    ) {
      return queue(
        this,
        (tx) => {
          tx.xRange(scopedKey(k, scope), start, end, opts?.count === undefined ? undefined : { COUNT: opts.count });
        },
        (r) => decodeStreamEntries(codec, r as RawStreamMessage[]),
      );
    },
    xRevRange(
      k: string,
      start: StreamRangeBoundary,
      end: StreamRangeBoundary,
      codec: RedisCodec<any> = codecs.string(),
      opts?: { count?: number },
    ) {
      return queue(
        this,
        (tx) => {
          tx.xRevRange(scopedKey(k, scope), start, end, opts?.count === undefined ? undefined : { COUNT: opts.count });
        },
        (r) => decodeStreamEntries(codec, r as RawStreamMessage[]),
      );
    },
    xRead(
      streams: TupleArg<StreamReadInput<string>>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      opts?: StreamReadOptions,
    ) {
      const inputs = tupleArgToArray(streams).map((stream) => ({
        key: scopedKey(stream.key, scope),
        id: stream.after,
      }));
      return queue(
        this,
        (tx) => {
          tx.xRead(inputs, streamReadOptions(opts));
        },
        (r) => decodeStreamBatches(r as RawStreamBatch[] | null, codec, scope, false),
      );
    },
    xReadGroup(
      group: string,
      consumer: string,
      streams: TupleArg<StreamGroupReadInput<string>>,
      codec: RedisEntriesCodec<any, any> = codecs.entries(codecs.string()).entries(),
      opts?: StreamReadGroupOptions,
    ) {
      const inputs = tupleArgToArray(streams).map((stream) => ({
        key: scopedKey(stream.key, scope),
        id: stream.after,
      }));
      return queue(
        this,
        (tx) => {
          tx.xReadGroup(group, consumer, inputs, streamReadGroupOptions(opts));
        },
        (r) => decodeStreamBatches(r as RawStreamBatch[] | null, codec, scope, true),
      );
    },
    xAck(k: string, group: string, ids: TupleArg<StreamId>) {
      return queue(this, (tx) => {
        tx.xAck(scopedKey(k, scope), group, tupleArgToArray(ids));
      });
    },
    xPending(k: string, group: string, opts?: StreamPendingOptions) {
      if (opts !== undefined)
        return queue(
          this,
          (tx) => {
            tx.xPendingRange(scopedKey(k, scope), group, opts.start, opts.end, opts.count, streamPendingOptions(opts));
          },
          (r) =>
            (
              r as Array<{
                id: string;
                consumer: string;
                millisecondsSinceLastDelivery: number;
                deliveriesCounter: number;
              }>
            ).map((entry) => ({
              id: entry.id,
              consumer: entry.consumer,
              idleMs: entry.millisecondsSinceLastDelivery,
              deliveries: entry.deliveriesCounter,
            })),
        );
      return queue(
        this,
        (tx) => {
          tx.xPending(scopedKey(k, scope), group);
        },
        (r) => {
          const reply = r as {
            pending: number;
            firstId: string | null;
            lastId: string | null;
            consumers: Array<{
              name: string;
              deliveriesCounter: number;
            }> | null;
          };
          return {
            pending: reply.pending,
            firstId: reply.firstId,
            lastId: reply.lastId,
            consumers:
              reply.consumers?.map((consumer) => ({
                name: consumer.name,
                pending: consumer.deliveriesCounter,
              })) ?? null,
          };
        },
      );
    },
    xClaim(
      k: string,
      group: string,
      consumer: string,
      minIdleMs: number,
      ids: TupleArg<StreamId>,
      codec: RedisCodec<any> = codecs.string(),
      opts?: StreamClaimOptions<boolean>,
    ) {
      const args = [
        scopedKey(k, scope),
        group,
        consumer,
        minIdleMs,
        tupleArgToArray(ids),
        streamClaimOptions(opts),
      ] as const;
      return opts?.justId === true
        ? queue(this, (tx) => {
            tx.xClaimJustId(...args);
          })
        : queue(
            this,
            (tx) => {
              tx.xClaim(...args);
            },
            (r) => decodeStreamEntries(codec, r as RawStreamMessage[]),
          );
    },
    xAutoClaim(
      k: string,
      group: string,
      consumer: string,
      minIdleMs: number,
      start: StreamId,
      codec: RedisCodec<any> = codecs.string(),
      opts?: { count?: number; justId?: boolean },
    ) {
      const args = [
        scopedKey(k, scope),
        group,
        consumer,
        minIdleMs,
        start,
        opts?.count === undefined ? undefined : { COUNT: opts.count },
      ] as const;
      return opts?.justId === true
        ? queue(
            this,
            (tx) => {
              tx.xAutoClaimJustId(...args);
            },
            (r) => {
              const reply = r as {
                nextId: string;
                messages: string[];
                deletedMessages: string[];
              };
              return {
                nextId: reply.nextId,
                claimed: reply.messages,
                deletedIds: reply.deletedMessages,
              };
            },
          )
        : queue(
            this,
            (tx) => {
              tx.xAutoClaim(...args);
            },
            (r) => {
              const reply = r as {
                nextId: string;
                messages: RawStreamMessage[];
                deletedMessages: string[];
              };
              return {
                nextId: reply.nextId,
                claimed: decodeStreamEntries(codec, reply.messages),
                deletedIds: reply.deletedMessages,
              };
            },
          );
    },
    xGroupCreate(
      k: string,
      group: string,
      start: StreamPosition | "$",
      opts?: { mkStream?: boolean; entriesRead?: number },
    ) {
      return queue(
        this,
        (tx) => {
          tx.xGroupCreate(scopedKey(k, scope), group, start, streamGroupOptions(opts));
        },
        () => undefined,
      );
    },
    xGroupCreateConsumer(k: string, group: string, consumer: string) {
      return queue(
        this,
        (tx) => {
          tx.xGroupCreateConsumer(scopedKey(k, scope), group, consumer);
        },
        (r) => booleanReply(r as number),
      );
    },
    xGroupDelConsumer(k: string, group: string, consumer: string) {
      return queue(this, (tx) => {
        tx.xGroupDelConsumer(scopedKey(k, scope), group, consumer);
      });
    },
    xGroupDestroy(k: string, group: string) {
      return queue(
        this,
        (tx) => {
          tx.xGroupDestroy(scopedKey(k, scope), group);
        },
        (r) => booleanReply(r as number),
      );
    },
    xGroupSetId(k: string, group: string, id: StreamPosition | "$", opts?: { entriesRead?: number }) {
      return queue(
        this,
        (tx) => {
          tx.xGroupSetId(
            scopedKey(k, scope),
            group,
            id,
            opts?.entriesRead === undefined ? undefined : { ENTRIESREAD: opts.entriesRead },
          );
        },
        () => undefined,
      );
    },
    xInfoConsumers(k: string, group: string) {
      return queue(
        this,
        (tx) => {
          tx.xInfoConsumers(scopedKey(k, scope), group);
        },
        (r) =>
          (
            r as Array<{
              name: string;
              pending: number;
              idle: number;
              inactive: number;
            }>
          ).map((entry) => ({
            name: entry.name,
            pending: entry.pending,
            idleMs: entry.idle,
            inactiveMs: entry.inactive,
          })),
      );
    },
    xInfoGroups(k: string) {
      return queue(
        this,
        (tx) => {
          tx.xInfoGroups(scopedKey(k, scope));
        },
        (r) =>
          (
            r as Array<{
              name: string;
              consumers: number;
              pending: number;
              "last-delivered-id": string;
              "entries-read": number | null;
              lag: number | null;
            }>
          ).map((entry) => ({
            name: entry.name,
            consumers: entry.consumers,
            pending: entry.pending,
            lastDeliveredId: entry["last-delivered-id"],
            entriesRead: entry["entries-read"],
            lag: entry.lag,
          })),
      );
    },
    xInfoStream(k: string, codec: RedisCodec<any> = codecs.string(), opts?: StreamInfoOptions) {
      return opts?.full === true
        ? queue(
            this,
            (tx) => {
              tx.sendCommand(xInfoFullArguments(scopedKey(k, scope), opts.count));
            },
            (r) => decodeStreamInfoFull(codec, r),
          )
        : queue(
            this,
            (tx) => {
              tx.xInfoStream(scopedKey(k, scope));
            },
            (r) => decodeStreamInfo(codec, r),
          );
    },
    xSetId(k: string, lastId: StreamId, opts?: { entriesAdded?: number; maxDeletedId?: StreamId }) {
      return queue(
        this,
        (tx) => {
          tx.xSetId(scopedKey(k, scope), lastId, streamSetIdOptions(opts));
        },
        () => undefined,
      );
    },
  };
  return api as any;
}
