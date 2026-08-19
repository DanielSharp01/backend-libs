import { expectTypeOf } from "vitest";

import {
  BadRequest,
  Forbidden,
  ImATeapot,
  InternalServerError,
  JsonHttpError,
  MethodNotAllowed,
  NotFound,
  UnsupportedMediaType,
  UnprocessableEntity,
  type HttpError,
} from "../src/http-error";

expectTypeOf(new BadRequest()).toMatchTypeOf<HttpError>();
expectTypeOf(new Forbidden()).toMatchTypeOf<HttpError>();
expectTypeOf(new NotFound()).toMatchTypeOf<HttpError>();
expectTypeOf(new MethodNotAllowed({ allowedMethods: ["GET"] })).toMatchTypeOf<HttpError>();
expectTypeOf(new UnsupportedMediaType()).toMatchTypeOf<HttpError>();
expectTypeOf(new UnprocessableEntity()).toMatchTypeOf<HttpError>();
expectTypeOf(new ImATeapot()).toMatchTypeOf<HttpError>();
expectTypeOf(new InternalServerError({ message: "detail" })).toMatchTypeOf<HttpError>();
expectTypeOf(new JsonHttpError("CustomHttpError", 599, { message: "custom" })).toMatchTypeOf<HttpError>();

// @ts-expect-error Reserved payload keys cannot be supplied as user details.
new InternalServerError({ error: "Override" });
// @ts-expect-error Reserved payload keys cannot be supplied as user details.
new InternalServerError({ statusCode: 200 });
