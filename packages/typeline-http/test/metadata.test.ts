import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mergeHttpMetadata, toMergedHttpMetadata } from "../src/metadata";
import { router } from "../src/router";
import {
  validateBody,
  validateCookies,
  validateFile,
  validateHeaders,
  validateMultipart,
  validateParams,
  validateQuery,
  validateUrlEncoded,
} from "../src/validate";

describe("HTTP metadata", () => {
  it("converts raw validator metadata into mergeable schema lists", () => {
    const schema = z.object({ value: z.string() });
    const file = z.file();

    expect(toMergedHttpMetadata({ body: { contentType: "application/json", schema } })).toEqual({
      body: { contentType: "application/json", schema: [schema] },
    });
    expect(toMergedHttpMetadata({ file, headers: schema, cookies: schema, query: schema, params: schema })).toEqual({
      file: [file],
      headers: [schema],
      cookies: [schema],
      query: [schema],
      params: [schema],
    });
  });

  it("uses inherited routes, child scalar fields, and ordered list fields", () => {
    expect(
      mergeHttpMetadata(
        {
          route: { method: "GET", path: "/parent" },
          openApi: false,
          title: "Parent",
          description: "Parent description",
          tags: ["users"],
          responses: [{ status: 401 }],
        },
        {
          route: { method: "POST", path: "/child" },
          openApi: true,
          title: "Child",
          description: "Child description",
          tags: ["write", "users"],
          responses: [{ status: 200 }],
        },
      ),
    ).toEqual({
      route: { method: "GET", path: "/parent" },
      openApi: true,
      title: "Child",
      description: "Child description",
      tags: ["users", "write"],
      responses: [{ status: 401 }, { status: 200 }],
    });
  });

  it("does not let undefined child values erase inherited fields", () => {
    const schema = z.string();
    const parent = toMergedHttpMetadata({
      route: { method: "GET", path: "/items" },
      openApi: true,
      title: "Items",
      description: "All items",
      tags: ["items"],
      body: { contentType: "application/json", schema },
      responses: [{ status: 200 }],
      headers: schema,
      cookies: schema,
      query: schema,
      params: schema,
    });

    expect(mergeHttpMetadata(parent, toMergedHttpMetadata({}))).toEqual(parent);
  });

  it("preserves explicitly empty tag and response lists", () => {
    expect(mergeHttpMetadata({}, { tags: [] })).toEqual({ tags: [] });
    expect(mergeHttpMetadata({}, { responses: [] })).toEqual({ responses: [] });
  });

  it("retains repeated validator schemas in registration order", () => {
    const parent = z.object({ parent: z.string() });
    const child = z.object({ child: z.number() });
    const parentFile = z.file().max(10);
    const childFile = z.file().mime("image/png");
    const merged = mergeHttpMetadata(
      toMergedHttpMetadata({
        body: { contentType: "application/json", schema: parent },
        file: parentFile,
        headers: parent,
        cookies: parent,
        query: parent,
        params: parent,
      }),
      toMergedHttpMetadata({
        body: { contentType: "application/json", schema: child },
        file: childFile,
        headers: child,
        cookies: child,
        query: child,
        params: child,
      }),
    );

    for (const schemas of [merged.body?.schema, merged.headers, merged.cookies, merged.query, merged.params]) {
      expect(schemas).toEqual([parent, child]);
    }
    expect(merged.file).toEqual([parentFile, childFile]);
  });

  it("uses the later body metadata when its content type differs", () => {
    const json = z.object({ json: z.string() });
    const text = z.string();

    expect(
      mergeHttpMetadata(
        toMergedHttpMetadata({ body: { contentType: "application/json", schema: json } }),
        toMergedHttpMetadata({ body: { contentType: "text/plain", schema: text } }),
      ).body,
    ).toEqual({ contentType: "text/plain", schema: [text] });
  });

  it("retains security scheme groups and requires authentication when any group is required", () => {
    const first = { firstAuth: { scheme: "basic" as const } };
    const second = { secondAuth: { scheme: "bearer" as const } };

    expect(
      mergeHttpMetadata(
        toMergedHttpMetadata({ securitySchemes: first, optionalSecurity: true }),
        toMergedHttpMetadata({ securitySchemes: second, optionalSecurity: false }),
      ),
    ).toEqual({
      securitySchemes: [first, second],
      optionalSecurity: false,
    });
  });

  it("exposes original schemas directly from validator middleware", () => {
    const schema = z.object({ value: z.string() });

    expect(validateBody(schema).metadata.body).toEqual({ contentType: "application/json", schema });
    expect(validateHeaders(schema).metadata.headers).toBe(schema);
    expect(validateCookies(schema).metadata.cookies).toBe(schema);
    expect(validateQuery(schema).metadata.query).toBe(schema);
    expect(validateParams(schema).metadata.params).toBe(schema);
    expect(validateUrlEncoded(schema).metadata.body).toEqual({
      contentType: "application/x-www-form-urlencoded",
      schema,
    });
    expect(validateMultipart(schema).metadata.body).toEqual({ contentType: "multipart/form-data", schema });
    const fileSchema = z.file();
    expect(validateFile(fileSchema).metadata.file).toBe(fileSchema);
  });

  it("records route and validator metadata on the built typeline", () => {
    const schema = z.object({ value: z.string() });
    const app = router();

    app.post("/items", (line) => line.pipe(validateBody(schema)));

    expect(app.lines[0]?.metadata).toEqual([
      { route: { method: "POST", path: "/items" } },
      { body: { contentType: "application/json", schema } },
    ]);
  });
});
