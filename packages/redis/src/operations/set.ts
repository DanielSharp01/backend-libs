import type { RedisClientType } from "redis";
import { createTransactionQueue, type RedisTransaction, type RedisTransactionOperations } from "../transaction";
import {
  booleanReply,
  keysArgument,
  scopedKey,
  tupleArgToArray,
  type RedisOperationOptions,
  type TupleArg,
} from "../utils";
import type { ScanCommonOptions, ScanCursor, ScanPage } from "./generic";
import { codecs, type CodecValue, type RedisCodec } from "../codec";

export interface RedisSetConnection {
  sAdd(key: string, members: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<number>;
  sCard(key: string): Promise<number>;
  sIsMember(key: string, member: unknown, codec?: RedisCodec<any>): Promise<boolean>;
  sMIsMember(key: string, members: unknown[], codec?: RedisCodec<any>): Promise<boolean[]>;
  sMembers<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>[]>;
  sMove(source: string, destination: string, member: unknown, codec?: RedisCodec<any>): Promise<boolean>;
  sPop<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec> | null>;
  sPopCount<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    count: number,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>[]>;
  sRandMember<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec> | null>;
  sRandMemberCount<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    count: number,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>[]>;
  sRem(key: string, members: TupleArg<unknown>, codec?: RedisCodec<any>): Promise<number>;
  sScan<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    key: string,
    cursor: ScanCursor,
    codec?: TCodec,
    opts?: ScanCommonOptions,
  ): Promise<ScanPage<CodecValue<TCodec>>>;

  sDiff<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    keys: TupleArg<string>,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>[]>;
  sDiffStore(destination: string, keys: TupleArg<string>): Promise<number>;
  sInter<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    keys: TupleArg<string>,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>[]>;
  sInterCard(keys: TupleArg<string>, limit?: number): Promise<number>;
  sInterStore(destination: string, keys: TupleArg<string>): Promise<number>;
  sUnion<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    keys: TupleArg<string>,
    codec?: TCodec,
  ): Promise<CodecValue<TCodec>[]>;
  sUnionStore(destination: string, keys: TupleArg<string>): Promise<number>;
}

export type RedisSetTransaction<Output extends readonly unknown[] = []> = {
  [Key in keyof RedisSetConnection]: (
    ...params: Parameters<RedisSetConnection[Key]>
  ) => RedisTransaction<[...Output, Awaited<ReturnType<RedisSetConnection[Key]>>]>;
};

export type RedisSetClient = Pick<
  RedisClientType,
  | "sAdd"
  | "sCard"
  | "sIsMember"
  | "smIsMember"
  | "sMembers"
  | "sMove"
  | "sPop"
  | "sPopCount"
  | "sRandMember"
  | "sRandMemberCount"
  | "sRem"
  | "sScan"
  | "sDiff"
  | "sDiffStore"
  | "sInter"
  | "sInterCard"
  | "sInterStore"
  | "sUnion"
  | "sUnionStore"
>;

function scanOptions(opts?: ScanCommonOptions) {
  if (opts?.match === undefined && opts?.count === undefined) return undefined;
  const result: { MATCH?: string; COUNT?: number } = {};
  if (opts.match !== undefined) result.MATCH = opts.match;
  if (opts.count !== undefined) result.COUNT = opts.count;
  return result;
}

export function connectionSet(client: RedisSetClient, { scope }: RedisOperationOptions = {}): RedisSetConnection {
  return {
    async sAdd(k, members, codec = codecs.string() as any) {
      return client.sAdd(
        scopedKey(k, scope),
        tupleArgToArray(members).map((v) => codec.encode(v)),
      );
    },
    async sCard(k) {
      return client.sCard(scopedKey(k, scope));
    },
    async sIsMember(k, member, codec = codecs.string() as any) {
      return booleanReply(await client.sIsMember(scopedKey(k, scope), codec.encode(member)));
    },
    async sMIsMember(k, members, codec = codecs.string() as any) {
      return (
        await client.smIsMember(
          scopedKey(k, scope),
          tupleArgToArray(members).map((v) => codec.encode(v)),
        )
      ).map(booleanReply);
    },
    async sMembers(k, codec = codecs.string() as any) {
      return (await client.sMembers(scopedKey(k, scope))).map((v) => codec.decode(v));
    },
    async sMove(source, destination, member, codec = codecs.string() as any) {
      return booleanReply(
        await client.sMove(scopedKey(source, scope), scopedKey(destination, scope), codec.encode(member)),
      );
    },
    async sPop(k, codec = codecs.string() as any) {
      const value = await client.sPop(scopedKey(k, scope));
      return value === null ? null : codec.decode(value);
    },
    async sPopCount(k, count, codec = codecs.string() as any) {
      return (await client.sPopCount(scopedKey(k, scope), count)).map((v) => codec.decode(v));
    },
    async sRandMember(k, codec = codecs.string() as any) {
      const value = await client.sRandMember(scopedKey(k, scope));
      return value === null ? null : codec.decode(value);
    },
    async sRandMemberCount(k, count, codec = codecs.string() as any) {
      return (await client.sRandMemberCount(scopedKey(k, scope), count)).map((v) => codec.decode(v));
    },
    async sRem(k, members, codec = codecs.string() as any) {
      return client.sRem(
        scopedKey(k, scope),
        tupleArgToArray(members).map((v) => codec.encode(v)),
      );
    },
    async sScan(k, cursor, codec = codecs.string() as any, opts) {
      const page = await client.sScan(scopedKey(k, scope), cursor, scanOptions(opts));
      return {
        cursor: page.cursor,
        items: page.members.map((v) => codec.decode(v)),
      };
    },
    async sDiff(ks, codec = codecs.string() as any) {
      return (await client.sDiff(keysArgument(ks, scope))).map((v) => codec.decode(v));
    },
    async sDiffStore(destination, ks) {
      return client.sDiffStore(scopedKey(destination, scope), keysArgument(ks, scope));
    },
    async sInter(ks, codec = codecs.string() as any) {
      return (await client.sInter(keysArgument(ks, scope))).map((v) => codec.decode(v));
    },
    async sInterCard(ks, limit) {
      return client.sInterCard(keysArgument(ks, scope), limit);
    },
    async sInterStore(destination, ks) {
      return client.sInterStore(scopedKey(destination, scope), keysArgument(ks, scope));
    },
    async sUnion(ks, codec = codecs.string() as any) {
      return (await client.sUnion(keysArgument(ks, scope))).map((v) => codec.decode(v));
    },
    async sUnionStore(destination, ks) {
      return client.sUnionStore(scopedKey(destination, scope), keysArgument(ks, scope));
    },
  };
}

