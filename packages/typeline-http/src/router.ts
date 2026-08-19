import {
  createServer as createHttpServer,
  type IncomingMessage,
  type RequestListener,
  type Server as HttpServer,
  type ServerOptions as HttpServerOptions,
  type ServerResponse,
} from "node:http";
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
  type ServerOptions as HttpsServerOptions,
} from "node:https";

import type { Awaitable } from "@danielsharp/common";
import {
  dispatcher,
  typeline,
  type DispatcherState,
  type Middleware,
  type Pushable,
  type Typeline,
  type TypelineBuilder,
} from "@danielsharp/typeline";
import type { ZodType } from "zod";

import {
  BodyFormatError,
  BodySizeError,
  FileNotFoundError,
  HeaderFormatError,
  HttpValidationError,
  type HttpValidationSource,
  MalformedPathEncodingError,
  RouteNotMatchedError,
  RouterCompiledError,
  RouterNotCompiledError,
} from "./errors";
import {
  BadRequest,
  type HttpError,
  InternalServerError,
  isHttpError,
  MethodNotAllowed,
  NotFound,
  PayloadTooLarge,
  UnsupportedMediaType,
} from "./http-error";
import type { HttpMetadata } from "./metadata";
import { httpRequest, type HttpRequest } from "./request";
import { httpResponse, type HttpResponse } from "./response";
import { httpRouteResolver } from "./resolver";

export interface HttpContext {
  req: HttpRequest;
  res: HttpResponse;
}

interface MountBaseOptions {
  port: number;
  hostname?: string;
  onError: (error: unknown, input: unknown, context: HttpContext) => Awaitable<any>;
}

interface HttpMountOptions extends MountBaseOptions {
  http?: HttpServerOptions;
  https?: never;
}

interface HttpsMountOptions extends MountBaseOptions {
  http?: never;
  https: HttpsServerOptions;
}

export type MountOptions = HttpMountOptions | HttpsMountOptions;

export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
  path: string;
  contentTypes?: readonly string[];
}

