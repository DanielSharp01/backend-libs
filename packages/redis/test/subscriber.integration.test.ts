import { createClient } from "redis";
import { describe, expect, it } from "vitest";

import { codecs, createRedisSubscriber } from "../src/index";

const redisUrl = process.env.REDIS_URL;
const integrationRedisUrl = redisUrl ?? "";

async function waitFor(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for Redis Pub/Sub delivery");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function within<T>(promise: Promise<T>, label: string, timeoutMs = 2_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    }),
  ]);
}

describe.skipIf(redisUrl === undefined)("Redis subscriber reconnect integration", () => {
  it("keeps its listener registered and does not replay a message missed while disconnected", async () => {
    const commandClient = createClient({ url: integrationRedisUrl });
    const subscriberClient = createClient({
      url: integrationRedisUrl,
      socket: { reconnectStrategy: () => 200 },
    });
    commandClient.on("error", () => {});
    const scope = `redis-package-${process.pid}-${Date.now()}`;
    const effectiveChannel = `${scope}.event`;
    const messages: string[] = [];
    const subscriber = createRedisSubscriber(subscriberClient, { scope, onError: () => {} });

    await Promise.all([commandClient.connect(), subscriberClient.connect()]);
    const subscriberClientId = await subscriberClient.clientId();
    const subscription = await subscriber.subscribe("event", codecs.string(), (message) => {
      messages.push(message);
    });

    try {
      await commandClient.publish(effectiveChannel, "before");
      await waitFor(() => messages.includes("before"));

      const reconnecting = new Promise<void>((resolve) => subscriberClient.once("reconnecting", resolve));
      const ready = new Promise<void>((resolve) => subscriberClient.once("ready", resolve));
      await commandClient.sendCommand(["CLIENT", "KILL", "ID", String(subscriberClientId)]);
      await within(reconnecting, "Redis to start reconnecting");
      await commandClient.publish(effectiveChannel, "missed");
      await within(ready, "Redis to reconnect");

      await commandClient.publish(effectiveChannel, "after");
      await waitFor(() => messages.includes("after"));
      expect(messages).toEqual(["before", "after"]);
    } finally {
      await subscription.unsubscribe().catch(() => {});
      commandClient.destroy();
      subscriberClient.destroy();
    }
  }, 15_000);
});
