#  documentation

- `../architecture/` — system architecture and decision log
- `../tasks/` — task files (one per unit of work)
- `../prompts/` — generated sub-agent prompts (output of gen-prompt.mjs)

## Workflow
1. Capture/adjust the design in `architecture/overview.md`.
2. Write a task in `tasks/`.
3. Generate a prompt: `node prompts/gen-prompt.mjs tasks/T-XXXX.md > prompts/T-XXXX.prompt.md`.
4. Hand that prompt to Claude Code in the relevant repo.
