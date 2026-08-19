import type { CodecValue, EntriesOf, RedisCodec, RedisEntriesCodec } from "./codec";
import type {
  RedisGenericConnection,
  ScanCommonOptions,
  ScanCursor,
  ScanOptions,
  ScanPage,
} from "./operations/generic";
import type { HashScanOptions, RedisHashConnection } from "./operations/hash";
import type { RedisSetConnection } from "./operations/set";
import type { RedisZSetConnection, ZSetEntry } from "./operations/zset";

export interface ScanIterationOptions {
  initialCursor?: ScanCursor;
  signal?: AbortSignal;
}

export type ScanIteratorOptions = ScanOptions & ScanIterationOptions;
export type CollectionScanIteratorOptions = ScanCommonOptions & ScanIterationOptions;
export type HashScanIteratorOptions<NoValues extends boolean = false> = HashScanOptions<NoValues> &
  ScanIterationOptions;

export async function* scanIterable<T>(
  readPage: (cursor: ScanCursor) => Promise<ScanPage<T>>,
  initialCursor: ScanCursor = "0",
  signal?: AbortSignal,
): AsyncGenerator<T> {
  let cursor = initialCursor;

  do {
    if (signal?.aborted) return;
    const page = await readPage(cursor);
    if (signal?.aborted) return;

    for (const item of page.items) {
      if (signal?.aborted) return;
      yield item;
    }

    cursor = page.cursor;
  } while (cursor !== "0");
}

export function scan(
  connection: Pick<RedisGenericConnection, "scan">,
  opts: ScanIteratorOptions = {},
): AsyncGenerator<string> {
  const { initialCursor = "0", signal, ...commandOptions } = opts;
  return scanIterable((cursor) => connection.scan(cursor, commandOptions), initialCursor, signal);
}

export function hScan<TCodec extends RedisEntriesCodec<any, any>, NoValues extends boolean = false>(
  connection: Pick<RedisHashConnection, "hScan">,
  key: string,
  codec: TCodec,
  opts: HashScanIteratorOptions<NoValues> = {},
): AsyncGenerator<NoValues extends true ? string : EntriesOf<TCodec>[number]> {
  const { initialCursor = "0", signal, ...commandOptions } = opts;
  return scanIterable(
    (cursor) => connection.hScan(key, cursor, codec, commandOptions),
    initialCursor,
    signal,
  ) as AsyncGenerator<NoValues extends true ? string : EntriesOf<TCodec>[number]>;
}

export function sScan<TCodec extends RedisCodec<any> = RedisCodec<string>>(
  connection: Pick<RedisSetConnection, "sScan">,
  key: string,
  codec?: TCodec,
  opts: CollectionScanIteratorOptions = {},
): AsyncGenerator<CodecValue<TCodec>> {
  const { initialCursor = "0", signal, ...commandOptions } = opts;
  return scanIterable((cursor) => connection.sScan(key, cursor, codec, commandOptions), initialCursor, signal);
}

export function zScan<TCodec extends RedisCodec<any> = RedisCodec<string>>(
  connection: Pick<RedisZSetConnection, "zScan">,
  key: string,
  codec?: TCodec,
  opts: CollectionScanIteratorOptions = {},
): AsyncGenerator<ZSetEntry<CodecValue<TCodec>>> {
  const { initialCursor = "0", signal, ...commandOptions } = opts;
  return scanIterable((cursor) => connection.zScan(key, cursor, codec, commandOptions), initialCursor, signal);
}
