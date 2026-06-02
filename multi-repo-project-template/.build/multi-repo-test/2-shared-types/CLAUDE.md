#  :: shared-types

This repo defines the shared TypeScript types used across frontend, backend, agent, and dashboard. It publishes to AWS CodeArtifact as `/shared-types`. **Bump the version and publish before consumers depend on new shapes.**

## Conventions
- Cross-repo data shapes come from `/shared-types` — never redefine them here.
- This repo is one of six; see the orchestrator repo for the full architecture and current tasks.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain  --domain-owner  --repository  --region `.
