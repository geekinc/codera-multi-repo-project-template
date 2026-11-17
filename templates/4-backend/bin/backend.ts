#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ManagedPolicy, PermissionsBoundary } from "aws-cdk-lib/aws-iam";
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

// Codera permissions boundary + CDK qualifier (SEC-049). The platform sets
// these on a module build only once this project's AWS link is upgraded;
// until then both are UNSET and the synthesized template is exactly what it
// was without this block. Unset and empty mean the same: off.
//   CODERA_PERMISSIONS_BOUNDARY_ARN — every IAM role (and user) the app
//     synthesizes must carry this managed policy as its permissions boundary,
//     or the deploy is refused once the link is enforced.
//   CODERA_CDK_QUALIFIER ("codera") — deploy through the Codera CDK bootstrap
//     (toolkit stack CDKToolkit-Codera, roles cdk-codera-*), the only CDK
//     roles an enforced build may assume. codera-module.yaml points the CLI
//     at that toolkit stack (scripts/codera-toolkit-stack.js).
const boundaryArn = process.env.CODERA_PERMISSIONS_BOUNDARY_ARN || undefined;
const cdkQualifier = process.env.CODERA_CDK_QUALIFIER || undefined;

const app = new cdk.App();
const stack = new BackendStack(app, stackName, {
  stackName,
  environmentName,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  // Any stack you add to this app needs the same synthesizer.
  ...(cdkQualifier && { synthesizer: new cdk.DefaultStackSynthesizer({ qualifier: cdkQualifier }) }),
});
if (boundaryArn) {
  // Applied to the APP, so it covers every role in every stack, including
  // roles CDK generates for you (Lambda service roles, the API Gateway
  // CloudWatch role, custom-resource providers such as log retention).
  PermissionsBoundary.of(app).apply(ManagedPolicy.fromManagedPolicyArn(stack, "CoderaPermissionsBoundary", boundaryArn));
}
app.synth();
