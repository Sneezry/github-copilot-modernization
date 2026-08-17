# Stage 1B Product-Host Probe

This directory contains the delivery probe for the packaged production chain:

```text
modernize -> batch-review -> Start/Cancel approval -> batch-coordinator -> batch-assessment
```

The probe loads the actual plugin directory and production agents. It does not register toy agents or add fault-injection branches to product code.

## Run

Run the same command from Windows and a POSIX host with an authenticated Copilot CLI entitlement:

```powershell
node plugins/github-copilot-modernization/tests/batch-mode/stage1b/product-scenario-runner.mjs --model gpt-5-mini
```

Useful options:

- `--copilot <path>` selects a specific Copilot CLI executable.
- `--output <path>` selects the evidence file.
- `--resume` retains passed scenarios only when platform, CLI version, model, and product package digest match.
- `--keep-workspaces` retains temporary repositories and batch artifacts for manual inspection.

The default evidence path is `evidence/product-probe.<platform>-<arch>.json`. A release run must commit one passing Windows record and one passing POSIX record with matching product package digests.

The manual `Stage 1B Product Probe` GitHub Actions workflow runs this matrix on `windows-latest` and `ubuntu-latest`. Configure the repository secret `COPILOT_GITHUB_TOKEN` with a user-owned fine-grained token that has the **Copilot Requests** permission. The workflow uploads each JSON record and retained workspace even when a probe is blocked or fails, then rejects the gate unless both records pass and their package digests match.

## Verdicts

- `passed`: every route and product-host scenario passed, including the complete failure matrix.
- `incomplete`: executed scenarios passed, but at least one required scenario has no product-host evidence.
- `blocked`: an external Copilot host condition such as quota, authentication, model availability, or rate limiting prevented execution.
- `failed`: the product chain ran and violated its contract.

`blocked` and `incomplete` are delivery No-Go results. Control-plane tests for missing results or partial aggregation are recorded separately and never promoted to product-host evidence.

## Evidence Sources

ACP transcript evidence proves production-agent routing and either a structured approval response or the strict same-session exact-follow-up fallback. For an approved two-repository run, the validator requires exactly two directly identified `batch-assessment` tool calls; agent names mentioned only in prompts or outputs do not count. Persisted batch artifacts prove attempt identity, independent invocation IDs, strict sequential order, request/result binding, repository validation, aggregate summary, report existence and digest, and source/build canaries. Agent prose is not completion evidence.

The natural child-failure fixture commits a regular Git repository whose `.github` path is a file. Preflight can select it, but Assessment bootstrap cannot create its runtime directory. This exercises product failure handling without modifying the production agent or fabricating a child result.

The missing-result and partial scenarios use ACP's real permission protocol with `allow_all` disabled. The probe cancels exactly one matching tool request and grants every other request with `allow_once`: the first `batch-assessment` delegation for missing-result, and the first `cwe-memory-safety` security child for partial Assessment. The persisted control plane must then show `protocol_error -> completed` and `completed_with_issues -> completed`, respectively. A host that emits no ACP permission events records these probes as `not_supported`, keeping the release verdict `incomplete`.