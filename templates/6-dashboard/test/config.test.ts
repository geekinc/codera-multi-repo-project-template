// Runtime config loader (src/lib/config.ts) and the API client that uses it.
//
// Runs on Node's built-in test runner with type stripping (`npm test`, Node
// >= 22.6) — no test framework dependency. `fetch` is stubbed per test.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Record every request and answer from `routes` (by URL). */
function stubFetch(routes: Record<string, Response>): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const res = routes[url];
    if (!res) throw new Error(`unexpected fetch ${url}`);
    return res;
  }) as typeof fetch;
  return calls;
}

// lib/config caches at module level — each case gets a fresh module instance.
let n = 0;
const freshConfig = () => import(`../src/lib/config.ts?case=${++n}`) as Promise<typeof import("../src/lib/config.ts")>;

test("getConfig throws before loadConfig resolves", async () => {
  const { getConfig } = await freshConfig();
  assert.throws(() => getConfig(), /Config not loaded/);
});

test("loadConfig fetches /config.json once and caches it", async () => {
  const calls = stubFetch({ "/config.json": json({ backend: { RestApiUrl: "https://a.example/prod" } }) });
  const { loadConfig, getConfig } = await freshConfig();
  await loadConfig();
  await loadConfig();
  assert.deepEqual(calls, ["/config.json"]);
  assert.equal(getConfig().backend.RestApiUrl, "https://a.example/prod");
});

test("loadConfig rejects when /config.json is not served", async () => {
  stubFetch({ "/config.json": new Response("nope", { status: 404 }) });
  const { loadConfig } = await freshConfig();
  await assert.rejects(loadConfig(), /Failed to load config: 404/);
});

test("apiBaseUrl strips the trailing slash a CDK RestApi.url carries", async () => {
  stubFetch({ "/config.json": json({ backend: { RestApiUrl: "https://abc.execute-api.ca-central-1.amazonaws.com/prod/" } }) });
  const { loadConfig, apiBaseUrl } = await freshConfig();
  await loadConfig();
  assert.equal(apiBaseUrl(), "https://abc.execute-api.ca-central-1.amazonaws.com/prod");
});

test("no backend URL in config.json (and no VITE_API_BASE_URL) → same-origin relative paths", async () => {
  stubFetch({ "/config.json": json({}) });
  const { loadConfig, getConfig, apiBaseUrl } = await freshConfig();
  await loadConfig();
  assert.deepEqual(getConfig().backend, {});
  assert.equal(apiBaseUrl(), "");
});

test("the API client prefixes requests with config.json's backend URL", async () => {
  // src/metrics.ts imports ../src/lib/config.ts WITHOUT a query, so load that same instance.
  const calls = stubFetch({
    "/config.json": json({ backend: { RestApiUrl: "https://abc.execute-api.ca-central-1.amazonaws.com/prod/" } }),
    "https://abc.execute-api.ca-central-1.amazonaws.com/prod/metrics/endpoints": json({
      ok: true,
      data: { windowHours: 24, endpoints: [] },
    }),
  });
  const { loadConfig } = await import("../src/lib/config.ts");
  const { fetchEndpointMetrics } = await import("../src/metrics.ts");
  await loadConfig();
  const metrics = await fetchEndpointMetrics();
  assert.equal(metrics?.windowHours, 24);
  assert.deepEqual(calls, ["/config.json", "https://abc.execute-api.ca-central-1.amazonaws.com/prod/metrics/endpoints"]);
});
