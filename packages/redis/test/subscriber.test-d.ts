import { expectTypeOf } from "vitest";

import { codecs, type RedisCodec } from "../src/codec";
import type { RedisSubscriber, RedisSubscriberError } from "../src/subscriber";

declare const subscriber: RedisSubscriber;
declare const subscriberError: RedisSubscriberError;

expectTypeOf(subscriberError.cause).toEqualTypeOf<unknown>();
subscriber.subscribe("text", codecs.string(), (message) => {
  expectTypeOf(message).toEqualTypeOf<string>();
});
subscriber.subscribe("updated", codecs.json<{ id: string }>(), (message) => {
  expectTypeOf(message).toEqualTypeOf<{ id: string }>();
});
subscriber.scope("tenant").subscribe("count", codecs.number(), (message) => {
  expectTypeOf(message).toEqualTypeOf<number>();
});

// @ts-expect-error handlers follow the codec output type
subscriber.subscribe("count", codecs.number(), (message: string) => {});

declare const codec: RedisCodec<{ id: string }>;
subscriber.subscribe("events", codec, (message) => {
  message.id;
});
