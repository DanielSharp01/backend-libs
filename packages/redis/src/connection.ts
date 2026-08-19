import type { RedisClientType } from "redis";

import {
  connectionGeneric,
  transactionGeneric,
  type RedisGenericClient,
  type RedisGenericConnection,
} from "./operations/generic";
import { connectionHash, transactionHash, type RedisHashClient, type RedisHashConnection } from "./operations/hash";
import { connectionList, transactionList, type RedisListClient, type RedisListConnection } from "./operations/list";
import {
  connectionPublish,
  transactionPublish,
  type RedisPublishClient,
  type RedisPublishConnection,
} from "./operations/publish";
import { connectionSet, transactionSet, type RedisSetClient, type RedisSetConnection } from "./operations/set";
import {
  connectionStream,
  transactionStream,
  type RedisStreamClient,
  type RedisStreamConnection,
} from "./operations/stream";
import {
  connectionString,
  transactionString,
  type RedisStringClient,
  type RedisStringConnection,
} from "./operations/string";
import { connectionZSet, transactionZSet, type RedisZSetClient, type RedisZSetConnection } from "./operations/zset";
import { execTransactionOperations, transactionOperations, type RedisTransaction } from "./transaction";
import { combineRedisScope, type RedisOperationOptions } from "./utils";

export interface RedisConnectionCommands
  extends RedisGenericConnection,
    RedisPublishConnection,
    RedisStringConnection,
    RedisHashConnection,
    RedisListConnection,
    RedisSetConnection,
    RedisStreamConnection,
    RedisZSetConnection {}

export interface RedisConnection extends RedisConnectionCommands {
  multi(): RedisTransaction;
  scope(scope: string): RedisConnection;
}

export interface RedisConnectionOptions {
  onError: RedisErrorHandler;
  scope?: string | undefined;
}

export type RedisErrorHandler = (error: Error) => void;

type RedisConnectionClient = RedisGenericClient &
  RedisStringClient &
  RedisHashClient &
  RedisListClient &
  RedisSetClient &
  RedisStreamClient &
  RedisZSetClient &
  RedisPublishClient &
  Pick<RedisClientType, "multi" | "on">;

function connectionCommands(client: RedisConnectionClient, options: RedisOperationOptions): RedisConnectionCommands {
  return {
    ...connectionGeneric(client, options),
    ...connectionPublish(client, options),
    ...connectionString(client, options),
    ...connectionHash(client, options),
    ...connectionList(client, options),
    ...connectionSet(client, options),
    ...connectionStream(client, options),
    ...connectionZSet(client, options),
  };
}

function createRedisTransaction(client: RedisConnectionClient, options: RedisOperationOptions): RedisTransaction {
  const operations = transactionOperations();

  return {
    ...transactionGeneric(operations, options),
    ...transactionPublish(operations, options),
    ...transactionString(operations, options),
    ...transactionHash(operations, options),
    ...transactionList(operations, options),
    ...transactionSet(operations, options),
    ...transactionStream(operations, options),
    ...transactionZSet(operations, options),
    exec: () => execTransactionOperations(client, operations),
  } as RedisTransaction;
}

function connectionView(
  client: RedisConnectionClient,
  options: Omit<RedisConnectionOptions, "onError">,
): RedisConnection {
  return {
    ...connectionCommands(client, options),
    multi: () => createRedisTransaction(client, options),
    scope(scope) {
      return connectionView(client, {
        scope: combineRedisScope(options.scope, scope),
      });
    },
  };
}

export function createRedisConnection(client: RedisConnectionClient, options: RedisConnectionOptions): RedisConnection {
  client.on("error", options.onError);
  return connectionView(client, {
    scope: options.scope,
  });
}
