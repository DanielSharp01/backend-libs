import type { RedisClientType } from "redis";

import type { RedisGenericTransaction } from "./operations/generic";
import type { RedisHashTransaction } from "./operations/hash";
import type { RedisListTransaction } from "./operations/list";
import type { RedisPublishTransaction } from "./operations/publish";
import type { RedisSetTransaction } from "./operations/set";
import type { RedisStreamTransaction } from "./operations/stream";
import type { RedisStringTransaction } from "./operations/string";
import type { RedisZSetTransaction } from "./operations/zset";

export type RedisMulti = ReturnType<RedisClientType["multi"]>;

export interface RedisTransactionOperation {
  enqueue(transaction: RedisMulti): void;
  transform(reply: unknown): unknown;
}

export type RedisTransactionOperations = RedisTransactionOperation[];

export function transactionOperations(): RedisTransactionOperations {
  return [];
}

export function addTransactionOperation(
  operations: RedisTransactionOperations,
  enqueue: (transaction: RedisMulti) => void,
  transform: (reply: unknown) => unknown = (reply) => reply,
): void {
  operations.push({ enqueue, transform });
}

export function createTransactionQueue(operations: RedisTransactionOperations) {
  return (self: unknown, enqueue: (transaction: RedisMulti) => void, transform?: (reply: unknown) => unknown): any => {
    addTransactionOperation(operations, enqueue, transform);
    return self;
  };
}

export async function execTransactionOperations(
  client: Pick<RedisClientType, "multi">,
  operations: RedisTransactionOperations,
): Promise<unknown[]> {
  const queued = operations.splice(0);
  const transaction = client.multi();

  for (const operation of queued) {
    operation.enqueue(transaction);
  }

  const replies = (await transaction.exec()) as unknown[];

  return replies.map((reply, index) => {
    if (reply instanceof Error) {
      throw reply;
    }

    return queued[index]?.transform(reply);
  });
}

export type RedisTransaction<Output extends readonly unknown[] = []> = RedisGenericTransaction<Output> &
  RedisPublishTransaction<Output> &
  RedisStringTransaction<Output> &
  RedisHashTransaction<Output> &
  RedisListTransaction<Output> &
  RedisSetTransaction<Output> &
  RedisStreamTransaction<Output> &
  RedisZSetTransaction<Output> & {
    exec(): Promise<Output>;
  };
