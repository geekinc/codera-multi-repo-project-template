#  :: agent

Scripts that interface with the backend APIs, prompts for AI agents, and local configuration. Consumes `shared-types` for request/response shapes. Packaged as a versioned build artifact.

## Conventions
- Cross-repo data shapes come from `/shared-types` — never redefine them here.
- This repo is one of six; see the orchestrator repo for the full architecture and current tasks.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain  --domain-owner  --repository  --region `.
