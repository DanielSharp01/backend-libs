import type { Resolver, Typeline } from "@danielsharp/typeline";

import { normalizeContentType, requestContentType } from "./content-type";
import {
  AmbiguousRouteError,
  DuplicateRouteError,
  MalformedPathEncodingError,
  RouteNotMatchedError,
  RouterCompiledError,
  RouterNotCompiledError,
} from "./errors";
import type { HttpMetadata } from "./metadata";
import type { HttpRouteUnmatchedResolution } from "./request";
import { compileRouteIndex, type RouteIndex } from "./route-index";
import type { HttpContext, RouteDefinition } from "./router";

export interface RuntimeRouteDefinition {
  readonly method: string;
  readonly path: string;
  readonly contentTypes?: readonly string[];
  readonly target: Typeline<any, any, HttpContext, HttpMetadata>;
}

export function assertValidHttpRouteDefinition(definition: RouteDefinition): void {
  if (definition.method.trim() === "") {
    throw new TypeError("An HTTP route method cannot be empty.");
  }
  if (definition.contentTypes?.length === 0) {
    throw new TypeError("An HTTP route must allow at least one content type.");
  }
  for (const contentType of definition.contentTypes ?? []) {
    if (normalizeContentType(contentType) === "") {
      throw new TypeError("An HTTP route cannot allow an empty content type.");
    }
  }
  assertValidRoutePath(normalizeHttpRoutePath(definition.path));
}

export function assertValidHttpScopePath(path: string): void {
  assertValidRoutePath(normalizeHttpRoutePath(path));
}

export function joinHttpRoutePath(prefix: string, path: string): string {
  const normalizedPrefix = normalizeHttpRoutePath(prefix);
  const normalizedPath = normalizeHttpRoutePath(path);
  if (normalizedPrefix === "/") return normalizedPath;
  if (normalizedPath === "/") return normalizedPrefix;
  return `${normalizedPrefix}${normalizedPath}`;
}

export function setHttpRouteCheckpoint(context: HttpContext, method: string, path: string): void {
  const normalizedPath = normalizeHttpRoutePath(path);
  const params = matchPathPrefix(normalizedPath, context.req.url.pathname);
  if (!params) {
    throw new TypeError(`Selected HTTP route no longer matches scope "${normalizedPath}".`);
  }
  context.req.route = {
    method: method.trim().toUpperCase() as RouteDefinition["method"],
    path: normalizedPath,
    params,
  };
}

export interface HttpRouteResolver extends Resolver<HttpContext, HttpMetadata> {
  on(definition: RouteDefinition, line: Typeline<any, any, HttpContext, HttpMetadata>): void;
  resolve(context: HttpContext): Typeline<any, any, HttpContext, HttpMetadata>;
  compile(): void;
}

export function httpRouteResolver(): HttpRouteResolver {
  const definitions: RuntimeRouteDefinition[] = [];
  let routeIndex: RouteIndex | undefined;
  let compiled = false;

  return {
    get lines() {
      return definitions.map((definition) => definition.target);
    },
    on(definition, line) {
      if (compiled) throw new RouterCompiledError();
      const prepared = prepareRouteDefinition(definition);
      const conflicting = definitions.find(
        (registered) =>
          registered.method === prepared.method &&
          routePatternsEquivalent(registered.path, prepared.path) &&
          contentTypesOverlap(registered.contentTypes, prepared.contentTypes),
      );
      if (conflicting) {
        if (conflicting.path === prepared.path) throw new DuplicateRouteError(prepared.method, prepared.path);
        throw new AmbiguousRouteError(prepared.method, conflicting.path, prepared.path);
      }

      definitions.push({ ...prepared, target: line });
    },
    resolve(context) {
      if (!routeIndex) throw new RouterNotCompiledError();
      const contentType = requestContentType(context.req.headers);
      const indexed = routeIndex.resolve(context.req.url.pathname, context.req.method.toUpperCase(), contentType);
      if (indexed.status === "matched") {
        context.req.route = {
          method: indexed.definition.method as RouteDefinition["method"],
          path: indexed.definition.path,
          params: indexed.params,
        };
        context.req.resolution = { status: "matched" };
        return indexed.definition.target;
      }

      const resolution = unmatchedRouteResolution(indexed.allowedMethods, indexed.contentTypes);
      context.req.resolution = resolution;
      throw new RouteNotMatchedError(resolution, {
        path: context.req.url.pathname,
        method: context.req.method,
        contentType,
      });
    },
    compile() {
      if (compiled) return;
      routeIndex = compileRouteIndex(definitions);
      compiled = true;
    },
  };
}

