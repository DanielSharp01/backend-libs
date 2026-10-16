import { File } from "node:buffer";
import type { IncomingHttpHeaders } from "node:http";

import busboy from "busboy";

type MultipartPart = string | File;
type PendingMultipartPart = MultipartPart | typeof pendingPart;

const pendingPart = Symbol("pending multipart part");

export async function parseMultipartBody(
  body: Buffer,
  headers: Readonly<IncomingHttpHeaders>,
): Promise<Record<string, MultipartPart | MultipartPart[]>> {
  return new Promise((resolve, reject) => {
    const parts = new Map<string, PendingMultipartPart[]>();
    let parser: ReturnType<typeof busboy>;
    let settled = false;

    function fail(error: unknown): void {
      if (settled) return;
      settled = true;
      reject(error);
    }

    try {
      parser = busboy({
        headers: { "content-type": multipartContentTypeHeader(headers) },
        // Browsers and fetch send filenames as raw UTF-8, not the Latin-1 busboy assumes by default.
        defParamCharset: "utf8",
        limits: { fieldSize: body.byteLength, fileSize: body.byteLength },
      });
    } catch (error) {
      fail(error);
      return;
    }

    parser.on("field", (name, value, info) => {
      if (info.valueTruncated) {
        fail(new TypeError(`Multipart field ${JSON.stringify(name)} was truncated.`));
        return;
      }
      appendPart(parts, name, value);
    });

    parser.on("file", (name, stream, info) => {
      const values = parts.get(name) ?? [];
      const index = values.push(pendingPart) - 1;
      parts.set(name, values);
      const chunks: Buffer[] = [];

      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", fail);
      stream.on("end", () => {
        if (stream.truncated) {
          fail(new TypeError(`Multipart file ${JSON.stringify(name)} was truncated.`));
          return;
        }
        values[index] = new File([new Uint8Array(Buffer.concat(chunks))], info.filename, { type: info.mimeType });
      });
    });

    parser.on("error", fail);
    parser.on("close", () => {
      if (settled) return;
      const output: [string, MultipartPart | MultipartPart[]][] = [];
      for (const [name, values] of parts) {
        if (values.some((value) => value === pendingPart)) {
          fail(new TypeError(`Multipart file ${JSON.stringify(name)} did not finish.`));
          return;
        }
        const completed = values as MultipartPart[];
        output.push([name, completed.length === 1 ? completed[0]! : completed]);
      }
      settled = true;
      resolve(Object.fromEntries(output));
    });

    try {
      parser.end(body);
    } catch (error) {
      fail(error);
    }
  });
}

function multipartContentTypeHeader(headers: Readonly<IncomingHttpHeaders>): string | undefined {
  const contentType = headers["content-type"];
  return Array.isArray(contentType) ? contentType[0] : contentType;
}

function appendPart(parts: Map<string, PendingMultipartPart[]>, name: string, value: MultipartPart): void {
  const current = parts.get(name);
  if (current === undefined) parts.set(name, [value]);
  else current.push(value);
}
