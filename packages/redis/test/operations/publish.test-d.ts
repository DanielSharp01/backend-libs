import { codecs } from "../../src/codec";
import type { RedisPublishConnection } from "../../src/operations/publish";

declare const connection: RedisPublishConnection;

connection.publish("text", "message");
connection.publish("updated", { id: 1 }, codecs.json<{ id: number }>());

// @ts-expect-error codec controls the message input
connection.publish("updated", { id: "1" }, codecs.json<{ id: number }>());
