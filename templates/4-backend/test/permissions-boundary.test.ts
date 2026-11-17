// Codera permissions boundary + CDK qualifier (SEC-049).
//
// Once this project's AWS link is upgraded, Codera sets on every module build:
// - CODERA_PERMISSIONS_BOUNDARY_ARN: every IAM role the app synthesizes must
//   carry it as its PermissionsBoundary (an enforced link refuses to create a
//   role without it);
// - CODERA_CDK_QUALIFIER=codera: the stack must synthesize with that qualifier
//   (deploy roles cdk-codera-*, the only CDK roles an enforced build may
//   assume) and the CLI must use the toolkit stack CDKToolkit-Codera.
// Before that, BOTH are unset and nothing may change: the synthesized output
// is byte-identical to a build without this support.
//
// The synth cases run the REAL app entry (bin/backend.ts); the build-command
// cases run codera-module.yaml's REAL `build.command` with stub `npm`/`npx`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Template } from "aws-cdk-lib/assertions";

const ROOT = path.join(__dirname, "..");
const BOUNDARY = "arn:aws:iam::111111111111:policy/codera-permissions-boundary";
const PLATFORM_VARS = ["CODERA_ENV", "CODERA_STACK_NAME", "CODERA_PERMISSIONS_BOUNDARY_ARN", "CODERA_CDK_QUALIFIER"];

interface Assembly {
  /** Every file of the cloud assembly (asset directories excluded), by name. */
  files: Record<string, string>;
  stackId: string;
  template: Template;
  json: { Resources: Record<string, { Type: string; Properties?: Record<string, unknown> }>; Parameters?: Record<string, { Default?: unknown }> };
  manifest: { artifacts: Record<string, { type: string; properties?: Record<string, unknown> }> };
}

