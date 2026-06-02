import type { APIGatewayProxyHandler } from "aws-lambda";
import type { ApiResponse, User } from "/shared-types";

// Minimal example. Replace with real routing (e.g. via a router or framework).
export const handler: APIGatewayProxyHandler = async (event) => {
  const id = event.pathParameters?.id ?? "unknown";

  const user: User = {
    id,
    email: "example@.dev",
    displayName: "Example User",
    roles: ["user"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const body: ApiResponse<User> = { ok: true, data: user };
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
};
