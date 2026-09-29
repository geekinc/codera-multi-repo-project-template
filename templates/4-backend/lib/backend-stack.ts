import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as path from "path";

/** The Codera environment slug of the default environment. */
export const DEFAULT_ENV = "default";

/**
 * The prefix of every explicitly named resource: the project name in the
 * default environment (unchanged — a new physical name REPLACES a resource),
 * `<project>-<env>` in any other, so environments can share one AWS account.
 */
export function resourcePrefix(project: string, environmentName: string): string {
  return environmentName === DEFAULT_ENV ? project : `${project}-${environmentName}`;
}

export interface BackendStackProps extends cdk.StackProps {
  /** Codera environment slug (`$CODERA_ENV`); defaults to "default". */
  readonly environmentName?: string;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: BackendStackProps) {
    super(scope, id, props);

    const project = "{{PROJECT_NAME}}";
    // Build EVERY physical name from this (see CLAUDE.md "Resource naming").
    const prefix = resourcePrefix(project, props?.environmentName ?? DEFAULT_ENV);

    // Persistent storage
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: "ttl",
    });

    // Work queue between backend and the agent system
    const queue = new sqs.Queue(this, "WorkQueue", {
      visibilityTimeout: cdk.Duration.seconds(120),
    });

    // API handler Lambda
    const apiFn = new NodejsFunction(this, "ApiFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../src/handlers/api.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
        QUEUE_URL: queue.queueUrl,
        // Runtime lookups of named resources use this — never recompute it.
        RESOURCE_PREFIX: prefix,
      },
    });
    table.grantReadWriteData(apiFn);
    queue.grantSendMessages(apiFn);

    // API Gateway
    const api = new apigw.LambdaRestApi(this, "Api", {
      handler: apiFn,
      restApiName: `${prefix}-api`,
      // Wire Cognito here for the authenticated CRUD surface.
    });

    // Export the API base URL so the frontend/dashboard builds can read it from SSM.
    new ssm.StringParameter(this, "ApiBaseUrlParam", {
      parameterName: `/${prefix}/api-base-url`,
      stringValue: api.url,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "QueueUrl", { value: queue.queueUrl });
  }
}
