import { describe, expect, it, vi } from "vitest";

import { ResponseAlreadyCommittedError, ResponseAlreadyEndedError } from "../src/errors";
import * as httpErrors from "../src/http-error";
import { ImATeapot, InternalServerError, isHttpError, MethodNotAllowed } from "../src/http-error";
import type { HttpResponse } from "../src/response";

describe("HTTP errors", () => {
  it("sends its status, canonical name, and user details as JSON", () => {
    const response = responseSpy();
    const error = new InternalServerError({ message: "Something broke", requestId: "request-1" });

    expect(error.send(response.value)).toBe(response.value);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith({
      error: "InternalServerError",
      statusCode: 500,
      message: "Something broke",
      requestId: "request-1",
    });
  });

  it("supports status-specific sending behavior", () => {
    const response = responseSpy();
    const error = new MethodNotAllowed({ allowedMethods: ["GET", "POST"] });

    error.send(response.value);

    expect(response.header).toHaveBeenCalledWith("allow", "GET, POST");
    expect(response.send).toHaveBeenCalledWith({
      error: "MethodNotAllowed",
      statusCode: 405,
      allowedMethods: ["GET", "POST"],
    });
  });

  it("does not touch error headers after the response has been committed", () => {
    const response = responseSpy({ headersSent: true });
    const error = new MethodNotAllowed({ allowedMethods: ["GET"] });

    expect(() => error.send(response.value)).toThrow(
      expect.objectContaining({ code: ResponseAlreadyCommittedError.code }),
    );
    expect(response.status).not.toHaveBeenCalled();
    expect(response.header).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
  });

  it("does not attempt an error response after the response has ended", () => {
    const response = responseSpy({ writableEnded: true });

    expect(() => new InternalServerError().send(response.value)).toThrow(
      expect.objectContaining({ code: ResponseAlreadyEndedError.code }),
    );
    expect(response.status).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
  });

  it("includes ImATeapot and recognizes sendable throwable errors", () => {
    const error = new ImATeapot({ message: "Short and stout" });

    expect(error.statusCode).toBe(418);
    expect(isHttpError(error)).toBe(true);
  });

  it("provides every standard HTTP client and server error", () => {
    for (const [ErrorType, statusCode, name] of standardHttpErrors) {
      const error = new ErrorType();
      expect(error.statusCode).toBe(statusCode);
      expect(error.name).toBe(name);
      expect(isHttpError(error)).toBe(true);
    }
  });

  it("rejects reserved response keys at runtime", () => {
    expect(() => new InternalServerError({ error: "Override" } as never)).toThrow(TypeError);
    expect(() => new InternalServerError({ statusCode: 200 } as never)).toThrow(TypeError);
  });
});

function responseSpy(state: { headersSent?: boolean; writableEnded?: boolean } = {}) {
  const value = {} as HttpResponse;
  const status = vi.fn(() => value);
  const header = vi.fn(() => value);
  const send = vi.fn(() => value);
  Object.assign(value, {
    raw: {
      destroyed: false,
      headersSent: state.headersSent ?? false,
      writableEnded: state.writableEnded ?? false,
    },
    wrapUnsendable: () => {
      if (state.writableEnded) return new ResponseAlreadyEndedError();
      if (state.headersSent) return new ResponseAlreadyCommittedError();
      return undefined;
    },
    status,
    header,
    send,
  });
  return { value, status, header, send };
}

type StandardHttpErrorConstructor = new () => httpErrors.JsonHttpError;

const standardHttpErrors: Array<readonly [type: StandardHttpErrorConstructor, statusCode: number, name: string]> = [
  [httpErrors.BadRequest, 400, "BadRequest"],
  [httpErrors.Unauthorized, 401, "Unauthorized"],
  [httpErrors.PaymentRequired, 402, "PaymentRequired"],
  [httpErrors.Forbidden, 403, "Forbidden"],
  [httpErrors.NotFound, 404, "NotFound"],
  [httpErrors.MethodNotAllowed, 405, "MethodNotAllowed"],
  [httpErrors.NotAcceptable, 406, "NotAcceptable"],
  [httpErrors.ProxyAuthenticationRequired, 407, "ProxyAuthenticationRequired"],
  [httpErrors.RequestTimeout, 408, "RequestTimeout"],
  [httpErrors.Conflict, 409, "Conflict"],
  [httpErrors.Gone, 410, "Gone"],
  [httpErrors.LengthRequired, 411, "LengthRequired"],
  [httpErrors.PreconditionFailed, 412, "PreconditionFailed"],
  [httpErrors.PayloadTooLarge, 413, "PayloadTooLarge"],
  [httpErrors.URITooLong, 414, "URITooLong"],
  [httpErrors.UnsupportedMediaType, 415, "UnsupportedMediaType"],
  [httpErrors.RangeNotSatisfiable, 416, "RangeNotSatisfiable"],
  [httpErrors.ExpectationFailed, 417, "ExpectationFailed"],
  [httpErrors.ImATeapot, 418, "ImATeapot"],
  [httpErrors.MisdirectedRequest, 421, "MisdirectedRequest"],
  [httpErrors.UnprocessableEntity, 422, "UnprocessableEntity"],
  [httpErrors.Locked, 423, "Locked"],
  [httpErrors.FailedDependency, 424, "FailedDependency"],
  [httpErrors.TooEarly, 425, "TooEarly"],
  [httpErrors.UpgradeRequired, 426, "UpgradeRequired"],
  [httpErrors.PreconditionRequired, 428, "PreconditionRequired"],
  [httpErrors.TooManyRequests, 429, "TooManyRequests"],
  [httpErrors.RequestHeaderFieldsTooLarge, 431, "RequestHeaderFieldsTooLarge"],
  [httpErrors.UnavailableForLegalReasons, 451, "UnavailableForLegalReasons"],
  [httpErrors.InternalServerError, 500, "InternalServerError"],
  [httpErrors.NotImplemented, 501, "NotImplemented"],
  [httpErrors.BadGateway, 502, "BadGateway"],
  [httpErrors.ServiceUnavailable, 503, "ServiceUnavailable"],
  [httpErrors.GatewayTimeout, 504, "GatewayTimeout"],
  [httpErrors.HTTPVersionNotSupported, 505, "HTTPVersionNotSupported"],
  [httpErrors.VariantAlsoNegotiates, 506, "VariantAlsoNegotiates"],
  [httpErrors.InsufficientStorage, 507, "InsufficientStorage"],
  [httpErrors.LoopDetected, 508, "LoopDetected"],
  [httpErrors.NotExtended, 510, "NotExtended"],
  [httpErrors.NetworkAuthenticationRequired, 511, "NetworkAuthenticationRequired"],
];
