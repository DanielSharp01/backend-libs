import type { RedisClientType } from "redis";
import { type Awaitable } from "@danielsharp/common";

import { combineRedisScope, scopedKey } from "./utils";
import type { RedisCodec } from "./codec";

export type RedisMessageHandler<Message> = (message: Message) => Awaitable<void>;

export type RedisValidatedMessageHandler<Message> = (message: Message) => Awaitable<void>;

export type RedisSubscriberError =
  | { source: "client"; cause: unknown }
  | {
      source: "decode";
      cause: unknown;
      channel: string;
      rawMessage: string;
    }
  | {
      source: "handler";
      cause: unknown;
      channel: string;
    };

export type RedisSubscriberErrorHandler = (error: RedisSubscriberError) => void;

export interface RedisSubscriberOptions {
  onError: RedisSubscriberErrorHandler;
  scope?: string;
}

export interface RedisSubscription {
  unsubscribe(): Promise<void>;
}

export interface RedisSubscriber {
  subscribe<TCodec extends RedisCodec<any> = RedisCodec<string>>(
    channel: string,
    codec: TCodec,
    handler: RedisMessageHandler<ReturnType<TCodec["decode"]>>,
  ): Promise<RedisSubscription>;

  scope(scope: string): RedisSubscriber;
}

type RedisSubscriberClient = Pick<RedisClientType, "on" | "subscribe" | "unsubscribe">;
type RedisListener = Parameters<RedisSubscriberClient["subscribe"]>[1];

function subscriptionHandle(
  client: RedisSubscriberClient,
  channel: string,
  listener: RedisListener,
): RedisSubscription {
  let active = true;
  let inFlight: Promise<void> | undefined;

  return {
    unsubscribe() {
      if (!active) {
        return Promise.resolve();
      }

      if (inFlight !== undefined) {
        return inFlight;
      }

      inFlight = client.unsubscribe(channel, listener).then(
        () => {
          active = false;
          inFlight = undefined;
        },
        (error: unknown) => {
          inFlight = undefined;
          throw error;
        },
      );

      return inFlight;
    },
  };
}

function subscriberView(client: RedisSubscriberClient, { scope, onError }: RedisSubscriberOptions): RedisSubscriber {
  const subscriber: RedisSubscriber = {
    async subscribe(channel, codec, handler) {
      const effectiveChannel = scopedKey(channel, scope);
      const listener: RedisListener = (rawMessage) => {
        let message: ReturnType<(typeof codec)["decode"]>;

        try {
          message = codec.decode(rawMessage as string);
        } catch (error) {
          return onError({
            source: "decode",
            cause: error,
            channel: effectiveChannel,
            rawMessage: rawMessage as string,
          });
        }

        try {
          void Promise.resolve(handler(message)).catch((cause: unknown) => {
            onError({
              source: "handler",
              cause,
              channel: effectiveChannel,
            });
          });
        } catch (err) {
          return onError({
            source: "handler",
            cause: err,
            channel: effectiveChannel,
          });
        }
      };

      await client.subscribe(effectiveChannel, listener);
      return subscriptionHandle(client, effectiveChannel, listener);
    },

    scope(childScope) {
      return subscriberView(client, {
        onError,
        scope: combineRedisScope(scope, childScope),
      });
    },
  };

  return subscriber;
}

export function createRedisSubscriber(client: RedisSubscriberClient, options: RedisSubscriberOptions): RedisSubscriber {
  client.on("error", (error) => {
    options.onError({ source: "client", cause: error });
  });
  return subscriberView(client, options);
}
