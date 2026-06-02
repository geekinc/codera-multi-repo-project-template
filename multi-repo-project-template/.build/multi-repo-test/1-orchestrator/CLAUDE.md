#  :: orchestrator

This repo holds documentation, the agreed architecture/design (as markdown), tasks, and generates prompts for sub-agents working in the other repos. **It is the source of truth.** When the architecture changes, update `architecture/` here first, then regenerate prompts with `prompts/gen-prompt.mjs`.

## Conventions
- Cross-repo data shapes come from `/shared-types` — never redefine them here.
- This repo is one of six; see the orchestrator repo for the full architecture and current tasks.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain  --domain-owner  --repository  --region `.
