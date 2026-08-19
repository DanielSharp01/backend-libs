import type { RedisClientType } from "redis";

import { codecs, type CodecValue, type RedisCodec } from "../codec";
import { createTransactionQueue, type RedisTransaction, type RedisTransactionOperations } from "../transaction";
import { scopedKey, type RedisOperationOptions } from "../utils";

export interface RedisPublishConnection {
  publish<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    channel: string,
    message: CodecValue<TCodec>,
    codec?: TCodec,
  ): Promise<number>;
}

export interface RedisPublishTransaction<Output extends readonly unknown[] = []> {
  publish<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    channel: string,
    message: CodecValue<TCodec>,
    codec?: TCodec,
  ): RedisTransaction<[...Output, number]>;
}

export type RedisPublishClient = Pick<RedisClientType, "publish">;

export function connectionPublish(
  client: RedisPublishClient,
  options: RedisOperationOptions = {},
): RedisPublishConnection {
  return {
    async publish(channel: string, message: unknown, codec: RedisCodec<any> = codecs.string()) {
      return client.publish(scopedKey(channel, options.scope), codec.encode(message));
    },
  };
}

export function transactionPublish<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  options: RedisOperationOptions = {},
): RedisPublishTransaction<Output> {
  const queue = createTransactionQueue(operations);

  return {
    publish(channel: string, message: unknown, codec: RedisCodec<any> = codecs.string()) {
      return queue(this, (multi) => {
        multi.publish(scopedKey(channel, options.scope), codec.encode(message));
      });
    },
  };
}
