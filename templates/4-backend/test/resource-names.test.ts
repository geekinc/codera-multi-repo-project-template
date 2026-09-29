// Environment namespacing of the CDK app (bin/backend.ts + lib/backend-stack.ts).
//
// Several Codera environments of this project may share one AWS account
// (codera-module.yaml `build.env_namespaced: true`). That holds only while:
// - the app defines exactly ONE stack, whose construct id and CloudFormation
//   stackName are $CODERA_STACK_NAME, with no dependency stacks (the build
//   runs `cdk deploy "$CODERA_STACK_NAME" --exclusively`, and the platform
//   marks a non-default build deploy_failed if that stack does not exist);
// - every explicitly named resource carries the per-environment prefix, and
//   the default environment's names stay byte-identical to what existing
//   stacks already have (a changed physical name REPLACES the resource).
//
// Each case runs the REAL app entry (bin/backend.ts) with the env vars the
// platform sets, into a temp cloud assembly. If you add a named resource, add
// it to EXPECTED below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Template } from "aws-cdk-lib/assertions";

const ROOT = path.join(__dirname, "..");
const PROJECT = "{{PROJECT_NAME}}";
const DEFAULT_STACK = `${PROJECT}-backend`;
const OTHER_ENV = "production";

/** Every named resource: `<ResourceType>.<Property>` → name for a given prefix. */
const EXPECTED: Record<string, (prefix: string) => string> = {
  "AWS::ApiGateway::RestApi.Name": (prefix) => `${prefix}-api`,
  "AWS::SSM::Parameter.Name": (prefix) => `/${prefix}/api-base-url`,
};

// Top-level `*Name` properties that are NOT account-level physical names:
// they name something inside a resource (a stage, a role's inline policy) or
// reference another resource.
const NOT_PHYSICAL = new Set([
  "AWS::ApiGateway::Stage.StageName",
  "AWS::IAM::Policy.PolicyName",
  "AWS::Lambda::Permission.FunctionName",
]);

interface Synth {
  manifest: {
    artifacts: Record<string, { type: string; properties?: { stackName?: string }; dependencies?: string[] }>;
  };
  stackArtifacts: string[];
  template: Template;
  json: { Resources: Record<string, { Type: string; Properties?: Record<string, unknown> }> };
}

/** Synthesize the app with exactly `vars` (CODERA_* unset unless given). */
function synth(vars: Record<string, string>): Synth {
  const outdir = mkdtempSync(path.join(tmpdir(), "backend-synth-"));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, ...vars, CDK_OUTDIR: outdir, TS_NODE_TRANSPILE_ONLY: "true" };
    for (const k of ["CODERA_ENV", "CODERA_STACK_NAME"]) if (!(k in vars)) delete env[k];
    execFileSync(process.execPath, ["--require", "ts-node/register", path.join(ROOT, "bin/backend.ts")], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const manifest = JSON.parse(readFileSync(path.join(outdir, "manifest.json"), "utf8"));
    const stackArtifacts = Object.keys(manifest.artifacts).filter(
      (id) => manifest.artifacts[id].type === "aws:cloudformation:stack",
    );
    assert.equal(stackArtifacts.length, 1, `exactly one stack artifact, got ${stackArtifacts.join(", ")}`);
    const json = JSON.parse(readFileSync(path.join(outdir, `${stackArtifacts[0]}.template.json`), "utf8"));
    return { manifest, stackArtifacts, template: Template.fromJSON(json), json };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

/** `<Type>.<Property>` → sorted physical names, for every top-level `*Name` property. */
function physicalNames(s: Synth): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const res of Object.values(s.json.Resources)) {
    for (const [prop, value] of Object.entries(res.Properties ?? {})) {
      const key = `${res.Type}.${prop}`;
      if (!prop.endsWith("Name") || NOT_PHYSICAL.has(key)) continue;
      (out[key] ??= []).push(typeof value === "string" ? value : JSON.stringify(value));
    }
  }
  for (const v of Object.values(out)) v.sort();
  return out;
}

