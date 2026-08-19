import { describe, expect, it, vi } from "vitest";

import { codecs } from "../src/codec";
import { createRedisSubscriber } from "../src/subscriber";

type Listener = (message: string, channel: string) => void;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class SubscriberClientDouble {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly errorListeners = new Set<(error: Error) => void>();
  readonly unsubscribeCalls: Array<[string, Listener]> = [];
  nextSubscribe: Promise<void> | undefined;
  nextUnsubscribe: Promise<void> | undefined;

  on(event: string, listener: (error: Error) => void) {
    if (event === "error") this.errorListeners.add(listener);
    return this;
  }

  async subscribe(channel: string, listener: Listener) {
    await this.nextSubscribe;
    const listeners = this.listeners.get(channel) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(channel, listeners);
  }

  async unsubscribe(channel: string, listener: Listener) {
    this.unsubscribeCalls.push([channel, listener]);
    await this.nextUnsubscribe;
    const listeners = this.listeners.get(channel);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.listeners.delete(channel);
  }

  emit(channel: string, message: string) {
    for (const listener of this.listeners.get(channel) ?? []) listener(message, channel);
  }
}

describe("Redis subscribers", () => {
  it("waits for setup and composes scopes", async () => {
    const client = new SubscriberClientDouble();
    const acknowledgement = deferred();
    client.nextSubscribe = acknowledgement.promise;
    const subscriber = createRedisSubscriber(client as any, { onError: vi.fn(), scope: "app" });

    let settled = false;
    const setup = subscriber
      .scope("tenant")
      .subscribe("updated", codecs.json<{ id: string }>(), vi.fn())
      .then((subscription) => {
        settled = true;
        return subscription;
      });
    await Promise.resolve();
    expect(settled).toBe(false);

    acknowledgement.resolve();
    await setup;
    expect(client.listeners.has("app.tenant.updated")).toBe(true);
    expect(client.errorListeners).toHaveLength(1);
  });

  it("decodes messages and reports decode and handler failures", async () => {
    const client = new SubscriberClientDouble();
    const onError = vi.fn();
    const subscriber = createRedisSubscriber(client as any, { onError, scope: "app" });
    const handlerError = new Error("handler failed");
    const handler = vi.fn(() => {
      throw handlerError;
    });
    await subscriber.subscribe("updated", codecs.json<{ id: string }>(), handler);

    client.emit("app.updated", "not-json");
    expect(onError).toHaveBeenCalledWith({
      source: "decode",
      cause: expect.any(SyntaxError),
      channel: "app.updated",
      rawMessage: "not-json",
    });
    client.emit("app.updated", '{"id":"user-1"}');
    expect(handler).toHaveBeenCalledWith({ id: "user-1" });
    expect(onError).toHaveBeenCalledWith({ source: "handler", cause: handlerError, channel: "app.updated" });
  });

  it("reports asynchronous handler failures", async () => {
    const client = new SubscriberClientDouble();
    const onError = vi.fn();
    const subscriber = createRedisSubscriber(client as any, { onError });
    const failure = deferred();
    await subscriber.subscribe("events", codecs.string(), () => failure.promise);

    client.emit("events", "message");
    const error = new Error("async failed");
    failure.reject(error);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith({ source: "handler", cause: error, channel: "events" });
  });

  it("coalesces concurrent unsubscribe calls and retries failures", async () => {
    const client = new SubscriberClientDouble();
    const subscriber = createRedisSubscriber(client as any, { onError: vi.fn() });
    const handle = await subscriber.subscribe("events", codecs.string(), vi.fn());
    const acknowledgement = deferred();
    client.nextUnsubscribe = acknowledgement.promise;

    const first = handle.unsubscribe();
    expect(handle.unsubscribe()).toBe(first);
    acknowledgement.resolve();
    await first;
    await handle.unsubscribe();
    expect(client.unsubscribeCalls).toHaveLength(1);

    const retry = await subscriber.subscribe("events", codecs.string(), vi.fn());
    const failure = deferred();
    client.nextUnsubscribe = failure.promise;
    const failed = retry.unsubscribe();
    failure.reject(new Error("unsubscribe failed"));
    await expect(failed).rejects.toThrow("unsubscribe failed");
    client.nextUnsubscribe = Promise.resolve();
    await expect(retry.unsubscribe()).resolves.toBeUndefined();
  });
});
