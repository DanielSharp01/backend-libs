import type { IncomingHttpHeaders } from "node:http";

export const JSON_CONTENT_TYPE = "application/json";
export const MULTIPART_CONTENT_TYPE = "multipart/form-data";
export const URL_ENCODED_CONTENT_TYPE = "application/x-www-form-urlencoded";

export function requestContentType(headers: Readonly<IncomingHttpHeaders>): string {
  const contentType = headers["content-type"];
  return normalizeContentType(Array.isArray(contentType) ? contentType[0] : (contentType ?? JSON_CONTENT_TYPE));
}

export function normalizeContentType(contentType: string): string {
  return contentType.split(";", 1)[0]!.trim().toLowerCase();
}
