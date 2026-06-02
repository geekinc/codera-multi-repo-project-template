import type { ApiResponse, EndpointMetrics } from "{{NPM_SCOPE}}/shared-types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchEndpointMetrics(): Promise<EndpointMetrics | null> {
  const res = await fetch(`${BASE}/metrics/endpoints`);
  const body = (await res.json()) as ApiResponse<EndpointMetrics>;
  return body.ok ? body.data : null;
}
