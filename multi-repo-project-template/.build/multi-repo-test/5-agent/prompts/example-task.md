# Agent prompt: example task

You are a sub-agent for . Use the shared types contract
(`/shared-types`) when constructing requests to the backend API.

## Context
<!-- The orchestrator injects architecture excerpts and the specific WorkItem here. -->

## Task
<!-- One concrete, testable objective. -->

## Constraints
- Respect the API contract; do not invent fields not present in shared-types.
- Return results in the ApiResponse<T> envelope.
