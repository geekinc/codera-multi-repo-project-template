#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BackendStack, DEFAULT_ENV } from "../lib/backend-stack";

// Codera sets both on every module build (see codera-module.yaml):
//   CODERA_ENV        — the environment slug ("default" for the default env)
//   CODERA_STACK_NAME — the CloudFormation stack this build deploys:
//                       "{{PROJECT_NAME}}-backend" in the default env,
//                       "{{PROJECT_NAME}}-backend-<env>" in any other.
// The build runs `cdk deploy "$CODERA_STACK_NAME" --exclusively`, and after a
// non-default build the platform checks that exactly that stack exists — so
// this app defines ONE stack, whose construct id AND CloudFormation stackName
// are $CODERA_STACK_NAME, with no dependency stacks.
const environmentName = process.env.CODERA_ENV || DEFAULT_ENV;
const defaultStackName = "{{PROJECT_NAME}}-backend";
// Unset outside Codera (a local `cdk synth`): fall back to the same name the
// platform would give this environment — the default env keeps its old name.
const stackName =
  process.env.CODERA_STACK_NAME ||
  (environmentName === DEFAULT_ENV ? defaultStackName : `${defaultStackName}-${environmentName}`);

if (environmentName !== DEFAULT_ENV && stackName === defaultStackName) {
  // Environment-suffixed resources must never be deployed into the default
  // environment's stack (that would rename — i.e. replace — its resources).
  throw new Error(`CODERA_ENV=${environmentName} but the stack name is the default env's "${defaultStackName}".`);
}

const app = new cdk.App();
new BackendStack(app, stackName, {
  stackName,
  environmentName,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
app.synth();
