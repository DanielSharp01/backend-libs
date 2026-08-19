import type { Awaitable } from "@danielsharp/common";

import type { HttpResponse } from "./response";

export type HttpErrorDetails = Record<string, unknown> & {
  error?: never;
  statusCode?: never;
};

export interface HttpError extends Error {
  send(response: HttpResponse): Awaitable<unknown>;
}

export class JsonHttpError extends Error implements HttpError {
  readonly details: HttpErrorDetails;

  constructor(
    name: string,
    readonly statusCode: number,
    details: HttpErrorDetails = {},
  ) {
    super(name);
    assertUnreservedDetails(details);
    this.name = name;
    this.details = { ...details };
  }

  send(response: HttpResponse): HttpResponse {
    const error = response.wrapUnsendable();
    if (error) {
      throw error;
    }

    response.status(this.statusCode);
    this.setHeaders(response);
    return response.send({
      error: this.name,
      statusCode: this.statusCode,
      ...this.details,
    });
  }

  protected setHeaders(_response: HttpResponse): void {}
}

export class BadRequest extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("BadRequest", 400, details);
  }
}

export class Unauthorized extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("Unauthorized", 401, details);
  }
}

export class PaymentRequired extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("PaymentRequired", 402, details);
  }
}

export class Forbidden extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("Forbidden", 403, details);
  }
}

export class NotFound extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("NotFound", 404, details);
  }
}

type MethodNotAllowedDetails = HttpErrorDetails & { allowedMethods: readonly string[] };

export class MethodNotAllowed extends JsonHttpError {
  constructor(readonly methodDetails: MethodNotAllowedDetails = { allowedMethods: [] }) {
    super("MethodNotAllowed", 405, methodDetails);
  }

  protected override setHeaders(response: HttpResponse): void {
    response.header("allow", this.methodDetails.allowedMethods.join(", "));
  }
}

export class NotAcceptable extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("NotAcceptable", 406, details);
  }
}

export class ProxyAuthenticationRequired extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("ProxyAuthenticationRequired", 407, details);
  }
}

export class RequestTimeout extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("RequestTimeout", 408, details);
  }
}

export class Conflict extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("Conflict", 409, details);
  }
}

export class Gone extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("Gone", 410, details);
  }
}

export class LengthRequired extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("LengthRequired", 411, details);
  }
}

export class PreconditionFailed extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("PreconditionFailed", 412, details);
  }
}

export class PayloadTooLarge extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("PayloadTooLarge", 413, details);
  }
}

export class URITooLong extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("URITooLong", 414, details);
  }
}

export class UnsupportedMediaType extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("UnsupportedMediaType", 415, details);
  }
}

export class RangeNotSatisfiable extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("RangeNotSatisfiable", 416, details);
  }
}

export class ExpectationFailed extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("ExpectationFailed", 417, details);
  }
}

export class ImATeapot extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("ImATeapot", 418, details);
  }
}

export class MisdirectedRequest extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("MisdirectedRequest", 421, details);
  }
}

export class UnprocessableEntity extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("UnprocessableEntity", 422, details);
  }
}

export class Locked extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("Locked", 423, details);
  }
}

export class FailedDependency extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("FailedDependency", 424, details);
  }
}

export class TooEarly extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("TooEarly", 425, details);
  }
}

export class UpgradeRequired extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("UpgradeRequired", 426, details);
  }
}

export class PreconditionRequired extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("PreconditionRequired", 428, details);
  }
}

export class TooManyRequests extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("TooManyRequests", 429, details);
  }
}

export class RequestHeaderFieldsTooLarge extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("RequestHeaderFieldsTooLarge", 431, details);
  }
}

export class UnavailableForLegalReasons extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("UnavailableForLegalReasons", 451, details);
  }
}

export class InternalServerError extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("InternalServerError", 500, details);
  }
}

export class NotImplemented extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("NotImplemented", 501, details);
  }
}

export class BadGateway extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("BadGateway", 502, details);
  }
}

export class ServiceUnavailable extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("ServiceUnavailable", 503, details);
  }
}

export class GatewayTimeout extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("GatewayTimeout", 504, details);
  }
}

export class HTTPVersionNotSupported extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("HTTPVersionNotSupported", 505, details);
  }
}

export class VariantAlsoNegotiates extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("VariantAlsoNegotiates", 506, details);
  }
}

export class InsufficientStorage extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("InsufficientStorage", 507, details);
  }
}

export class LoopDetected extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("LoopDetected", 508, details);
  }
}

export class NotExtended extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("NotExtended", 510, details);
  }
}

export class NetworkAuthenticationRequired extends JsonHttpError {
  constructor(details: HttpErrorDetails = {}) {
    super("NetworkAuthenticationRequired", 511, details);
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && "send" in error && typeof error.send === "function";
}

function assertUnreservedDetails(details: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(details, "error")) {
    throw new TypeError('HTTP error details cannot contain the reserved "error" key.');
  }
  if (Object.prototype.hasOwnProperty.call(details, "statusCode")) {
    throw new TypeError('HTTP error details cannot contain the reserved "statusCode" key.');
  }
}
