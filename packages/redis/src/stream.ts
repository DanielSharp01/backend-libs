import { Readable, type ReadableOptions } from "node:stream";

import type { EntriesOf, RedisEntriesCodec } from "./codec";
import type {
  RedisStreamConnection,
  StreamDeletedEntry,
  StreamEntry,
  StreamGroupReadInput,
  StreamReadBatch,
  StreamReadInput,
  StreamReadOptions,
} from "./operations/stream";
import { tupleArgToArray, type TupleArg, type TupleValue } from "./utils";

export interface ConsumeStreamOptions extends StreamReadOptions {
  signal?: AbortSignal;
}

export interface ConsumeGroupOptions extends StreamReadOptions {
  group: string;
  consumer: string;
  noAck?: boolean;
  signal?: AbortSignal;
}

type EntriesValue<TCodec extends RedisEntriesCodec<any, any>> = EntriesOf<TCodec>[number][1];

export interface StreamGroupConsumeBatch<Keys extends TupleArg<string>, Value = string> {
  key: Extract<TupleValue<Keys>, string>;
  entries: Array<StreamEntry<Value> | StreamDeletedEntry>;
}

function readOptions(opts: Pick<ConsumeStreamOptions, "blockMs" | "count">): StreamReadOptions {
  const result: StreamReadOptions = { blockMs: opts.blockMs ?? 5_000 };
  if (opts.count !== undefined) result.count = opts.count;
  return result;
}

export async function* consumeStream<
  const Inputs extends TupleArg<StreamReadInput<string>>,
  TCodec extends RedisEntriesCodec<any, any>,
>(
  connection: Pick<RedisStreamConnection, "xRead">,
  streams: Inputs,
  codec: TCodec,
  opts: ConsumeStreamOptions = {},
): AsyncGenerator<StreamReadBatch<Inputs, EntriesValue<TCodec>>> {
  const positions: Array<StreamReadInput<string>> = tupleArgToArray(streams).map(({ key, after }) => ({ key, after }));
  const commandOptions = readOptions(opts);

  while (!opts.signal?.aborted) {
    const batches = await connection.xRead(positions as unknown as Inputs, codec, commandOptions);
    if (opts.signal?.aborted) return;
    if (batches === null) continue;

    for (const batch of batches) {
      const lastEntry = batch.entries[batch.entries.length - 1];
      if (lastEntry !== undefined) {
        const position = positions.find(({ key }) => key === batch.key);
        if (position !== undefined) position.after = lastEntry.id;
      }
    }

    yield* batches;
  }
}

export async function* consumeGroup<const Keys extends TupleArg<string>, TCodec extends RedisEntriesCodec<any, any>>(
  connection: Pick<RedisStreamConnection, "xReadGroup">,
  keys: Keys,
  codec: TCodec,
  opts: ConsumeGroupOptions,
): AsyncGenerator<StreamGroupConsumeBatch<Keys, EntriesValue<TCodec>>> {
  const streams: Array<StreamGroupReadInput<string, ">">> = tupleArgToArray(keys).map((key) => ({ key, after: ">" }));
  const commandOptions = {
    ...readOptions(opts),
    ...(opts.noAck === undefined ? {} : { noAck: opts.noAck }),
  };

  while (!opts.signal?.aborted) {
    const batches = await connection.xReadGroup(opts.group, opts.consumer, streams, codec, commandOptions);
    if (opts.signal?.aborted) return;
    if (batches === null) continue;
    yield* batches as StreamGroupConsumeBatch<Keys, EntriesValue<TCodec>>[];
  }
}

export function toNodeReadable<T>(source: AsyncIterable<T>, opts: Omit<ReadableOptions, "objectMode"> = {}): Readable {
  return Readable.from(source, { ...opts, objectMode: true });
}
