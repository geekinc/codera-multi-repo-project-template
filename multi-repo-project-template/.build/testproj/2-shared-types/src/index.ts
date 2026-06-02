// testproj shared types — the single source of truth across repos.
// Bump the package version and publish BEFORE consumers rely on new shapes.

export interface Entity {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface User extends Entity {
  email: string;
  displayName: string;
  roles: string[];
}

export interface WorkItem<TPayload = unknown> extends Entity {
  type: string;
  status: "pending" | "in_progress" | "done" | "failed";
  payload: TPayload;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface HelloResponse {
  message: string;
  timestamp: string; // ISO 8601
  timezone: string;
}

export interface EndpointStat {
  endpoint: string;
  method: string;
  callCount: number;
}

export interface EndpointMetrics {
  windowHours: number;
  endpoints: EndpointStat[];
}
