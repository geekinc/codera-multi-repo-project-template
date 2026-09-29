import type { ApiResponse, HelloResponse } from "{{NPM_SCOPE}}/shared-types";
import { apiBaseUrl } from "./lib/config.ts";

// Every call reads the base URL at call time: `loadConfig()` must have
// resolved first (src/main.tsx renders nothing that calls the API until then).
export async function fetchHello(): Promise<HelloResponse | null> {
  const res = await fetch(`${apiBaseUrl()}/hello`);
  const body = (await res.json()) as ApiResponse<HelloResponse>;
  return body.ok ? body.data : null;
}
