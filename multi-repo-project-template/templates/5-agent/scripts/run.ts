import { readFileSync } from "node:fs";
import type { WorkItem, ApiResponse } from "{{NPM_SCOPE}}/shared-types";

// Loads local config and polls the backend for work. Replace fetch logic with
// your real queue consumer / API client.
interface AgentConfig {
  apiBaseUrl: string;
  pollIntervalMs: number;
}

function loadConfig(): AgentConfig {
  const raw = readFileSync(new URL("../config/agent.config.json", import.meta.url), "utf-8");
  return JSON.parse(raw) as AgentConfig;
}

async function fetchNext(cfg: AgentConfig): Promise<WorkItem | null> {
  const res = await fetch(`${cfg.apiBaseUrl}/work/next`);
  const body = (await res.json()) as ApiResponse<WorkItem>;
  return body.ok ? body.data : null;
}

async function main() {
  const cfg = loadConfig();
  console.log(`Agent starting against ${cfg.apiBaseUrl}`);
  const item = await fetchNext(cfg);
  console.log("Next work item:", item);
  // Load the matching prompt from prompts/ and dispatch to your AI runner here.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