function expectedNames(prefix: string): Record<string, string[]> {
  return Object.fromEntries(Object.entries(EXPECTED).map(([k, f]) => [k, [f(prefix)]]));
}

function assertOneStandaloneStack(s: Synth, stackName: string) {
  const [id] = s.stackArtifacts;
  const artifact = s.manifest.artifacts[id];
  assert.equal(id, stackName, "the stack's construct id (what `cdk deploy <name>` selects) is $CODERA_STACK_NAME");
  // The assembly omits `stackName` when it equals the artifact id; the CDK CLI
  // then deploys the stack under the id — mirror that rule.
  assert.equal(artifact.properties?.stackName ?? id, stackName, "the CloudFormation stackName is $CODERA_STACK_NAME");
  const stackDeps = (artifact.dependencies ?? []).filter((d) => s.manifest.artifacts[d]?.type === "aws:cloudformation:stack");
  assert.deepEqual(stackDeps, [], "no dependency stacks");
}

function assertPrefix(s: Synth, prefix: string) {
  assert.deepEqual(physicalNames(s), expectedNames(prefix));
  s.template.hasResourceProperties("AWS::Lambda::Function", {
    Environment: { Variables: { RESOURCE_PREFIX: prefix } },
  });
}

test("default env, CODERA_* unset (local synth): old stack name and names", () => {
  const s = synth({});
  assertOneStandaloneStack(s, DEFAULT_STACK);
  assertPrefix(s, PROJECT);
});

test("default env as the platform builds it: byte-identical stack name and names", () => {
  const s = synth({ CODERA_ENV: "default", CODERA_STACK_NAME: DEFAULT_STACK });
  assertOneStandaloneStack(s, DEFAULT_STACK);
  assertPrefix(s, PROJECT);
});

test("non-default env: stack named from $CODERA_STACK_NAME, every name suffixed", () => {
  const stackName = `${DEFAULT_STACK}-${OTHER_ENV}`;
  const s = synth({ CODERA_ENV: OTHER_ENV, CODERA_STACK_NAME: stackName });
  assertOneStandaloneStack(s, stackName);
  assertPrefix(s, `${PROJECT}-${OTHER_ENV}`);
});

test("non-default env never deploys into the default env's stack", () => {
  assert.throws(() => synth({ CODERA_ENV: OTHER_ENV, CODERA_STACK_NAME: DEFAULT_STACK }));
});

// The frontend and dashboard read the API URL from this output (template.json
// `config_from: { backend: { ApiUrl: "backend.RestApiUrl" } }`), in every env.
function assertApiUrlOutput(s: Synth) {
  const outputs = s.template.findOutputs("ApiUrl");
  assert.deepEqual(Object.keys(outputs), ["ApiUrl"], "a top-level CloudFormation output named exactly ApiUrl");
  const restApis = Object.keys(s.template.findResources("AWS::ApiGateway::RestApi"));
  assert.equal(restApis.length, 1);
  assert.match(JSON.stringify(outputs.ApiUrl.Value), new RegExp(`"Ref":"${restApis[0]}"`), "ApiUrl is the RestApi's URL");
}

test("ApiUrl output (consumed by the frontends' config_from) in the default and a non-default env", () => {
  assertApiUrlOutput(synth({ CODERA_ENV: "default", CODERA_STACK_NAME: DEFAULT_STACK }));
  assertApiUrlOutput(synth({ CODERA_ENV: OTHER_ENV, CODERA_STACK_NAME: `${DEFAULT_STACK}-${OTHER_ENV}` }));
});

test("codera-module.yaml runs the one CDK deploy form the platform accepts", () => {
  const yaml = readFileSync(path.join(ROOT, "codera-module.yaml"), "utf8");
  assert.match(yaml, /^ {2}env_namespaced: true$/m);
  assert.match(yaml, new RegExp(`^ {2}cdk_stack_name: "${DEFAULT_STACK}"$`, "m"));
  const commands = yaml.match(/^ {2}command: .*$/gm) ?? [];
  assert.deepEqual(commands, [
    `  command: 'npm run build && npx cdk deploy "$CODERA_STACK_NAME" --exclusively --require-approval never'`,
  ]);
});
