import type { ApiResponse, HelloResponse } from "{{NPM_SCOPE}}/shared-types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchHello(): Promise<HelloResponse | null> {
  const res = await fetch(`${BASE}/hello`);
  const body = (await res.json()) as ApiResponse<HelloResponse>;
  return body.ok ? body.data : null;
}
