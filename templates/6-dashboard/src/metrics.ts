import type { ApiResponse, EndpointMetrics } from "{{NPM_SCOPE}}/shared-types";
import { apiBaseUrl } from "./lib/config.ts";

// Every call reads the base URL at call time: `loadConfig()` must have
// resolved first (src/main.tsx renders nothing that calls the API until then).
export async function fetchEndpointMetrics(): Promise<EndpointMetrics | null> {
  const res = await fetch(`${apiBaseUrl()}/metrics/endpoints`);
  const body = (await res.json()) as ApiResponse<EndpointMetrics>;
  return body.ok ? body.data : null;
}
