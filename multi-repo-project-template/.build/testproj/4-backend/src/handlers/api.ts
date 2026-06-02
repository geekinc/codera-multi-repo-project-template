import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { ApiResponse, HelloResponse, EndpointMetrics, EndpointStat } from "@testproj/shared-types";

const ddb = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

function json<T>(statusCode: number, body: ApiResponse<T>): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
    body: JSON.stringify(body),
  };
}

async function trackCall(method: string, path: string): Promise<void> {
  const hour = new Date().toISOString().slice(0, 13);
  const ttl = Math.floor(Date.now() / 1000) + 86400;
  await ddb.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: {
      pk: { S: `METRICS#${method}#${path}` },
      sk: { S: `HOUR#${hour}` },
    },
    UpdateExpression: "ADD callCount :inc SET #ttl = :ttl",
    ExpressionAttributeNames: { "#ttl": "ttl" },
    ExpressionAttributeValues: { ":inc": { N: "1" }, ":ttl": { N: String(ttl) } },
  }));
}

async function getEndpointMetrics(): Promise<EndpointMetrics> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const skStart = `HOUR#${twentyFourHoursAgo.toISOString().slice(0, 13)}`;
  const skEnd = `HOUR#${now.toISOString().slice(0, 13)}~`;

  const endpoints = [
    { method: "GET", endpoint: "/hello" },
    { method: "GET", endpoint: "/metrics/endpoints" },
  ];

  const stats: EndpointStat[] = [];
  for (const ep of endpoints) {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": { S: `METRICS#${ep.method}#${ep.endpoint}` },
        ":start": { S: skStart },
        ":end": { S: skEnd },
      },
    }));
    const total = (result.Items ?? []).reduce(
      (sum: number, item: Record<string, { N?: string; S?: string }>) =>
        sum + parseInt(item.callCount?.N ?? "0", 10), 0
    );
    stats.push({ method: ep.method, endpoint: ep.endpoint, callCount: total });
  }

  return { windowHours: 24, endpoints: stats };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" }, body: "" };
  }

  trackCall(method, path).catch(() => {});

  if (method === "GET" && path === "/hello") {
    const data: HelloResponse = {
      message: "Hello, World!",
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    return json(200, { ok: true, data });
  }

  if (method === "GET" && path === "/metrics/endpoints") {
    const data = await getEndpointMetrics();
    return json(200, { ok: true, data });
  }

  return json(404, { ok: false, error: { code: "NOT_FOUND", message: `No handler for ${method} ${path}` } });
}