/** Synthesize the app with exactly `vars` (every CODERA_* var unset unless given). */
function synth(vars: Record<string, string>): Assembly {
  const outdir = mkdtempSync(path.join(tmpdir(), "backend-boundary-"));
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CDK_DEFAULT_ACCOUNT: "111111111111",
      CDK_DEFAULT_REGION: "ca-central-1",
      ...vars,
      CDK_OUTDIR: outdir,
      TS_NODE_TRANSPILE_ONLY: "true",
    };
    for (const k of PLATFORM_VARS) if (!(k in vars)) delete env[k];
    execFileSync(process.execPath, ["--require", "ts-node/register", path.join(ROOT, "bin/backend.ts")], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const files: Record<string, string> = {};
    for (const name of readdirSync(outdir)) {
      if (!name.startsWith("asset.")) files[name] = readFileSync(path.join(outdir, name), "utf8");
    }
    const manifest = JSON.parse(files["manifest.json"]);
    const stacks = Object.keys(manifest.artifacts).filter((id) => manifest.artifacts[id].type === "aws:cloudformation:stack");
    assert.equal(stacks.length, 1, `exactly one stack artifact, got ${stacks.join(", ")}`);
    const json = JSON.parse(files[`${stacks[0]}.template.json`]);
    return { files, stackId: stacks[0], template: Template.fromJSON(json), json, manifest };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

/** Logical id → resource, for every IAM role and user in the template. */
function principals(a: Assembly) {
  return Object.entries(a.json.Resources).filter(([, r]) => r.Type === "AWS::IAM::Role" || r.Type === "AWS::IAM::User");
}

/** The stack artifact's deploy properties + the asset manifest, as one string. */
function bootstrapRefs(a: Assembly): string {
  return JSON.stringify(a.manifest.artifacts[a.stackId].properties) + a.files[`${a.stackId}.assets.json`];
}

test("boundary set: EVERY IAM role in the synthesized template carries it", () => {
  const a = synth({ CODERA_PERMISSIONS_BOUNDARY_ARN: BOUNDARY });
  const found = principals(a);
  // The Lambda service role and the API Gateway CloudWatch role today; any
  // role you (or CDK, for you) add is covered by the app-level aspect.
  assert.ok(found.length >= 2, `expected the template's roles, found ${found.map(([id]) => id).join(", ")}`);
  for (const [id, r] of found) {
    assert.equal(r.Properties?.PermissionsBoundary, BOUNDARY, `${id} (${r.Type}) carries the Codera boundary`);
  }
});

test("boundary set, qualifier unset: the default bootstrap (hnb659fds) is kept", () => {
  const a = synth({ CODERA_PERMISSIONS_BOUNDARY_ARN: BOUNDARY });
  assert.equal(a.json.Parameters?.BootstrapVersion?.Default, "/cdk-bootstrap/hnb659fds/version");
  assert.doesNotMatch(bootstrapRefs(a), /cdk-codera-/);
});

test("qualifier set: the stack deploys through the Codera bootstrap (cdk-codera-*)", () => {
  const a = synth({ CODERA_PERMISSIONS_BOUNDARY_ARN: BOUNDARY, CODERA_CDK_QUALIFIER: "codera" });
  assert.equal(a.json.Parameters?.BootstrapVersion?.Default, "/cdk-bootstrap/codera/version");
  const props = a.manifest.artifacts[a.stackId].properties as Record<string, string>;
  assert.match(props.assumeRoleArn, /:role\/cdk-codera-deploy-role-111111111111-ca-central-1$/);
  assert.match(props.cloudFormationExecutionRoleArn, /:role\/cdk-codera-cfn-exec-role-111111111111-ca-central-1$/);
  assert.match(props.lookupRole ? JSON.stringify(props.lookupRole) : "", /cdk-codera-lookup-role-/);
  const assets = a.files[`${a.stackId}.assets.json`];
  assert.match(assets, /cdk-codera-assets-111111111111-ca-central-1/);
  assert.match(assets, /cdk-codera-file-publishing-role-111111111111-ca-central-1/);
  assert.doesNotMatch(bootstrapRefs(a), /hnb659fds/, "no default-qualifier role, bucket or parameter is left");
  // The boundary still lands on every role.
  for (const [id, r] of principals(a)) assert.equal(r.Properties?.PermissionsBoundary, BOUNDARY, id);
});

test("neither set (every build before the link upgrade): no boundary, default bootstrap, unset == empty byte for byte", () => {
  const unset = synth({});
  const empty = synth({ CODERA_PERMISSIONS_BOUNDARY_ARN: "", CODERA_CDK_QUALIFIER: "" });
  assert.deepEqual(Object.keys(empty.files).sort(), Object.keys(unset.files).sort());
  for (const name of Object.keys(unset.files)) assert.equal(empty.files[name], unset.files[name], `${name} is byte-identical`);
  assert.ok(principals(unset).length >= 2);
  for (const [id, r] of principals(unset)) assert.equal(r.Properties?.PermissionsBoundary, undefined, `${id} has no boundary`);
  assert.equal(unset.json.Parameters?.BootstrapVersion?.Default, "/cdk-bootstrap/hnb659fds/version");
  assert.doesNotMatch(bootstrapRefs(unset), /cdk-codera-/);
  assert.doesNotMatch(unset.files["tree.json"] ?? "", /CoderaPermissionsBoundary/);
});

// ---------------------------------------------------------------------------
// codera-module.yaml `build.command`, run for real with stub npm / npx.
// ---------------------------------------------------------------------------

/** The single `command:` of codera-module.yaml, unquoted. */
function buildCommand(): string {
  const yaml = readFileSync(path.join(ROOT, "codera-module.yaml"), "utf8");
  const lines = yaml.match(/^ {2}command: '(.*)'\r?$/gm) ?? [];
  assert.equal(lines.length, 1, "exactly one build command");
  return lines[0].replace(/^ {2}command: '/, "").replace(/'\r?$/, "");
}

interface Run {
  status: number | null;
  output: string;
  /** One line per stub call: `<tool> <args…> | toolkitStackName=<cdk.json value at call time>`. */
  calls: string[];
  cdkJsonBefore: string;
  cdkJsonAfter: string;
}

/** Run the build command in a scratch copy of cdk.json + scripts/, with `vars` (CODERA_* unset unless given). */
function runBuild(vars: Record<string, string>): Run {
  const dir = mkdtempSync(path.join(tmpdir(), "backend-build-"));
  try {
    const work = path.join(dir, "work");
    const bin = path.join(dir, "bin");
    const log = path.join(dir, "calls.log");
    mkdirSync(work);
    mkdirSync(bin);
    cpSync(path.join(ROOT, "cdk.json"), path.join(work, "cdk.json"));
    cpSync(path.join(ROOT, "scripts"), path.join(work, "scripts"), { recursive: true });
    for (const tool of ["npm", "npx"]) {
      const stub = path.join(bin, tool);
      writeFileSync(
        stub,
        `#!/bin/sh\nprintf '%s | toolkitStackName=%s\\n' "${tool} $*" "$("${process.execPath}" -p 'require("./cdk.json").toolkitStackName')" >> "${log}"\n`,
      );
      chmodSync(stub, 0o755);
    }
    const cdkJsonBefore = readFileSync(path.join(work, "cdk.json"), "utf8");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CODERA_ENV: "default",
      CODERA_STACK_NAME: "proj-backend",
      ...vars,
      PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    };
    for (const k of ["CODERA_PERMISSIONS_BOUNDARY_ARN", "CODERA_CDK_QUALIFIER"]) if (!(k in vars)) delete env[k];
    const r = spawnSync("bash", ["-c", buildCommand()], { cwd: work, env, encoding: "utf8" });
    return {
      status: r.status,
      output: `${r.stdout}${r.stderr}`,
      calls: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [],
      cdkJsonBefore,
      cdkJsonAfter: readFileSync(path.join(work, "cdk.json"), "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DEPLOY = "npx cdk deploy proj-backend --exclusively --require-approval never";

test("build command, qualifier unset or empty: today's deploy, cdk.json untouched", () => {
  const cases: Record<string, string>[] = [{}, { CODERA_CDK_QUALIFIER: "" }, { CODERA_PERMISSIONS_BOUNDARY_ARN: BOUNDARY }];
  for (const vars of cases) {
    const r = runBuild(vars);
    assert.equal(r.status, 0, r.output);
    assert.deepEqual(r.calls, ["npm run build | toolkitStackName=undefined", `${DEPLOY} | toolkitStackName=undefined`], JSON.stringify(vars));
    assert.equal(r.cdkJsonAfter, r.cdkJsonBefore, "cdk.json is not rewritten");
  }
});

test("build command, qualifier codera: the one deploy runs against CDKToolkit-Codera", () => {
  const r = runBuild({ CODERA_PERMISSIONS_BOUNDARY_ARN: BOUNDARY, CODERA_CDK_QUALIFIER: "codera" });
  assert.equal(r.status, 0, r.output);
  assert.deepEqual(r.calls, ["npm run build | toolkitStackName=undefined", `${DEPLOY} | toolkitStackName=CDKToolkit-Codera`]);
  const after = JSON.parse(r.cdkJsonAfter);
  assert.deepEqual(after, { ...JSON.parse(r.cdkJsonBefore), toolkitStackName: "CDKToolkit-Codera" }, "only toolkitStackName is added");
});

test("build command, unknown qualifier: fails before the deploy", () => {
  const r = runBuild({ CODERA_PERMISSIONS_BOUNDARY_ARN: BOUNDARY, CODERA_CDK_QUALIFIER: "other" });
  assert.notEqual(r.status, 0);
  assert.deepEqual(r.calls, ["npm run build | toolkitStackName=undefined"]);
  assert.match(r.output, /unknown CODERA_CDK_QUALIFIER "other"/);
});