function unmatchedRouteResolution(
  allowedMethods: readonly string[],
  contentTypes: readonly string[],
): HttpRouteUnmatchedResolution {
  if (contentTypes.length > 0) {
    return {
      status: "unsupported-media-type",
      allowedMethods: [...allowedMethods].sort(),
      allowedContentTypes: [...contentTypes].sort(),
    };
  }
  if (allowedMethods.length > 0) {
    return { status: "method-not-allowed", allowedMethods: [...allowedMethods].sort() };
  }
  return { status: "path-not-found" };
}

function prepareRouteDefinition(definition: RouteDefinition): Omit<RuntimeRouteDefinition, "target"> {
  assertValidHttpRouteDefinition(definition);
  return Object.freeze({
    method: definition.method.trim().toUpperCase(),
    path: normalizeHttpRoutePath(definition.path),
    ...(definition.contentTypes === undefined
      ? {}
      : { contentTypes: Object.freeze([...new Set(definition.contentTypes.map(normalizeContentType))]) }),
  });
}

function contentTypesOverlap(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return left === undefined || right === undefined || left.some((contentType) => right.includes(contentType));
}

function normalizeHttpRoutePath(path: string): string {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  return normalized === "" ? "/" : `/${normalized}`;
}

function assertValidRoutePath(path: string): void {
  const parameterNames = new Set<string>();
  const segments = path.split("/").filter(Boolean);

  for (const [index, segment] of segments.entries()) {
    const marker = segment[0];
    if (marker !== ":" && marker !== "*") continue;

    const declaredName = segment.slice(1);
    if (marker === ":" && declaredName === "") {
      throw new TypeError(`Route path "${path}" contains an empty parameter name.`);
    }
    if (declaredName.includes(":") || declaredName.includes("*")) {
      throw new TypeError(`Route path "${path}" contains a malformed parameter declaration.`);
    }
    if (marker === "*" && index !== segments.length - 1) {
      throw new TypeError(`Route path "${path}" contains a wildcard that is not the final segment.`);
    }

    const name = declaredName || "wildcard";
    if (parameterNames.has(name)) {
      throw new TypeError(`Route path "${path}" declares parameter "${name}" more than once.`);
    }
    parameterNames.add(name);
  }
}

function routePatternsEquivalent(left: string, right: string): boolean {
  const leftSegments = pathSegments(left);
  const rightSegments = pathSegments(right);
  return (
    leftSegments.length === rightSegments.length &&
    leftSegments.every((segment, index) => segmentsEquivalent(segment, rightSegments[index]!))
  );
}

function segmentsEquivalent(left: string, right: string): boolean {
  const leftKind = routeSegmentKind(left);
  const rightKind = routeSegmentKind(right);
  return leftKind === rightKind && (leftKind !== "static" || left === right);
}

function routeSegmentKind(segment: string): "static" | "parameter" | "wildcard" {
  return segment.startsWith(":") ? "parameter" : segment.startsWith("*") ? "wildcard" : "static";
}

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matchPathPrefix(path: string, pathname: string): Record<string, string> | undefined {
  return matchPathSegments(path, pathname, true);
}

function matchPathSegments(path: string, pathname: string, prefix: boolean): Record<string, string> | undefined {
  const routeSegments = pathSegments(path);
  const valueSegments = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};

  for (let index = 0; index < routeSegments.length; index += 1) {
    const segment = routeSegments[index]!;
    const value = valueSegments[index];
    if (segment.startsWith("*")) {
      if (index !== routeSegments.length - 1) return undefined;
      params[segment.slice(1) || "wildcard"] = decodePathComponent(valueSegments.slice(index).join("/"));
      return params;
    }
    if (value === undefined) return undefined;
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = decodePathComponent(value);
    } else if (segment !== value) {
      return undefined;
    }
  }

  return prefix || valueSegments.length === routeSegments.length ? params : undefined;
}

function decodePathComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) throw new MalformedPathEncodingError(value, error);
    throw error;
  }
}
