#  :: backend

Backend infrastructure as CDK: DynamoDB (storage), SQS (queues), API Gateway, and Lambdas. Exposes its API base URL via SSM at `//api-base-url`. Lambdas consume `shared-types`.

## Conventions
- Cross-repo data shapes come from `/shared-types` — never redefine them here.
- This repo is one of six; see the orchestrator repo for the full architecture and current tasks.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain  --domain-owner  --repository  --region `.
