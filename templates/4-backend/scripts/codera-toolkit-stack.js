#!/usr/bin/env node
// Points the CDK CLI at the Codera CDK bootstrap's toolkit stack when the
// platform sets CODERA_CDK_QUALIFIER (SEC-049). codera-module.yaml runs it
// right before the one `cdk deploy`.
//
// - CODERA_CDK_QUALIFIER unset or empty (every build until this project's
//   AWS link is upgraded, and every local run): does NOTHING — cdk.json is
//   not touched and the deploy is exactly what it always was.
// - CODERA_CDK_QUALIFIER=codera: sets `"toolkitStackName": "CDKToolkit-Codera"`
//   in ./cdk.json, which the CDK CLI reads exactly like
//   `--toolkit-stack-name CDKToolkit-Codera` (bin/backend.ts synthesizes with
//   the same qualifier, so the stack and the CLI use the same bootstrap).
// - any other qualifier: fails the build (there is no toolkit stack for it).
//
// Why not `--toolkit-stack-name` on the deploy itself: Codera accepts only
// ONE literal `cdk deploy` form outside the default environment, so the flag
// cannot be added conditionally (`${VAR:+...}` and an if/else with two
// deploys are both refused). The setting is equivalent and keeps the deploy
// command unchanged.
"use strict";
const fs = require("fs");
const path = require("path");

const TOOLKIT_STACKS = { codera: "CDKToolkit-Codera" };

const qualifier = process.env.CODERA_CDK_QUALIFIER || "";
if (!qualifier) process.exit(0);

const toolkitStackName = TOOLKIT_STACKS[qualifier];
if (!toolkitStackName) {
  console.error(`codera-toolkit-stack: unknown CODERA_CDK_QUALIFIER "${qualifier}" (expected one of: ${Object.keys(TOOLKIT_STACKS).join(", ")}).`);
  process.exit(1);
}

const file = path.join(process.cwd(), "cdk.json");
const config = JSON.parse(fs.readFileSync(file, "utf8"));
if (config.toolkitStackName !== toolkitStackName) {
  config.toolkitStackName = toolkitStackName;
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
}
console.log(`codera-toolkit-stack: CODERA_CDK_QUALIFIER=${qualifier} -> cdk.json toolkitStackName "${toolkitStackName}"`);
