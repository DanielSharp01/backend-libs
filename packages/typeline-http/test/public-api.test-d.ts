import { expectTypeOf } from "vitest";

import {
  builtinErrorMapping,
  defaultErrorHandler,
  flashCookie,
  jsonResSend,
  jsonResponseMeta,
  resEnd,
  resRedirect,
  responseMeta,
  router,
  setRequestDefaults,
  swagger,
  validateBody,
  validateFile,
  validateMultipart,
  validateUrlEncoded,
  type HttpContext,
  type HttpError,
  type HttpMetadata,
  type HttpRequest,
  type HttpRedirectStatus,
  type HttpResponse,
  RouteNotMatchedError,
  type Router,
  type SwaggerBuildResult,
  type SwaggerOptions,
  type SwaggerWarning,
  type ValidatedInput,
} from "../src/index";
import { httpContext, httpRequest, httpResponse, isHttpResponse } from "../src/node";

expectTypeOf(router).toBeFunction();
expectTypeOf(builtinErrorMapping).toBeFunction();
expectTypeOf(defaultErrorHandler).toBeFunction();
expectTypeOf(flashCookie).toBeFunction();
expectTypeOf(jsonResSend).toBeFunction();
expectTypeOf(jsonResponseMeta).toBeFunction();
expectTypeOf(resEnd).toBeFunction();
expectTypeOf(resRedirect).toBeFunction();
expectTypeOf(responseMeta).toBeFunction();
expectTypeOf(setRequestDefaults).toBeFunction();
expectTypeOf(swagger).toBeFunction();
expectTypeOf(validateBody).toBeFunction();
expectTypeOf(validateFile).toBeFunction();
expectTypeOf(validateMultipart).toBeFunction();
expectTypeOf(validateUrlEncoded).toBeFunction();
expectTypeOf(httpContext).toBeFunction();
expectTypeOf(httpRequest).toBeFunction();
expectTypeOf(httpResponse).toBeFunction();
expectTypeOf(isHttpResponse).toBeFunction();

type PublicTypes =
  | HttpContext
  | HttpError
  | HttpMetadata
  | HttpRequest
  | HttpRedirectStatus
  | HttpResponse
  | Router<{}, {}, HttpContext>
  | SwaggerBuildResult
  | SwaggerOptions
  | SwaggerWarning;

expectTypeOf<PublicTypes>().not.toBeNever();

declare const unmatched: RouteNotMatchedError;
expectTypeOf(unmatched.code).toEqualTypeOf<"HTTP_ROUTE_NOT_MATCHED">();
expectTypeOf(unmatched.resolution).toMatchTypeOf<import("../src/index").HttpRouteUnmatchedResolution>();
expectTypeOf(unmatched.route).toEqualTypeOf<{ path: string; method: string; contentType: string }>();

type PublicValidatedInput = ValidatedInput<{ authenticated: true }, "query", { page: number }>;
expectTypeOf<PublicValidatedInput["authenticated"]>().toEqualTypeOf<true>();
expectTypeOf<PublicValidatedInput["query"]["page"]>().toEqualTypeOf<number>();

// @ts-expect-error Route branch narrowing was removed from the public API.
type RemovedRouteBranch = import("../src/index").HttpRouteBranch<unknown, unknown, object>;

// @ts-expect-error Metadata merging remains an implementation detail.
type InternalMetadataMerge = typeof import("../src/index").mergeHttpMetadata;

// @ts-expect-error Result validators were removed.
type RemovedResultValidator = typeof import("../src/index").validateQueryResult;

// @ts-expect-error Warning helper aliases stay behind the exported discriminated union.
type InternalSwaggerWarningCode = import("../src/index").SwaggerWarningCode;
