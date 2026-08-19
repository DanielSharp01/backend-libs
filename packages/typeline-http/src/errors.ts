import { TypelineError } from "@danielsharp/typeline";

import type { HttpRouteUnmatchedResolution } from "./request";

export type HttpValidationSource = "body" | "headers" | "cookies" | "query" | "params";

export class BodySizeError extends TypelineError<typeof BodySizeError.code> {
  static readonly code = "HTTP_BODY_SIZE_EXCEEDED";

  constructor(readonly maximumBodySize: number) {
    super(`The HTTP request body exceeds the maximum of ${maximumBodySize} bytes.`, BodySizeError.code);
    this.name = "BodySizeError";
  }

  static is(error: unknown): error is BodySizeError {
    return TypelineError.is(error) && error.code === BodySizeError.code;
  }
}

export class BodyStreamError extends TypelineError<typeof BodyStreamError.code> {
  static readonly code = "HTTP_BODY_STREAM_FAILED";

  constructor(readonly cause: unknown) {
    super("The HTTP request body stream failed.", BodyStreamError.code);
    this.name = "BodyStreamError";
  }

  static is(error: unknown): error is BodyStreamError {
    return TypelineError.is(error) && error.code === BodyStreamError.code;
  }
}

export class BodyFormatError extends TypelineError<typeof BodyFormatError.code> {
  static readonly code = "HTTP_BODY_FORMAT_INVALID";

  constructor(
    readonly contentType: string,
    readonly cause: unknown,
  ) {
    super(`The HTTP request body is not valid ${contentType}.`, BodyFormatError.code);
    this.name = "BodyFormatError";
  }

  static is(error: unknown): error is BodyFormatError {
    return TypelineError.is(error) && error.code === BodyFormatError.code;
  }
}

export class HeaderFormatError extends TypelineError<typeof HeaderFormatError.code> {
  static readonly code = "HTTP_HEADER_FORMAT_INVALID";

  constructor(
    readonly headerName: string,
    readonly cause: unknown,
  ) {
    super(`The ${headerName} HTTP request header is malformed.`, HeaderFormatError.code);
    this.name = "HeaderFormatError";
  }

  static is(error: unknown): error is HeaderFormatError {
    return TypelineError.is(error) && error.code === HeaderFormatError.code;
  }
}

export class ConnectionAbortedError extends TypelineError<typeof ConnectionAbortedError.code> {
  static readonly code = "HTTP_CONNECTION_ABORTED";

  constructor(readonly cause: unknown) {
    super("The HTTP connection was aborted before an error response could be sent.", ConnectionAbortedError.code);
    this.name = "ConnectionAbortedError";
  }

  static is(error: unknown): error is ConnectionAbortedError {
    return TypelineError.is(error) && error.code === ConnectionAbortedError.code;
  }
}

export class ResponseAlreadyEndedError extends TypelineError<typeof ResponseAlreadyEndedError.code> {
  static readonly code = "HTTP_RESPONSE_ALREADY_ENDED";

  constructor(readonly cause: unknown = undefined) {
    super("The HTTP response has already ended.", ResponseAlreadyEndedError.code);
    this.name = "ResponseAlreadyEndedError";
  }

  static is(error: unknown): error is ResponseAlreadyEndedError {
    return TypelineError.is(error) && error.code === ResponseAlreadyEndedError.code;
  }
}

export class ResponseAlreadyCommittedError extends TypelineError<typeof ResponseAlreadyCommittedError.code> {
  static readonly code = "HTTP_RESPONSE_ALREADY_COMMITTED";

  constructor(readonly cause: unknown = undefined) {
    super("The HTTP response headers have already been committed.", ResponseAlreadyCommittedError.code);
    this.name = "ResponseAlreadyCommittedError";
  }

  static is(error: unknown): error is ResponseAlreadyCommittedError {
    return TypelineError.is(error) && error.code === ResponseAlreadyCommittedError.code;
  }
}

export class InvalidResponseHeadersError extends TypelineError<typeof InvalidResponseHeadersError.code> {
  static readonly code = "HTTP_INVALID_RESPONSE_HEADERS";

  constructor(readonly cause: unknown) {
    super("The HTTP response headers could not be flushed.", InvalidResponseHeadersError.code);
    this.name = "InvalidResponseHeadersError";
  }

  static is(error: unknown): error is InvalidResponseHeadersError {
    return TypelineError.is(error) && error.code === InvalidResponseHeadersError.code;
  }
}

export class FileNotFoundError extends TypelineError<typeof FileNotFoundError.code> {
  static readonly code = "HTTP_FILE_NOT_FOUND";

