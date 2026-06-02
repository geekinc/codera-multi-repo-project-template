import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as codeartifact from "aws-cdk-lib/aws-codeartifact";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

export interface PlatformStackProps extends cdk.StackProps {
  projectName: string;
  caDomain: string;
  caRepo: string;
  nodeVersion: string;
  dashboardAuthKey?: string;
}

/**
 * Provisions, for a single project:
 *   - 6 CodeCommit repositories
 *   - 1 CodeArtifact domain + repository (npm, with public upstream)
 *   - 1 CodeBuild project per repo, each reading its own buildspec.yml
 *   - S3 + CloudFront for frontend and dashboard
 *   - EventBridge rule so a shared-types publish retriggers the consumers
 */
export class PlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);

    const { projectName, caDomain, caRepo, nodeVersion, dashboardAuthKey } = props;
    const repoNames = ["orchestrator", "shared-types", "frontend", "backend", "agent", "dashboard"];
    const staticSites = ["frontend", "dashboard"];

    // --- CodeArtifact: domain + npm repo with public upstream --------------
    const domain = new codeartifact.CfnDomain(this, "CaDomain", { domainName: caDomain });

    const publicUpstream = new codeartifact.CfnRepository(this, "CaPublicUpstream", {
      domainName: domain.domainName,
      repositoryName: "npm-store",
      externalConnections: ["public:npmjs"],
    });
    publicUpstream.addDependency(domain);

    const sharedRepo = new codeartifact.CfnRepository(this, "CaRepo", {
      domainName: domain.domainName,
      repositoryName: caRepo,
      upstreams: [publicUpstream.repositoryName],
    });
    sharedRepo.addDependency(publicUpstream);

    const caDomainArn = cdk.Stack.of(this).formatArn({
      service: "codeartifact", resource: "domain", resourceName: caDomain,
    });
    const caRepoArn = cdk.Stack.of(this).formatArn({
      service: "codeartifact", resource: "repository", resourceName: `${caDomain}/${caRepo}`,
    });
    const caPackageArn = cdk.Stack.of(this).formatArn({
      service: "codeartifact", resource: "package", resourceName: `${caDomain}/${caRepo}/*`,
    });

    // Statements shared by all builds: get a CA auth token + read packages.
    const caReadStatements = [
      new iam.PolicyStatement({
        actions: ["codeartifact:GetAuthorizationToken"],
        resources: [caDomainArn],
      }),
      new iam.PolicyStatement({
        actions: ["sts:GetServiceBearerToken"],
        resources: ["*"],
        conditions: { StringEquals: { "sts:AWSServiceName": "codeartifact.amazonaws.com" } },
      }),
      new iam.PolicyStatement({
        actions: [
          "codeartifact:ReadFromRepository",
          "codeartifact:GetRepositoryEndpoint",
          "codeartifact:GetPackageVersionAsset",
          "codeartifact:DescribePackageVersion",
          "codeartifact:ListPackageVersions",
        ],
        resources: [caRepoArn, `${caRepoArn}/*`, caPackageArn],
      }),
    ];
    // shared-types additionally needs to publish.
    const caPublishStatements = [
      new iam.PolicyStatement({
        actions: ["codeartifact:PublishPackageVersion", "codeartifact:PutPackageMetadata"],
        resources: [caPackageArn],
      }),
    ];

    // --- S3 + CloudFront for frontend and dashboard -----------------------
    const siteBuckets: Record<string, s3.Bucket> = {};
    const siteDistributions: Record<string, cloudfront.Distribution> = {};

    // Dashboard auth: CloudFront Function that checks for a pre-shared key
    let dashboardAuthFunction: cloudfront.Function | undefined;
    if (dashboardAuthKey) {
      dashboardAuthFunction = new cloudfront.Function(this, "DashboardAuthFn", {
        functionName: `${projectName}-dashboard-auth`,
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Allow static assets through — only gate document requests
  if (uri.match(/\\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json)$/)) {
    return request;
  }

  var headers = request.headers;
  var querystring = request.querystring;
  var expectedKey = '${dashboardAuthKey}';

  var headerKey = headers['x-auth-key'] ? headers['x-auth-key'].value : '';
  var queryKey = querystring['key'] ? querystring['key'].value : '';

  if (headerKey === expectedKey || queryKey === expectedKey) {
    return request;
  }

  return {
    statusCode: 401,
    statusDescription: 'Unauthorized',
    headers: { 'content-type': { value: 'text/html' } },
    body: '<!doctype html><html><head><title>Not Authorized</title></head><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc"><div style="text-align:center"><h1 style="color:#64748b;font-size:2rem">Not Authorized</h1><p style="color:#94a3b8">A valid key is required to access this dashboard.</p></div></body></html>',
  };
}
        `),
      });
    }

    for (const site of staticSites) {
      const bucket = new s3.Bucket(this, `SiteBucket-${site}`, {
        bucketName: `${projectName}-${site}-${this.account}`,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });
      siteBuckets[site] = bucket;

      const behaviorOptions: cloudfront.BehaviorOptions = {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        ...(site === "dashboard" && dashboardAuthFunction ? {
          functionAssociations: [{
            function: dashboardAuthFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          }],
        } : {}),
      };

      const distribution = new cloudfront.Distribution(this, `Cdn-${site}`, {
        defaultBehavior: behaviorOptions,
        defaultRootObject: "index.html",
        errorResponses: [
          { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
          { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
        ],
        comment: `${projectName} ${site}`,
      });
      siteDistributions[site] = distribution;
    }

    // --- per-repo CodeCommit + CodeBuild -----------------------------------
    const repos: Record<string, codecommit.Repository> = {};
    const builds: Record<string, codebuild.Project> = {};

    for (const name of repoNames) {
      const repo = new codecommit.Repository(this, `Repo-${name}`, {
        repositoryName: `${projectName}-${name}`,
        description: `${projectName} :: ${name}`,
      });
      repos[name] = repo;

      const isSharedTypes = name === "shared-types";
      const isBackend = name === "backend";
      const isStaticSite = staticSites.includes(name);

      const envVars: Record<string, codebuild.BuildEnvironmentVariable> = {
        PROJECT_NAME: { value: projectName },
        AWS_ACCOUNT_ID: { value: this.account },
        CA_DOMAIN: { value: caDomain },
        CA_REPO: { value: caRepo },
        CA_DOMAIN_OWNER: { value: this.account },
        NODE_VERSION: { value: nodeVersion },
      };

      if (isStaticSite) {
        envVars.DEPLOY_BUCKET = { value: siteBuckets[name].bucketName };
        envVars.CLOUDFRONT_DISTRIBUTION_ID = { value: siteDistributions[name].distributionId };
      }

      const project = new codebuild.Project(this, `Build-${name}`, {
        projectName: `${projectName}-${name}`,
        source: codebuild.Source.codeCommit({ repository: repo, branchOrRef: "main" }),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
        },
        environmentVariables: envVars,
        buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yml"),
      });

      caReadStatements.forEach((s) => project.addToRolePolicy(s));
      if (isSharedTypes) caPublishStatements.forEach((s) => project.addToRolePolicy(s));

      // Backend deploys CDK, so it needs broad deploy permissions. Scope this
      // down for production — CloudFormation full access is convenient but blunt.
      if (isBackend) {
        project.addToRolePolicy(new iam.PolicyStatement({
          actions: ["cloudformation:*", "s3:*", "lambda:*", "apigateway:*",
                    "sqs:*", "dynamodb:*", "iam:PassRole", "ssm:GetParameter*"],
          resources: ["*"],
        }));
      }

      if (isStaticSite) {
        siteBuckets[name].grantReadWrite(project);
        project.addToRolePolicy(new iam.PolicyStatement({
          actions: ["cloudfront:CreateInvalidation"],
          resources: [
            `arn:aws:cloudfront::${this.account}:distribution/${siteDistributions[name].distributionId}`,
          ],
        }));
        project.addToRolePolicy(new iam.PolicyStatement({
          actions: ["ssm:GetParameters", "ssm:GetParameter"],
          resources: [cdk.Stack.of(this).formatArn({
            service: "ssm", resource: "parameter", resourceName: `${projectName}/*`,
          })],
        }));
      }

      builds[name] = project;
    }

    // --- ordering: shared-types publish -> rebuild consumers ---------------
    const consumers = ["frontend", "backend", "agent", "dashboard"];
    new events.Rule(this, "SharedTypesPublished", {
      eventPattern: {
        source: ["aws.codebuild"],
        detailType: ["CodeBuild Build State Change"],
        detail: {
          "build-status": ["SUCCEEDED"],
          "project-name": [`${projectName}-shared-types`],
        },
      },
      targets: consumers.map((c) =>
        new targets.CodeBuildProject(builds[c])
      ),
    });

    // --- outputs -----------------------------------------------------------
    for (const name of repoNames) {
      new cdk.CfnOutput(this, `CloneUrl-${name}`, {
        value: repos[name].repositoryCloneUrlGrc,
        description: `git-remote-codecommit clone URL for ${name}`,
      });
    }
    new cdk.CfnOutput(this, "CodeArtifactRepo", {
      value: `${caDomain}/${caRepo}`,
      description: "CodeArtifact domain/repo for npm packages",
    });
    for (const site of staticSites) {
      new cdk.CfnOutput(this, `${site}-url`, {
        value: `https://${siteDistributions[site].distributionDomainName}`,
        description: `CloudFront URL for ${site}`,
      });
    }
  }
}
