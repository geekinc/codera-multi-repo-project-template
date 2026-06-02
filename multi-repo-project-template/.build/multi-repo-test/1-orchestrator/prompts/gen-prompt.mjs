#!/usr/bin/env node
/**
 * gen-prompt.mjs — assemble a sub-agent prompt from a task file plus the
 * architecture overview, so the prompt you hand to Claude Code in another repo
 * always carries the current contract.
 *
 * Usage: node prompts/gen-prompt.mjs tasks/T-0001-example.md > prompts/T-0001.prompt.md
 */
import { readFileSync } from "node:fs";
import { argv } from "node:process";

const taskPath = argv[2];
if (!taskPath) {
  console.error("Usage: node gen-prompt.mjs <task-file.md>");
  process.exit(1);
}

const task = readFileSync(taskPath, "utf-8");
let architecture = "";
try {
  architecture = readFileSync(new URL("../architecture/overview.md", import.meta.url), "utf-8");
} catch {
  architecture = "(architecture/overview.md not found)";
}

const prompt = `# Sub-agent prompt for {{PROJECT_NAME}}

You are working in ONE repository of the {{PROJECT_NAME}} multi-repo system.
Honor the shared contract and do not invent types outside \`{{NPM_SCOPE}}/shared-types\`.

## Architecture (read-only context)
${architecture}

## Your task
${task}

## Output expectations
- Make only the changes required by the acceptance criteria.
- If a shared type must change, STOP and flag it — that change belongs in the
  shared-types repo and must be published first.
`;

process.stdout.write(prompt);
