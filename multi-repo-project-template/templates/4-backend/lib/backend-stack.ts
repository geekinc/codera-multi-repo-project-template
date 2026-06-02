import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as path from "path";

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const project = "{{PROJECT_NAME}}";

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
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../src/handlers/api.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
        QUEUE_URL: queue.queueUrl,
      },
    });
    table.grantReadWriteData(apiFn);
    queue.grantSendMessages(apiFn);

    // API Gateway
    const api = new apigw.LambdaRestApi(this, "Api", {
      handler: apiFn,
      restApiName: `${project}-api`,
      // Wire Cognito here for the authenticated CRUD surface.
    });

    // Export the API base URL so the frontend/dashboard builds can read it from SSM.
    new ssm.StringParameter(this, "ApiBaseUrlParam", {
      parameterName: `/${project}/api-base-url`,
      stringValue: api.url,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "QueueUrl", { value: queue.queueUrl });
  }
}