export function transactionSet<Output extends readonly unknown[] = []>(
  operations: RedisTransactionOperations,
  { scope }: RedisOperationOptions = {},
): RedisSetTransaction<Output> {
  const queue = createTransactionQueue(operations);
  const api = {
    sAdd(k: string, members: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      return queue(this, (tx) => {
        tx.sAdd(
          scopedKey(k, scope),
          tupleArgToArray(members).map((v) => codec.encode(v)),
        );
      });
    },
    sCard(k: string) {
      return queue(this, (tx) => {
        tx.sCard(scopedKey(k, scope));
      });
    },
    sIsMember(k: string, member: unknown, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sIsMember(scopedKey(k, scope), codec.encode(member));
        },
        (reply) => booleanReply(reply as number),
      );
    },
    sMIsMember(k: string, members: unknown[], codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.smIsMember(
            scopedKey(k, scope),
            tupleArgToArray(members).map((v) => codec.encode(v)),
          );
        },
        (reply) => (reply as number[]).map(booleanReply),
      );
    },
    sMembers(k: string, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sMembers(scopedKey(k, scope));
        },
        (reply) => (reply as string[]).map((value) => codec.decode(value)),
      );
    },
    sMove(source: string, destination: string, member: unknown, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sMove(scopedKey(source, scope), scopedKey(destination, scope), codec.encode(member));
        },
        (reply) => booleanReply(reply as number),
      );
    },
    sPop(k: string, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sPop(scopedKey(k, scope));
        },
        (reply) => (reply === null ? null : codec.decode(reply as string)),
      );
    },
    sPopCount(k: string, count: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sPopCount(scopedKey(k, scope), count);
        },
        (reply) => (reply as string[]).map((value) => codec.decode(value)),
      );
    },
    sRandMember(k: string, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sRandMember(scopedKey(k, scope));
        },
        (reply) => (reply === null ? null : codec.decode(reply as string)),
      );
    },
    sRandMemberCount(k: string, count: number, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sRandMemberCount(scopedKey(k, scope), count);
        },
        (reply) => (reply as string[]).map((value) => codec.decode(value)),
      );
    },
    sRem(k: string, members: TupleArg<unknown>, codec: RedisCodec<any> = codecs.string()) {
      return queue(this, (tx) => {
        tx.sRem(
          scopedKey(k, scope),
          tupleArgToArray(members).map((v) => codec.encode(v)),
        );
      });
    },
    sScan(k: string, cursor: ScanCursor, codec: RedisCodec<any> = codecs.string(), opts?: ScanCommonOptions) {
      return queue(
        this,
        (tx) => {
          tx.sScan(scopedKey(k, scope), cursor, scanOptions(opts));
        },
        (reply) => {
          const page = reply as Awaited<ReturnType<RedisClientType["sScan"]>>;
          return {
            cursor: page.cursor,
            items: page.members.map((v) => codec.decode(v)),
          };
        },
      );
    },
    sDiff(ks: TupleArg<string>, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sDiff(keysArgument(ks, scope));
        },
        (reply) => (reply as string[]).map((v) => codec.decode(v)),
      );
    },
    sDiffStore(destination: string, ks: TupleArg<string>) {
      return queue(this, (tx) => {
        tx.sDiffStore(scopedKey(destination, scope), keysArgument(ks, scope));
      });
    },
    sInter(ks: TupleArg<string>, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sInter(keysArgument(ks, scope));
        },
        (reply) => (reply as string[]).map((v) => codec.decode(v)),
      );
    },
    sInterCard(ks: TupleArg<string>, limit?: number) {
      return queue(this, (tx) => {
        tx.sInterCard(keysArgument(ks, scope), limit);
      });
    },
    sInterStore(destination: string, ks: TupleArg<string>) {
      return queue(this, (tx) => {
        tx.sInterStore(scopedKey(destination, scope), keysArgument(ks, scope));
      });
    },
    sUnion(ks: TupleArg<string>, codec: RedisCodec<any> = codecs.string()) {
      return queue(
        this,
        (tx) => {
          tx.sUnion(keysArgument(ks, scope));
        },
        (reply) => (reply as string[]).map((v) => codec.decode(v)),
      );
    },
    sUnionStore(destination: string, ks: TupleArg<string>) {
      return queue(this, (tx) => {
        tx.sUnionStore(scopedKey(destination, scope), keysArgument(ks, scope));
      });
    },
  };
  return api as any;
}
