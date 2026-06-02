import type { ApiResponse } from "/shared-types";

export interface SystemMetrics {
  queueDepth: number;
  activeAgents: number;
  errorRate: number;     // 0..1
  throughputPerMin: number;
}

export async function fetchMetrics(apiBase: string): Promise<SystemMetrics | null> {
  const res = await fetch(`${apiBase}/metrics`);
  const body = (await res.json()) as ApiResponse<SystemMetrics>;
  return body.ok ? body.data : null;
}
