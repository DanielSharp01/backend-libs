export const RESOURCE_NAMES = [
  "accounts",
  "audit-logs",
  "billing-profiles",
  "deployments",
  "environments",
  "feature-flags",
  "projects",
  "repositories",
  "service-accounts",
  "teams",
  "users",
  "webhooks",
] as const;

export const ROUTES_PER_RESOURCE = 12;
export const ORGANIZATION_ROUTES = 6;
export const ROUTE_COUNT = RESOURCE_NAMES.length * ROUTES_PER_RESOURCE + ORGANIZATION_ROUTES;

export type WorkloadMode = "dispatch" | "json";

export interface WorkloadRegistrar {
  scope(path: string): WorkloadRegistrar;
  route(method: string, path: string, routeId: string): void;
}

export interface WorkloadRequest {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly matched: boolean;
}

const ORGANIZATION_PREFIX = "/api/v1/organizations";

export const ROUTING_REQUESTS: readonly WorkloadRequest[] = [
  {
    name: "early static route",
    method: "GET",
    path: `${ORGANIZATION_PREFIX}/acme/accounts/search`,
    matched: true,
  },
  {
    name: "middle parameter route",
    method: "GET",
    path: `${ORGANIZATION_PREFIX}/acme/projects/project-42`,
    matched: true,
  },
  {
    name: "late deeply nested route",
    method: "GET",
    path: `${ORGANIZATION_PREFIX}/acme/webhooks/webhook-42/events/event-7`,
    matched: true,
  },
  {
    name: "late route with encoded parameters",
    method: "PATCH",
    path: `${ORGANIZATION_PREFIX}/north%20america/webhooks/hook%2F42/events/event%207`,
    matched: true,
  },
  {
    name: "path not found",
    method: "GET",
    path: `${ORGANIZATION_PREFIX}/acme/not-a-resource/value`,
    matched: false,
  },
  {
    name: "method not allowed",
    method: "TRACE",
    path: `${ORGANIZATION_PREFIX}/acme/webhooks/webhook-42/events/event-7`,
    matched: false,
  },
];

export const JSON_REQUESTS = ROUTING_REQUESTS.filter((request) => request.matched);

export function registerRepresentativeApi(root: WorkloadRegistrar): void {
  const organizations = root.scope("/api").scope("/v1").scope("/organizations/:organizationId");

  organizations.route("GET", "/", "organizations:list");
  organizations.route("POST", "/", "organizations:create");
  organizations.route("GET", "/current", "organizations:current");
  organizations.route("GET", "/settings", "organizations:settings:get");
  organizations.route("PATCH", "/settings", "organizations:settings:update");
  organizations.route("GET", "/usage", "organizations:usage");

  for (const resourceName of RESOURCE_NAMES) {
    const resource = organizations.scope(`/${resourceName}`);
    const routeId = (operation: string) => `${resourceName}:${operation}`;

    resource.route("GET", "/", routeId("list"));
    resource.route("POST", "/", routeId("create"));
    resource.route("GET", "/search", routeId("search"));
    resource.route("GET", "/:recordId", routeId("get"));
    resource.route("PUT", "/:recordId", routeId("replace"));
    resource.route("PATCH", "/:recordId", routeId("update"));
    resource.route("DELETE", "/:recordId", routeId("delete"));
    resource.route("GET", "/:recordId/events", routeId("events:list"));
    resource.route("POST", "/:recordId/events", routeId("events:create"));
    resource.route("GET", "/:recordId/events/:eventId", routeId("events:get"));
    resource.route("PATCH", "/:recordId/events/:eventId", routeId("events:update"));
    resource.route("DELETE", "/:recordId/events/:eventId", routeId("events:delete"));
  }
}

export function responsePayload(routeId: string, params: Record<string, string | string[]>): object {
  return {
    ok: true,
    routeId,
    params,
    data: {
      id: params.eventId ?? params.recordId ?? params.organizationId,
      status: "active",
      tags: ["representative", "json-api"],
    },
  };
}
