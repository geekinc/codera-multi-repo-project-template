# Changelog

All notable changes to this template. Versions track `template.json`.
This file starts at 1.5.0; earlier history is in the git log.
Codera shows customers the sections newer than their project's version when it
offers a template upgrade.

## 1.5.0 — Codera permissions boundary + template upgrades (2026-11-17)

SEC-049h. **Upgrade note:** the backend now passes the Codera permissions
boundary to every IAM role it creates and can deploy through the Codera CDK
bootstrap. Nothing changes until your project's AWS link is upgraded. Until
then, the backend synthesizes and deploys exactly as before.

- **Backend `bin/backend.ts`:** when Codera sets
  `CODERA_PERMISSIONS_BOUNDARY_ARN`, `PermissionsBoundary.of(app)` puts that
  managed policy on every IAM role in the app. That includes roles CDK
  generates for you: today the Lambda service role (`ApiFnServiceRole`) and
  the API Gateway CloudWatch role (`ApiCloudWatchRole`). When Codera sets
  `CODERA_CDK_QUALIFIER` (`codera`), the stack synthesizes with
  `new DefaultStackSynthesizer({ qualifier })`, so it deploys through the
  Codera bootstrap (roles `cdk-codera-*`, toolkit stack `CDKToolkit-Codera`).
  With neither variable set, the synthesized template is byte-identical to
  1.4.0.
- **Backend `codera-module.yaml`:** the build runs
  `node scripts/codera-toolkit-stack.js` right before the one `cdk deploy`.
  The new script does nothing unless `CODERA_CDK_QUALIFIER` is set. When it
  is set, the script adds `"toolkitStackName": "CDKToolkit-Codera"` to
  `cdk.json`, which the CDK CLI treats the same as
  `--toolkit-stack-name CDKToolkit-Codera`. The `cdk deploy` itself is
  unchanged (`npx cdk deploy "$CODERA_STACK_NAME" --exclusively
  --require-approval never`), because Codera accepts only that form outside the
  default environment.
- **If you added roles, functions or constructs** to `BackendStack`, there's
  nothing to do: the boundary is applied to the whole app.
- **If you added another stack to the app**, give it the same `synthesizer`
  as `BackendStack` (see `bin/backend.ts`). Otherwise it keeps the default
  bootstrap, which an upgraded AWS link won't let the build use.
- **If you changed `bin/backend.ts` or the deploy command**, check after the
  merge that `bin/backend.ts` still has the `CODERA_PERMISSIONS_BOUNDARY_ARN`
  and `CODERA_CDK_QUALIFIER` block, and that `codera-module.yaml`'s
  `command` still runs `node scripts/codera-toolkit-stack.js` before
  `npx cdk deploy`. If you added lines just before `app.synth()` (tags,
  aspects), the upgrade pull request shows a conflict there: keep both your
  lines and the `if (boundaryArn) { ... }` block.
- **New test** `test/permissions-boundary.test.ts` (`npm test`) synthesizes
  the real app with the variables set, empty and unset. It also runs the real
  build command with stub `npm`/`npx`.
- **Template upgrades:** from this version, Codera can offer future template
  releases as pull requests. The orchestrator's `sync-check.sh` and
  `git-hooks/**` are template-managed: an upgrade replaces them when a release
  changes them. All other files are merged with your changes.
