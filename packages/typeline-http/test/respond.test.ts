import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { isPipelineStop, typeline } from "@danielsharp/typeline";

import type { HttpResponse } from "../src/response";
import type { HttpMetadata } from "../src/metadata";
import { jsonResSend, jsonResponseMeta, resEnd, responseMeta } from "../src/respond";
import type { HttpContext } from "../src/router";

describe("HTTP response helpers", () => {
  it("selects, serializes, and sends a typed JSON response", async () => {
    let transforms = 0;
    const schema = z.object({ value: z.string() }).transform((value) => {
      transforms++;
      return { length: value.value.length };
    });
    const response = mockResponse();
    const sender = jsonResSend(schema, 201, async () => ({ length: 4 }));

    const requestContext = context(response.value);
    const sending = typeline<{}, {}, HttpContext, HttpMetadata>().pipe(sender).push({}, requestContext);

    await expect(sending).rejects.toSatisfy(isPipelineStop);
    expect(transforms).toBe(0);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.header).toHaveBeenCalledWith("content-type", "application/json; charset=utf-8");
    expect(response.send).toHaveBeenCalledWith('{"length":4}');
    expect(sender.metadata).toEqual({
      responses: [
        {
          status: 201,
          content: { contentType: "application/json", schema },
        },
      ],
    });
  });

  it("finishes selection and serialization before changing the response", async () => {
    const selectionFailure = new Error("selection failed");
    const selectionResponse = mockResponse();
    const failedSelection = jsonResSend(z.any(), 200, async () => {
      throw selectionFailure;
    });

    await expect(failedSelection.mw({}, context(selectionResponse.value))).rejects.toBe(selectionFailure);
    expectResponseUntouched(selectionResponse);

    const serializationResponse = mockResponse();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const failedSerialization = jsonResSend(z.any(), 200, () => cyclic);

    await expect(failedSerialization.mw({}, context(serializationResponse.value))).rejects.toBeInstanceOf(TypeError);
    expectResponseUntouched(serializationResponse);
  });

  it("ends a response without content and records bodyless metadata", async () => {
    const response = mockResponse();
    const end = resEnd(204);

    const requestContext = context(response.value);
    const ending = typeline<{}, {}, HttpContext, HttpMetadata>().pipe(end).push({}, requestContext);

    await expect(ending).rejects.toSatisfy(isPipelineStop);
    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.header).not.toHaveBeenCalled();
    expect(response.send).toHaveBeenCalledWith();
    expect(end.metadata).toEqual({ responses: [{ status: 204 }] });
  });

  it("declares inherited JSON and bodyless responses without middleware", () => {
    const schema = z.object({ error: z.string() });

    expect(jsonResponseMeta(schema, "default")).toEqual({
      metadata: {
        responses: [
          {
            status: "default",
            content: { contentType: "application/json", schema },
          },
        ],
      },
    });
    expect(responseMeta(404)).toEqual({ metadata: { responses: [{ status: 404 }] } });
    expect(responseMeta("default")).toEqual({ metadata: { responses: [{ status: "default" }] } });
  });

  it("rejects invalid and body-forbidden statuses when helpers are created", () => {
    const schema = z.string();
    const select = () => "value";

    for (const status of [99, 100, 199, 600, 200.5, Number.NaN]) {
      expect(() => jsonResSend(schema, status, select)).toThrow(TypeError);
      expect(() => jsonResponseMeta(schema, status)).toThrow(TypeError);
      expect(() => resEnd(status)).toThrow(TypeError);
      expect(() => responseMeta(status)).toThrow(TypeError);
    }
    for (const status of [204, 205, 304]) {
      expect(() => jsonResSend(schema, status, select)).toThrow(
        `HTTP status ${status} cannot include JSON response content.`,
      );
      expect(() => jsonResponseMeta(schema, status)).toThrow(
        `HTTP status ${status} cannot include JSON response content.`,
      );
      expect(() => resEnd(status)).not.toThrow();
      expect(() => responseMeta(status)).not.toThrow();
    }
  });
});

interface MockResponse {
  readonly value: HttpResponse;
  readonly status: ReturnType<typeof vi.fn>;
  readonly header: ReturnType<typeof vi.fn>;
  readonly send: ReturnType<typeof vi.fn>;
}

function mockResponse(): MockResponse {
  const value = {} as HttpResponse;
  const status = vi.fn(() => value);
  const header = vi.fn(() => value);
  const send = vi.fn(() => value);
  Object.assign(value, { status, header, send });
  return { value, status, header, send };
}

function context(response: HttpResponse): HttpContext {
  return { req: {} as HttpContext["req"], res: response };
}

function expectResponseUntouched(response: MockResponse): void {
  expect(response.status).not.toHaveBeenCalled();
  expect(response.header).not.toHaveBeenCalled();
  expect(response.send).not.toHaveBeenCalled();
}
