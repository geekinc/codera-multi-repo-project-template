//  shared types — the single source of truth across repos.
// Bump the package version and publish BEFORE consumers rely on new shapes.

export interface Entity {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// Example domain object. Replace with your real models.
export interface User extends Entity {
  email: string;
  displayName: string;
  roles: string[];
}

// Shape of items passed on the work queue between backend and agent.
export interface WorkItem<TPayload = unknown> extends Entity {
  type: string;
  status: "pending" | "in_progress" | "done" | "failed";
  payload: TPayload;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
