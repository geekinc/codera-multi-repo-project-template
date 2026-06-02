#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PlatformStack } from "../lib/platform-stack";

const app = new cdk.App();

const projectName = app.node.tryGetContext("projectName") ?? "myproject";
const region = app.node.tryGetContext("region") ?? process.env.CDK_DEFAULT_REGION ?? "ca-central-1";
const caDomain = app.node.tryGetContext("caDomain") ?? projectName;
const caRepo = app.node.tryGetContext("caRepo") ?? "shared";
const nodeVersion = app.node.tryGetContext("nodeVersion") ?? "20";
const dashboardAuthKey = app.node.tryGetContext("dashboardAuthKey") ?? "";

new PlatformStack(app, `${projectName}-platform`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region },
  projectName,
  caDomain,
  caRepo,
  nodeVersion,
  dashboardAuthKey: dashboardAuthKey || undefined,
  description: `Repos, CodeArtifact, and CodeBuild for ${projectName}`,
});

app.synth();
