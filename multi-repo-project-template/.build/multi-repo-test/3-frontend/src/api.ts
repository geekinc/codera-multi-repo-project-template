import type { User, ApiResponse } from "/shared-types";

// Demonstrates consuming the shared type contract from CodeArtifact.
export async function fetchUser(id: string): Promise<User | null> {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  const res = await fetch(`${base}/users/${id}`);
  const body = (await res.json()) as ApiResponse<User>;
  return body.ok ? body.data : null;
}