  constructor(
    readonly path: string,
    readonly cause: unknown = undefined,
  ) {
    super("The requested response file was not found.", FileNotFoundError.code);
    this.name = "FileNotFoundError";
  }

  static is(error: unknown): error is FileNotFoundError {
    return TypelineError.is(error) && error.code === FileNotFoundError.code;
  }
}

export class MalformedPathEncodingError extends TypelineError<typeof MalformedPathEncodingError.code> {
  static readonly code = "HTTP_MALFORMED_PATH_ENCODING";

  constructor(
    readonly encodedValue: string,
    readonly cause: URIError,
  ) {
    super("The request path contains malformed percent encoding.", MalformedPathEncodingError.code);
    this.name = "MalformedPathEncodingError";
  }

  static is(error: unknown): error is MalformedPathEncodingError {
    return TypelineError.is(error) && error.code === MalformedPathEncodingError.code;
  }
}

export class RouteNotMatchedError extends TypelineError<typeof RouteNotMatchedError.code> {
  static readonly code = "HTTP_ROUTE_NOT_MATCHED";

  constructor(
    readonly resolution: HttpRouteUnmatchedResolution,
    readonly route: { path: string; method: string; contentType: string },
  ) {
    super(routeNotMatchedMessage(resolution), RouteNotMatchedError.code);
    this.name = "RouteNotMatchedError";
  }

  static is(error: unknown): error is RouteNotMatchedError {
    return TypelineError.is(error) && error.code === RouteNotMatchedError.code;
  }
}

function routeNotMatchedMessage(resolution: HttpRouteUnmatchedResolution): string {
  switch (resolution.status) {
    case "method-not-allowed":
      return `The request method is not allowed. Available methods: ${resolution.allowedMethods.join(", ")}.`;
    case "unsupported-media-type":
      return `The request media type is not supported. Available media types: ${resolution.allowedContentTypes.join(", ")}.`;
    default:
      return "No HTTP route path matched the request.";
  }
}

export class RouterCompiledError extends TypelineError<typeof RouterCompiledError.code> {
  static readonly code = "HTTP_ROUTER_COMPILED";

  constructor() {
    super("The HTTP router has already been compiled.", RouterCompiledError.code);
    this.name = "RouterCompiledError";
  }

  static is(error: unknown): error is RouterCompiledError {
    return TypelineError.is(error) && error.code === RouterCompiledError.code;
  }
}

export class RouterNotCompiledError extends TypelineError<typeof RouterNotCompiledError.code> {
  static readonly code = "HTTP_ROUTER_NOT_COMPILED";

  constructor() {
    super("The HTTP router must be compiled before it can dispatch requests.", RouterNotCompiledError.code);
    this.name = "RouterNotCompiledError";
  }

  static is(error: unknown): error is RouterNotCompiledError {
    return TypelineError.is(error) && error.code === RouterNotCompiledError.code;
  }
}

export class DuplicateRouteError extends TypelineError<typeof DuplicateRouteError.code> {
  static readonly code = "HTTP_DUPLICATE_ROUTE";

  constructor(
    readonly method: string,
    readonly path: string,
  ) {
    super(`A route is already registered for ${method} ${path}.`, DuplicateRouteError.code);
    this.name = "DuplicateRouteError";
  }

  static is(error: unknown): error is DuplicateRouteError {
    return TypelineError.is(error) && error.code === DuplicateRouteError.code;
  }
}

export class AmbiguousRouteError extends TypelineError<typeof AmbiguousRouteError.code> {
  static readonly code = "HTTP_AMBIGUOUS_ROUTE";

  constructor(
    readonly method: string,
    readonly registeredPath: string,
    readonly conflictingPath: string,
  ) {
    super(
      `Routes ${method} ${registeredPath} and ${method} ${conflictingPath} match the same paths.`,
      AmbiguousRouteError.code,
    );
    this.name = "AmbiguousRouteError";
  }

  static is(error: unknown): error is AmbiguousRouteError {
    return TypelineError.is(error) && error.code === AmbiguousRouteError.code;
  }
}

export class HttpValidationError extends TypelineError<typeof HttpValidationError.code> {
  static readonly code = "HTTP_VALIDATION_FAILED";

  constructor(
    readonly source: HttpValidationSource,
    readonly cause: unknown,
  ) {
    super(`HTTP ${source} validation failed.`, HttpValidationError.code);
    this.name = "HttpValidationError";
  }

  static is(error: unknown): error is HttpValidationError {
    return TypelineError.is(error) && error.code === HttpValidationError.code;
  }
}