export interface Router<TInitial, TCurrent, TContext> {
  scope(path: string): Router<TInitial, TCurrent, TContext>;
  use<TNext = TCurrent>(
    mw: Middleware<TCurrent, TNext, TContext, HttpMetadata> | Typeline<TCurrent, TNext, TContext, HttpMetadata>,
  ): Router<TInitial, TNext, TContext>;
  route(
    { method, path, contentTypes }: RouteDefinition,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
  get(
    path: string | Omit<RouteDefinition, "method">,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
  post(
    path: string | Omit<RouteDefinition, "method">,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
  put(
    path: string | Omit<RouteDefinition, "method">,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
  patch(
    path: string | Omit<RouteDefinition, "method">,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
  delete(
    path: string | Omit<RouteDefinition, "method">,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
  options(
    path: string | Omit<RouteDefinition, "method">,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
  head(
    path: string | Omit<RouteDefinition, "method">,
    builder: TypelineBuilder<TCurrent, any, TContext, HttpMetadata>,
  ): Router<TInitial, TCurrent, TContext>;
}

export interface RootRouter<TInitial, TCurrent, TContext> extends Router<TInitial, TCurrent, TContext> {
  readonly lines: Typeline<any, any, TContext, HttpMetadata>[];
  compile(): void;
  mount(options: HttpMountOptions): Promise<HttpServer>;
  mount(options: HttpsMountOptions): Promise<HttpsServer>;
  requestListener(options: Pick<MountBaseOptions, "onError">): RequestListener;
}

export function router<TContext extends HttpContext>(): RootRouter<{}, {}, TContext> {
  const resolver = httpRouteResolver();

  let onUserError: (error: unknown, input: unknown, context: TContext) => Awaitable<any>;

  const internal = routerInternal<TContext>({
    scope: "",
    resolver,
    lines: [typeline()],
    onError: (...args) => onUserError(...args),
  });

  return {
    ...internal,
    get lines() {
      return resolver.lines;
    },
    requestListener(options: Pick<MountBaseOptions, "onError">) {
      onUserError = options.onError;
      return (request, response) => {
        const context = httpContext(request, response);
        try {
          const line = resolver.resolve(context);
          line.push({}, context).catch(() => undefined);
        } catch (error) {
          onUserError(error, {}, context as TContext);
        }
      };
    },
    compile() {
      resolver.compile();
    },
    async mount(options: MountOptions) {
      onUserError = options.onError;
      if (options.http !== undefined && options.https !== undefined) {
        throw new TypeError('The "http" and "https" mount options are mutually exclusive.');
      }

      const listener = this.requestListener(options);
      const server =
        options.https !== undefined
          ? createHttpsServer(options.https, listener)
          : options.http !== undefined
            ? createHttpServer(options.http, listener)
            : createHttpServer(listener);
      await listen(server, options);
      return server as any;
    },
  };
}

async function listen(server: HttpServer | HttpsServer, options: MountOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(options.port, options.hostname, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function routerInternal<TContext>(state: DispatcherState<any, any> & { scope: string }): Router<any, any, any> {
  return {
    scope(scope: string) {
      return routerInternal({ ...state, scope: `${state.scope}${scope}` });
    },
    use(mw) {
      const currentLine = state.lines[state.lines.length - 1]!;
      return routerInternal({
        ...state,
        lines: [...state.lines, currentLine.pipe(mw)],
      });
    },
    route(match, builder) {
      const currentLine = state.lines[state.lines.length - 1]!;
      const path = `${state.scope}${match.path}`;
      const line = builder(
        typeline<any, any, TContext, HttpMetadata>({ onError: state.onError })
          .pipe(currentLine)
          .pipe({
            metadata: { route: { method: match.method, path } },
          }),
      );
      state.resolver.on({ ...match, path }, line);
      return routerInternal(state);
    },
    get(match, builder) {
      return typeof match === "string"
        ? this.route({ method: "GET", path: match }, builder)
        : this.route({ method: "GET", ...match }, builder);
    },
    post(match, builder) {
      return typeof match === "string"
        ? this.route({ method: "POST", path: match }, builder)
        : this.route({ method: "POST", ...match }, builder);
    },
    put(match, builder) {
      return typeof match === "string"
        ? this.route({ method: "PUT", path: match }, builder)
        : this.route({ method: "PUT", ...match }, builder);
    },
    patch(match, builder) {
      return typeof match === "string"
        ? this.route({ method: "PATCH", path: match }, builder)
        : this.route({ method: "PATCH", ...match }, builder);
    },
    delete(match, builder) {
      return typeof match === "string"
        ? this.route({ method: "DELETE", path: match }, builder)
        : this.route({ method: "DELETE", ...match }, builder);
    },
    options(match, builder) {
      return typeof match === "string"
        ? this.route({ method: "OPTIONS", path: match }, builder)
        : this.route({ method: "OPTIONS", ...match }, builder);
    },
    head(match, builder) {
      return typeof match === "string"
        ? this.route({ method: "HEAD", path: match }, builder)
        : this.route({ method: "HEAD", ...match }, builder);
    },
  };
}

export function httpContext(request: IncomingMessage, response: ServerResponse): HttpContext {
  return { req: httpRequest(request), res: httpResponse(response) };
}

export function builtinErrorMapping(error: unknown): HttpError {
  if (isHttpError(error)) {
    return error;
  }
  if (RouteNotMatchedError.is(error)) {
    switch (error.resolution.status) {
      case "method-not-allowed":
        return new MethodNotAllowed({ allowedMethods: error.resolution.allowedMethods });
      case "unsupported-media-type":
        return new UnsupportedMediaType({
          allowedContentTypes: error.resolution.allowedContentTypes,
        });
      default:
        return new NotFound();
    }
  }
  if (MalformedPathEncodingError.is(error)) {
    return new BadRequest();
  }
  if (FileNotFoundError.is(error)) {
    return new NotFound();
  }
  if (HttpValidationError.is(error)) {
    return new BadRequest({ source: error.source });
  }
  if (BodyFormatError.is(error)) {
    return new BadRequest({ contentType: error.contentType });
  }
  if (BodySizeError.is(error)) {
    return new PayloadTooLarge({ maximumBodySize: error.maximumBodySize });
  }
  if (HeaderFormatError.is(error)) {
    return new BadRequest({ header: error.headerName });
  }
  return new InternalServerError();
}

export function defaultErrorHandler(
  mapper: (error: unknown, input: unknown, context: HttpContext) => HttpError | undefined,
) {
  return async (error: unknown, input: unknown, context: HttpContext) => {
    try {
      const httpError = mapper(error, input, context);
      if (!httpError) {
        return await builtinErrorMapping(error).send(context.res);
      }
      await httpError.send(context.res);
    } catch (fatalError) {
      console.error("Error inside error handler", fatalError);
    }
  };
}
