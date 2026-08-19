import { addUnique } from "@danielsharp/common";

import { MalformedPathEncodingError } from "./errors";
import type { RuntimeRouteDefinition } from "./resolver";

type IndexedRouteParameter = {
  readonly index: number;
  readonly name: string;
  readonly wildcard: boolean;
};

type IndexedRouteDefinition = {
  readonly definition: RuntimeRouteDefinition;
  readonly parameters: readonly IndexedRouteParameter[];
};

type RouteIndexNode = {
  readonly staticChildren: Map<string, RouteIndexNode>;
  parameterChild?: RouteIndexNode;
  readonly terminal: IndexedRouteDefinition[];
  readonly wildcard: IndexedRouteDefinition[];
};

type RouteIndexCandidates = {
  readonly definitions: readonly IndexedRouteDefinition[];
  readonly valueSegments: readonly string[];
  readonly decodedSegments: readonly (string | undefined)[];
  readonly decodedWildcards: readonly (string | undefined)[];
};

export type RouteIndexResolution =
  | {
      readonly status: "matched";
      readonly definition: RuntimeRouteDefinition;
      readonly params: Record<string, string>;
    }
  | {
      readonly status: "unmatched";
      readonly allowedMethods: string[];
      readonly contentTypes: string[];
    };

export interface RouteIndex {
  resolve(pathname: string, method: string, contentType: string): RouteIndexResolution;
}

export function compileRouteIndex(definitions: readonly RuntimeRouteDefinition[]): RouteIndex {
  const root = routeIndexNode();

  for (const definition of definitions) {
    const segments = pathSegments(definition.path);
    const parameters: IndexedRouteParameter[] = [];
    let node = root;
    let terminal = true;

    routeSegments: for (const [index, segment] of segments.entries()) {
      switch (routeSegmentKind(segment)) {
        case "static": {
          let child = node.staticChildren.get(segment);
          if (!child) {
            child = routeIndexNode();
            node.staticChildren.set(segment, child);
          }
          node = child;
          break;
        }
        case "parameter":
          parameters.push({ index, name: segment.slice(1), wildcard: false });
          node = node.parameterChild ??= routeIndexNode();
          break;
        case "wildcard": {
          parameters.push({ index, name: segment.slice(1) || "wildcard", wildcard: true });
          node.wildcard.push({ definition, parameters: Object.freeze(parameters) });
          terminal = false;
          break routeSegments;
        }
      }
    }

    if (terminal) {
      node.terminal.push({ definition, parameters: Object.freeze(parameters) });
    }
  }

  return {
    resolve(pathname, method, contentType) {
      return resolveIndexedRoute(root, pathname, method, contentType);
    },
  };
}

function routeIndexNode(): RouteIndexNode {
  return { staticChildren: new Map(), terminal: [], wildcard: [] };
}

function resolveIndexedRoute(
  index: RouteIndexNode,
  pathname: string,
  method: string,
  contentType: string,
): RouteIndexResolution {
  const candidates = indexedRouteCandidates(index, pathname);
  const selected = candidates.definitions.find(
    ({ definition }) =>
      definition.method === method &&
      (definition.contentTypes === undefined || definition.contentTypes.includes(contentType)),
  );

  if (selected) {
    return {
      status: "matched",
      definition: selected.definition,
      params: indexedRouteParams(selected, candidates),
    };
  }

  const allowedMethods: string[] = [];
  const contentTypes: string[] = [];
  for (const candidate of candidates.definitions) {
    addUnique(allowedMethods, candidate.definition.method);
    if (candidate.definition.method === method && candidate.definition.contentTypes !== undefined) {
      addUnique(contentTypes, ...candidate.definition.contentTypes);
    }
  }
  return { status: "unmatched", allowedMethods, contentTypes };
}

function indexedRouteCandidates(index: RouteIndexNode, pathname: string): RouteIndexCandidates {
  const valueSegments = pathname.split("/").filter(Boolean);
  const decodedSegments: (string | undefined)[] = [];
  const decodedWildcards: (string | undefined)[] = [];
  const definitions: IndexedRouteDefinition[] = [];

  function decodedSegment(index: number): string {
    return (decodedSegments[index] ??= decodePathComponent(valueSegments[index]!));
  }

  function decodedWildcard(index: number): string {
    return (decodedWildcards[index] ??= decodePathComponent(valueSegments.slice(index).join("/")));
  }

  function visit(node: RouteIndexNode, segmentIndex: number): void {
    if (segmentIndex === valueSegments.length) {
      // An exact route is more specific than a wildcard matching an empty remainder.
      definitions.push(...node.terminal);
      if (node.wildcard.length > 0) {
        decodedWildcard(segmentIndex);
        definitions.push(...node.wildcard);
      }
      return;
    }

    const value = valueSegments[segmentIndex]!;
    // Traversal order is the route-specificity order: static, parameter, then wildcard. The first
    // candidate accepting the request method and content type is therefore the selected route.
    const staticChild = node.staticChildren.get(value);
    if (staticChild) visit(staticChild, segmentIndex + 1);

    if (node.parameterChild) {
      decodedSegment(segmentIndex);
      visit(node.parameterChild, segmentIndex + 1);
    }

    if (node.wildcard.length > 0) {
      decodedWildcard(segmentIndex);
      definitions.push(...node.wildcard);
    }
  }

  visit(index, 0);
  return { definitions, valueSegments, decodedSegments, decodedWildcards };
}

function indexedRouteParams(indexed: IndexedRouteDefinition, candidates: RouteIndexCandidates): Record<string, string> {
  const params: Record<string, string> = {};
  for (const parameter of indexed.parameters) {
    params[parameter.name] = parameter.wildcard
      ? (candidates.decodedWildcards[parameter.index] ??
        decodePathComponent(candidates.valueSegments.slice(parameter.index).join("/")))
      : (candidates.decodedSegments[parameter.index] ??
        decodePathComponent(candidates.valueSegments[parameter.index]!));
  }
  return params;
}

function routeSegmentKind(segment: string): "static" | "parameter" | "wildcard" {
  return segment.startsWith(":") ? "parameter" : segment.startsWith("*") ? "wildcard" : "static";
}

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function decodePathComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) throw new MalformedPathEncodingError(value, error);
    throw error;
  }
}
