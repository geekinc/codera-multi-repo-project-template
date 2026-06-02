#  :: frontend

React + Tailwind application: CRUD behind authenticated login, workflow triggers/outputs, and reporting. Consumes the backend API (URL from SSM) and `shared-types`. Deploys to S3 + CloudFront.

## Conventions
- Cross-repo data shapes come from `/shared-types` — never redefine them here.
- This repo is one of six; see the orchestrator repo for the full architecture and current tasks.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain  --domain-owner  --repository  --region `.
