// xyra-core runs as its own separate server — not bundled with this app — so
// every call to it is a plain cross-origin fetch(), same pattern as xyra-web's
// webapp/model/config.js.
export const AUTH_BASE_URL = "http://localhost:4004";

// ponytail: hardcoded to the one fixed test tenant, matching xyra-web's
// TEST_SUBDOMAIN — there's no Host-header-based Tenant Resolver yet.
export const TEST_SUBDOMAIN = "xyrademo";
