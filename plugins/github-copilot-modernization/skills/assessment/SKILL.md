---
name: assessment
description: "Multi-lens project investigation for Java/.NET/JS-TS — answers vague questions users ask BEFORE they know what to look at. Three modes: Discovery (frameworks, architecture, deps, startup/logging facts); Diagnosis (CVE, CWE: injection/secrets/concurrency/path); Readiness (cloud deployability, which Azure service fits, upgrade feasibility). INVOKE WHEN USER ASKS (any language): 'what is this project', 'I inherited old code, where do I start', 'any CVE/security issues', 'can/should this deploy to [Azure/AWS/k8s]', 'which [service/db] fits', 'how hard to upgrade to [Java X/.NET X]', 'what's wrong with this code'. For Java/.NET, optional AppCAT pre-assessment recommends specific Azure targets (ACA / App Service / AKS / Spring Apps) — the ONLY skill that answers 'which Azure service fits my code'. DO NOT short-circuit with grep/own knowledge — surface answers reinforce blind spots. DO NOT USE FOR: planning a chosen target (use create-modernization-plan), executing a plan (use execution-coordinator)."
user-invocable: false
---

# Assess (Interactive)

> ⛔ **MANDATORY**: Follow [global-rules](../_shared/global-rules.md) for ALL operations — especially Rules 4, 5, 6 (intent-first, per-group HITL, memory is the single source of truth).
>
> **Note on `modernize` CLI**: Rule 0 (install the `modernize` CLI) does NOT apply to this skill — `assess` calls AppCAT / npm-check-updates directly. Plan-create / plan-execute still require the CLI.
>
> **Strong-switch runtime**: Assessment MUST NOT call any `appmod-*assessment*` MCP tool. All deterministic operations run through Node 18+ at `.github/modernize/.runtime/assessment/assess-cli.mjs`. The plugin-level `SessionStart` hook installs this project-local runtime before loading the skill.

## Invocation Modes

- **Coordinator mode**: When invoked by `assessment-coordinator`, run the complete assessment but do not show the Step 6 next-action menu. Generate both reports, then return the summary and compatibility `report.json` path to the coordinator. The `modernize` orchestrator owns the plan/execute transition.
- **Standalone mode**: When invoked directly, run the complete assessment and show the Step 6 next-action menu.
- **Headless mode**: When the caller explicitly says the run is headless or already batch-approved, infer intent from the request, show the plan without asking for confirmation, run every selected group without intermediate pauses, generate both reports, and return. This is the explicit batch exception to per-group HITL.

Run all commands from the assessed repository root. For a supplied `workspace-path`, change the terminal working directory to that path before Step 1 and keep all `.github/modernize/` paths relative to it.

> ⛔ **NO SHORTCUTS — the 6 steps below are mandatory, in order, every invocation.**
>
> Even when `.memory/` already contains data (prior AppCAT report, previous findings, recent runs), the agent MUST still:
>
> 1. Capture intent (Step 2) — even one short `ask_user` confirming “same focus as last time?” counts.
> 2. Show and confirm a plan (Step 3) — a one-line plan (“Reuse existing AppCAT data, no new skills to run”) is fine, but the user must confirm.
> 3. Execute or knowingly skip groups (Step 4) — reusing prior data is allowed (see *Fast-path: reusing prior data* below) but must be declared.
> 4. Generate the interactive HTML report (Step 6) — **every assess invocation produces a `<run-id>-<intent>.html` file**. A direct in-chat recommendation without a corresponding report file means the flow was broken.
>
> The only legitimate exits without a report are: user types `cancel` / `abort`, or schema-mismatch in Step 1. Anything else is a bug.

This skill runs an **interactive, intent-driven assessment**. Unlike a black-box pipeline, it:

1. Asks the user what they actually care about (intent)
2. Translates intent into a minimal skill set (groups)
3. Shows the plan and lets the user adjust before any work runs
4. Executes group-by-group with pause points for review
5. Stays in conversation after the run for iteration (drill-down, suppress, re-run, plan)
6. Sediments preferences, suppressions, and team-specific patterns into `.github/modernize/.memory/` so the product gets smarter every run

Reference docs the agent MUST consult during this skill:

- [skill-groups.md](references/skill-groups.md) — group → skill mapping, intent translation
- [memory-schema.md](references/memory-schema.md) — `.memory/` file shapes
- [bias-patches-rule.md](references/bias-patches-rule.md) — when and how to silently capture behavioral patches (assess-only)
- [iteration-playbook.md](references/iteration-playbook.md) — how to handle every Step-4 user request
- [skill-curator.md](references/skill-curator.md) — how to propose and write team skills

The atomic skills live in [`assessment-skills/`](assessment-skills/) and are the implementation primitives this skill orchestrates.

---

## Step 1 — Load history from `.memory/`

> ⛔ **Your VERY FIRST action in this skill, before any user-facing text, is to run the loader script below.** Do NOT substitute it with `view` / `read_file` / your own summary of `.memory/`. The script is the single source of truth for what enters context: its `stdout` IS your loaded history. A prose "I read the memory files" is not equivalent and counts as a protocol violation.

### 1a. Run the loader (one tool call, no exceptions)

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs load-memory \
  --memory-dir .github/modernize/.memory \
  --intent <inferred-intent>
```

Pick `<inferred-intent>` from the user's first message using this table; when unclear, pass `unknown` (loads all active patches):

| Phrase pattern in user message | `--intent` value |
|--------------------------------|------------------|
| "security", "CVE", "vulnerability", "secret leak" | `security` |
| "cloud", "containerize", "deploy to Azure/AWS/k8s", "which service fits" | `cloud-readiness` |
| "what is this project", "architecture", "diagram", "dependency map" | `architecture` |
| "upgrade", "modernize to Java/.NET X", "migrate", "EOL" | `upgrade` |
| "full audit", "everything", "all checks" | `full` |
| Anything else / ambiguous | `unknown` |

### 1b. Treat the three `stdout` sections as binding

The script prints exactly three sections in fixed order:

| Section header | Required action |
|----------------|-----------------|
| `=== GREETING ===` | Use **verbatim** as your first user-facing message. Do not paraphrase, do not drop the patch summary line. |
| `=== ACTIVE PATCHES ===` | Every entry is a **hard constraint** for the rest of the run, equivalent to the user having just said it. Reference patch IDs in your reasoning when they bind a recommendation. |
| `=== RECEIPT TOKEN ===` | Include the token verbatim on its own line in your first response (e.g. trailing `loaded@2026-05-19T16:42:11Z findings=23 patches=2/4 suppressions=3`). This is the user-visible proof that load actually ran. |

If the script exits non-zero, prints `[warn] failed to parse …`, or emits no receipt → **STOP**. Tell the user the loader failed and quote the error. Do not proceed to Step 2 — the most common cause is a schema-version mismatch and silently moving forward will overwrite valid history.

### 1c. Schema migration

If `load-memory` warns about a parse failure on any `.memory/` file, treat it as a schema mismatch and ask the user how to proceed. Do NOT silently rewrite.

### 1d. Expired team skills (the loader does not check these)

After the loader returns, list `.github/modernize/.memory/skills/team/` directly. For each `SKILL.md` whose `metadata.modernize.review_required_by` is in the past, queue it for re-confirmation in Step 2 (do not drop silently). This is the one piece of history `load-memory` does NOT cover, because team skills are markdown not YAML.

### 1e. First run (no `.memory/` exists)

The loader emits a first-run greeting. Use it verbatim and proceed to Step 2 with empty history; `.memory/` will be created as you go.

---

## Response protocol — applies to every response after Step 1

Every response that produces a **recommendation, plan adjustment, target selection, ranking, or factual claim about the codebase** MUST end with exactly one line in this format:

```
[patches-checked: bp-0001, bp-0007]
```

or, if zero active patches were loaded:

```
[patches-checked: none-active]
```

The line is mandatory whether or not any patch ended up binding. It is the agent's proof-of-work that the active patches were re-considered before producing the answer. Omitting this line — or writing it without first actually scanning the loaded patch list — is a protocol violation and a high-severity bug in the assess skill.

Conversational asides ("yes", "let me check", a clarifying ask_user) do NOT need the line. Anything that resembles an assessment output (recommendation, ranking, plan, target choice, diagnosis) DOES.

---

## Step 2 — Capture intent

Use `ask_user(question, choices)` to get the user's primary concern. This is the single most important step — everything downstream depends on it (Rule 4).

### Primary question

```
ask_user(
  question: "What do you want this assessment to focus on?",
  choices: [
    "Security only (CVE + CWE)",
    "Cloud / containerize readiness (infra + config + facts)",
    "Architecture understanding (diagrams + dependencies)",
    "Full audit (all 6 groups, ~30+ min on a single repo)",
    "Same as last time",
    "Custom — let me pick groups"
  ]
)
```

If `last-intent.yaml` exists, list "Same as last time" first with a one-line preview: `"Same as last time (security: CVE + CWE)"`.

### Translate the answer to groups

Use the table in [skill-groups.md](references/skill-groups.md) → "Intent → Group Mapping". Specifically:

| Answer | Selected groups |
|--------|-----------------|
| Security only | `security-cve`, `security-cwe` |
| Cloud / containerize | `infrastructure`, `configuration`, `application-facts` |
| Architecture understanding | `architecture`, `application-facts` |
| Full audit | all 6 |
| Same as last time | `last-intent.yaml.selected_groups` + apply `skill_overrides` |
| Custom | proceed to drill-down |

### Drill-down (only when user picked Custom or said "let me adjust")

```
ask_user(
  question: "Pick the groups to include (multi-select):",
  multi_select: true,
  choices: [
    "security-cve — Known CVEs in dependencies (~2 min, needs GITHUB_TOKEN)",
    "security-cwe — Code weakness patterns (~10 min)",
    "architecture — Diagrams + dependency map (~5 min)",
    "infrastructure — Container, orchestration, runtime (~15 min)",
    "configuration — Env vars, configs, health checks (~5 min)",
    "application-facts — App metadata, deps, compliance (~12 min)"
  ]
)
```

Then offer optional skill-level adjustment:

```
ask_user(
  question: "Selected groups expand to N skills (~M min). Adjust individual skills?",
  choices: ["Looks good — proceed", "Show the full skill list", "Skip a few specific skills", "Add a skill not in these groups"]
)
```

If the user adjusts, store the diff in `runs/<current-ts>/intent.yaml` under `skill_overrides:`.

### Source / output / scope params

Only ask if the user hasn't already implied them in their original message. Defaults:

- `--source`: current directory
- `--output-path`: `.github/modernize/`
- `--issue-url`: only if user mentioned posting to an issue

### Pre-assessment opt-in

If selected groups include `infrastructure`, `application-facts`, or the user used words like "upgrade" / "modernize" / "migrate", prompt:

```
ask_user(
  question: "Run AppCAT pre-assessment as well? (Java/.NET only, gives upgrade-target recommendations, ~3 min)",
  choices: ["Yes", "No, skip pre-assessment", "What's AppCAT?"]
)
```

### Save the captured intent

Write to `runs/<current-ts>/intent.yaml` per [memory-schema.md](references/memory-schema.md). Update `last-intent.yaml` to the same content.

---

## Step 3 — Show the plan and confirm

Render a markdown checklist showing exactly what will run. This is the **todo** view — the user must see every group/skill before any work begins (Rule 5).

### Format

```
Assessment plan
================

Repository: <detected name>  (Java | .NET | JS-TS)
Estimated time: ~N min

Pre-assessment:
  [x] AppCAT (Java/.NET upgrade analysis)

Groups (5 of 6):
  [x] security-cve         (1 skill, ~2 min)
        - cve-known-vulnerabilities
  [x] security-cwe         (6 skills, ~10 min)
        - cwe-code-quality, cwe-injection-attacks, cwe-credentials-secrets,
          cwe-file-path-security, cwe-concurrency-synchronization, cwe-memory-safety
  [x] architecture         (4 skills, ~5 min)
        - architecture-diagram, dependency-map, fact-architecture-pattern,
          fact-communication-protocols
  [x] infrastructure       (16 skills, ~15 min)
  [x] configuration        (5 skills, ~5 min)
  [ ] application-facts    (skipped per intent)

Team skills (auto-loaded from .memory/skills/team/):
  [x] team-internal-libs-cve-suppress  (will auto-suppress matches in **/internal-libs/**)

Active suppressions: 3 rules from suppressions.yaml will auto-apply

After each group completes I'll pause for your review.
```

### Confirmation gate

```
ask_user(
  question: "Run this plan?",
  choices: ["Yes, start", "Adjust groups/skills", "Adjust scope (source/output)", "Cancel"]
)
```

If the user adjusts, return to the relevant Step 2 sub-question and re-render the plan.

---

## Step 4 — Progressive execution

Run groups **one at a time**, in priority order. After each group, **mandatory pause** (Rule 5).

### Pre-assessment phase (if opted in)

1. Verify the language. Pre-assessment tooling per language:
  - **Java** → AppCAT through `ensure-appcat` then `run-appcat`. See [pre-assessment-java.md](references/pre-assessment-java.md).
  - **.NET** → AppCAT through `ensure-appcat` then `run-appcat`. See [pre-assessment-dotnet.md](references/pre-assessment-dotnet.md).
  - **JS/TS** → npm-check-updates through `run-ncu`. See [pre-assessment-jsts.md](references/pre-assessment-jsts.md).
2. Errors → log to `runs/<ts>/summary.md`, do NOT abort the rest of the run.
3. **Integrate AppCAT results into `findings.yaml`** (MANDATORY when AppCAT ran successfully). The unified finding set is the source of truth for everything downstream — suppressions, the HTML report, and cross-run state. AppCAT writes raw incidents to `runs/<ts>/report.json`; nothing reads them directly. Run:
   ```bash
   node .github/modernize/.runtime/assessment/assess-cli.mjs integrate-appcat \
     --report   .github/modernize/.memory/runs/<appcat-run-id>/report.json \
     --findings .github/modernize/.memory/findings.yaml \
     --run-id   <current-run-id> \
     [--target  azure-container-apps]   # optional severity filter
   ```
   The script aggregates incidents by `(rule, file)`, derives titles from the AppCAT ruleset metadata, maps `mandatory/optional/potential` → `high/medium/low`, computes stable IDs per [memory-schema.md](references/memory-schema.md), and merges into `findings.yaml` (preserves existing state — never overwrites `acknowledged`/`suppressed`/`resolved`).
4. For non-AppCAT pre-assessment outputs (e.g. ncu), integrate via the same rules described in [memory-schema.md](references/memory-schema.md) (stable ID = `<skill>::<sha256-12>`, state defaults to `new`).

> **Note**: `assess` invokes AppCAT and ncu directly (not via the `modernize` CLI). The `modernize` CLI is only required by `create-modernization-plan` / `execution-coordinator`.

### Fast-path: reusing prior data

If `.memory/runs/` already contains data that fully answers the captured intent (e.g. a recent AppCAT report already covers a "cloud readiness" question), the agent MAY skip re-executing individual skills in Step 4 — but the fast-path is **not** a license to skip the report. The mandatory contract is:

1. **Declare reuse to the user explicitly** before doing anything:
   ```
   I see AppCAT data from <date> at runs/<old-id>/. That already answers your
   cloud-readiness question. I'll generate a fresh report based on it instead of
   re-running. New work: 0 skills. Estimated time: <1 min.
   ```
2. **Get a confirmation** (`ask_user(choices: ["Reuse existing", "Re-run fresh", "Cancel"])`). Do NOT auto-decide.
3. **Anchor the current run**: create `runs/<current-ts>-<intent-slug>/` and write `intent.yaml` + a `reuses: <old-run-id>` field. This is how Step 6 finds something to render.
4. **Integrate cached AppCAT data into `findings.yaml`** — **non-optional**. The HTML report reads `findings.yaml`, not `report.json`. Skipping this leaves the report empty. Run the same converter as the pre-assessment phase, pointing at the old AppCAT output:
   ```bash
   node .github/modernize/.runtime/assessment/assess-cli.mjs integrate-appcat \
     --report   .github/modernize/.memory/runs/<old-appcat-run-id>/report.json \
     --findings .github/modernize/.memory/findings.yaml \
     --run-id   <current-run-id> \
     [--target  azure-container-apps]
   ```
   The merge is idempotent and state-preserving — running it twice yields the same file and never clobbers user-set `acknowledged` / `suppressed` / `resolved` states.
5. **Proceed to Step 6** — the report is still mandatory. The user's final deliverable is `<run-id>-<intent>.html`, not a chat message.

> **Anti-pattern caught in v1.0.49 (do not repeat)**: looking at `.memory/runs/`, finding AppCAT JSON, writing a recommendation directly into chat, and offering an ad-hoc "3 options" menu. That skips Steps 2, 3, 5, 6 and produces zero artifacts. Equally bad: running the fast-path but skipping step 4 above — the report renders but is empty because `findings.yaml` was never populated. If you are tempted to do either, STOP and run the full fast-path as written.

### Loading team skills

Before group 1 runs, scan `.memory/skills/team/`. For each team skill whose frontmatter conditions match the current run:

- `metadata.modernize.languages` includes the detected language (or `"all"`)
- `metadata.modernize.state` is not `deprecated`
- `review_required_by` is in the future (otherwise mark for Step 2 re-confirmation in the next run)

Append the team skill to the appropriate group's execution list.

### Per-group execution loop

For each selected group, in priority order:

1. **Announce**: `"Running security-cve (1 skill)..."` — give the user a clear marker.
2. **Execute the group's skills**:
   - For each skill ID in the group, locate `assessment-skills/<skill-id>/SKILL.md` and follow its analysis instructions. Any legacy writer or output-location instruction inside an atomic skill is subordinate to the result contract below.
   - For team skills, locate `.memory/skills/team/<name>/SKILL.md` and follow its instructions.
  - Atomic skill shell snippets are illustrative search strategies, not mandatory commands. Use editor search/read tools first. When a command is necessary, translate it to the current platform (PowerShell on Windows; POSIX shell on Linux/macOS). Never execute a bash-only snippet, `/tmp` path, `jq`, `curl`, or `gh` command unless that executable is actually available.
   - Run skills concurrently up to `min(group_size, 12)` parallel tasks. 10-minute timeout per skill.
   - If a skill fails, log to `runs/<ts>/summary.md` errors block and continue with the rest of the group. Do NOT abort.
   - **Result contract (mandatory for every atomic skill):** Write the skill's complete JSON output to `.github/modernize/.memory/runs/<current-ts>/incoming/<skill-id>.json`. Then invoke:
     ```bash
     node .github/modernize/.runtime/assessment/assess-cli.mjs record-result \
       --skill <skill-id> \
       --input .github/modernize/.memory/runs/<current-ts>/incoming/<skill-id>.json \
       --findings .github/modernize/.memory/findings.yaml \
       --run-id <current-ts> \
       --run-dir .github/modernize/.memory/runs/<current-ts>
     ```
     Security skills write their full `FOUND`/`NOT_FOUND` checklist wrapper. Fact skills write their documented wrapper with `result.finding`, `confidence`, `evidence`, and `values`. Diagram skills also write their Markdown artifact, then write a fact wrapper that names that artifact. `record-result` is the sole writer to `findings.yaml`; atomic skills MUST NOT edit `findings.yaml` directly and MUST NOT call an MCP writer.
3. **Apply suppressions / team-skill rules**:
   - For every new finding, check `suppressions.yaml`. If matched, set state per the rule (`suppress` / `acknowledge` / `escalate`).
   - For every team skill, apply its rules (typically state transitions on matching findings).
4. **Update `findings.yaml`**:
   - New finding (no existing ID match) → append with state `new`
   - Existing finding still present → bump `last_seen`, append current run ts to `runs:`
   - Existing finding now absent → no change (only the user can mark resolved)
   - Re-appearance after `resolved` → state `new` with note "regression"
5. **Summarize the group** (≤ 200 words):
   ```
   security-cve completed (1 skill, 1m 47s)
     - 4 new findings: 1 critical (CVE-2021-44228 in log4j-core 2.14.1), 3 medium
     - 2 unchanged from prior runs (acknowledged)
     - 1 auto-suppressed by team-internal-libs-cve-suppress
   ```
6. **Auto-save group results to `.memory/` immediately** (background infra, not a user choice):
   - Append/update `findings.yaml` (atomic write)
   - Append the group line to `runs/<current-ts>/progress.jsonl`
   - Print a single dim toast: `“✓ saved to .memory/”` — do NOT make this a question, do NOT ask permission
   - This guarantees a crash mid-pipeline never loses data
7. **MANDATORY pause** (Rule 5):
   ```
   ask_user(
     question: "What next?",
     choices: [
       "Continue with next group",
       "Pause — let's discuss these findings now",
       "Skip remaining groups, generate the report now"
     ]
   )
   ```
   - "Continue" → next group
   - "Pause" → enter Step 5 immediately, return to Step 4 when user is done
   - "Skip remaining" → jump to Step 6 with what's collected so far

   > **Note**: There is intentionally no "stop and save" choice. Saving is automatic and already happened in step 6 above. The user only chooses between *flow* options, never between *save / don't save*.

### Cancellation / interruption

If the user types `stop`, `cancel`, or `abort` at any point, jump directly to Step 6 (Report). Partial results are already in `.memory/` thanks to per-group auto-save.

---

## Step 5 — Iteration mode

After Step 4 completes (or the user paused into it), the agent stays in conversation. Do NOT exit until the user explicitly says so.

> **Saving is invisible**: by the time the user sees this menu, every group's findings are already in `.memory/findings.yaml`. Never offer "save" as a user-facing action. The only terminal action is **“generate the report”** (Step 6).

### Opening message

```
Assessment complete. N findings tracked (M new, K unchanged, J auto-suppressed).
All results already saved to .github/modernize/.memory/.

You can:
  - "open the report"              → generate the interactive HTML report (default)
  - "explain finding X"            → drill down on one finding
  - "ignore findings matching Y"   → add a suppression rule
  - "re-run skill Z stricter"      → targeted re-run, not full pipeline
  - "show only critical"           → filter the view
  - "compare with last run"        → diff against the previous assessment
  - "create a plan from these"     → hand off to /create-modernization-plan
  - "I'm done"                     → generate the report and finish

What would you like to do?
```

### Handling user requests

For every user message, look up the matching scenario in [iteration-playbook.md](references/iteration-playbook.md) and follow it exactly. The playbook has 12 scenarios covering: explain, suppress, mark fixed, re-run, filter, compare, bulk action, create plan, save preference, curator opportunity, **open report**, and done.

### Curator opportunities

Watch the conversation for patterns that justify a team skill (per [skill-curator.md](references/skill-curator.md)):

- ≥ `preferences.curator_threshold` (default 3) suppressions on the same axis
- Repeated identical reasons across acknowledgments
- Explicit user instruction ("remember this for next time")

When triggered, follow `iteration-playbook.md` scenario **10**. Always `ask_user` before writing.

### Bias-patch capture (silent, no ask_user)

> The `[patches-checked: …]` tripwire from the **Response protocol** section near the top of this file applies to every iteration response. The capture rules below are about *writing new patches* after a user turn; the tripwire is about *acknowledging which existing patches you scanned*. Both are required and they cover different things.

After **every** user turn in Step 4 and Step 5 — not only obvious corrections — run the three-step self-check defined in [bias-patches-rule.md](references/bias-patches-rule.md):

1. Externalize your prior (one sentence: what you would have said if the user hadn't spoken).
2. Score the surprise (would you have bet against the actual answer at meaningful odds?).
3. Score scope + reusability (`session` → don't persist; `repo` → write here; `user` → rare).

When all three checks pass, write or reinforce a patch in `bias-patches.yaml` and surface a single audit line in the style of suppression auto-application:

```
📌 Recorded behavioral patch bp-0007: <prior> → <actual> (scope: repo)
```

or for reinforcement:

```
📌 Reinforced behavioral patch bp-0007 (now reinforced 3 times).
```

Do **not** call `ask_user`. Do **not** ask permission. The user opted in by installing the plugin; visible audit + a git-tracked yaml file are the trust mechanism, not a confirmation prompt.

### Hard rules during iteration

- NEVER re-run the entire pipeline because of one finding question — use a targeted re-run instead
- NEVER modify source code in iteration mode — for that, hand off to `execution-coordinator`
- NEVER write outside `.memory/` (and within `.memory/`, never write outside `skills/team/` for skill creation)
- NEVER delete findings — state machine only

---

## Step 5.5 — AI enrichment (narrative layer)

Between iteration converging and the report rendering, author the **AI narrative layer** that turns the report from a row dump into something that reads like a consultant wrote it.

### What you produce

A single file at `<memory-dir>/runs/<current-ts>/enrichment.yaml`. It holds the briefing, headlines, change narrative, themes, per-finding commentary, cross-cutting risks, cost estimate, and next-step prompts. It is **strictly additive** to `findings.yaml` — see [enrichment-schema.md](references/enrichment-schema.md) for the authoritative spec.

### How to produce it

This is a **gated, numbered procedure**. Do not improvise. Do not skip steps. Past runs have failed quality bar because agents invented schemas off the top of their head — every step below exists to prevent that specific failure.

1. **`read_file` [`references/enrichment-schema.md`](references/enrichment-schema.md)** end-to-end. The schema is the contract; any field you write that is not in the whitelist there is silently dropped by the loader.
2. **`read_file` [`references/enrichment-prompt.md`](references/enrichment-prompt.md)** end-to-end. It enumerates which files to read first, every output field, the trust rules for external URLs, the renamed fields (e.g. `body` not `one_liner`), and a self-check before saving.
3. **Author `runs/<current-ts>/enrichment.yaml`** following the prompt. The prompt is read-only against memory: it reads `findings.yaml`, intent, preferences, and a prior run if one exists; it writes only `enrichment.yaml`. It does NOT mutate findings, suppressions, or any other memory file.
4. **Run the validator** as a gate before Step 6:

   ```pwsh
   node .github/modernize/.runtime/assessment/assess-cli.mjs validate-enrichment `
       --memory-dir .github/modernize/.memory `
       --run-id <current-ts>
   ```

   The validator enforces the [Validation contract](references/enrichment-schema.md#validation-contract): briefing length, headline count, theme coverage, per-finding coverage for high+critical, `next_steps[]` shape, unknown-key detection, and the predicted report mode.
5. **If the validator exits non-zero**, read the failure list, revise `enrichment.yaml`, and re-run. Repeat until exit `0`. Do NOT proceed to Step 6 with a failing validator unless the user has explicitly opted in to raw mode (see "When to skip" below).
6. **Only then** proceed to Step 6.

### When to skip

Never skip silently. The only acceptable escape hatches are:

- **No findings worth narrating** (e.g. `findings.yaml` is empty, or every finding is suppressed). Emit a minimal valid file with `version: 1` and an `intent_slug`, run `validate-enrichment` with `--allow-raw true`, then proceed to Step 6 with `--enrichment NONE`.
- **User explicitly requested raw mode** ("just show me the data, skip the narrative"). Proceed to Step 6 with `--enrichment NONE` and surface the choice in the briefing area of the report.

Any other case — partial enrichment that fails validation, agent confidence drop, time pressure — is **not** a reason to skip. Revise and re-run the validator.

### Degradation tiers (rendered as a banner in § header)

| Enrichment fullness | Report tier | Banner |
|---|---|---|
| Briefing + themes + per-finding entries, validator exits 0 | `ai-narrated` | (none — mode pill only) |
| Some of the above present, some missing | `partial` | Amber: "Partial narrative — fallback panels fill the gaps." |
| File missing or only `version`/`intent_slug` | `raw` | Amber: "Raw data view. Run the enrichment step to add narrative." |

The generator derives the tier automatically from the file's content; you don't declare it. The validator predicts the tier and fails the gate if it would be anything other than `ai-narrated` (unless an escape hatch above applies).

---

## Step 6 — Report and next steps

Triggered automatically when:
- All selected groups in Step 4 have completed, OR
- The user picks “skip remaining” in a Step 4 pause, OR
- The user says “open the report” / “I'm done” / “generate report” during Step 5 iteration

> **Save was already done in Step 4** — do NOT re-prompt the user about saving. The user only sees the value-oriented question: “here's your report, what do you want to do with it?”

### 1. Finalize sediment (silent, background)

Update the small files that aren't already up-to-date from per-group autosave:

1. **`suppressions.yaml`** — only if rules were added during the session
2. **`preferences.yaml`** — only if a setting materially changed
3. **`last-intent.yaml`** — sync with `runs/<current>/intent.yaml`
4. **`bias-patches.yaml` GC sweep** — for each `state: active` patch:
   - If `last_reinforced_at` is older than `preferences.behavior.bias_patches.gc_stale_after_days` (default 90 days) AND the patch's `actual` matches what you would now generate by default (re-run the three-step check against the patch's `prior`), set `state: retired` with `retirement_reason: "default-now-matches-actual"`.
   - If a newer active patch directly contradicts an older one, set the older patch `state: superseded` with `retirement_reason: "superseded by bp-NNNN"`.
   - Never delete; retirement is auditable. Log sweep outcomes silently to `runs/<current>/summary.md` under `bias_patches:`.
5. **`runs/<current>/summary.md`** — ≤ 500-line digest (groups + duration + counts + errors + user actions + curator activity + bias-patch sweep outcomes)
6. **`runs/` pruning** — keep most recent 20 runs OR last 90 days, whichever yields fewer

Do NOT print these as actions. They are infrastructure.

### 2. Generate the interactive HTML report

> **Gate.** Confirm `validate-enrichment` exited `0` in Step 5.5 — or that the user has explicitly opted into raw mode (Step 5.5 "When to skip"). If neither is true, **return to Step 5.5 and revise enrichment.yaml**. Do not run the report generator on a failing validator; it will produce a `partial` report that wastes the user's attention.

Run:

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs generate-report \
  --memory-dir .github/modernize/.memory \
  --run-id <current-ts> \
  --output-dir .github/modernize/reports
```

The script:
- Reads `findings.yaml`, `suppressions.yaml`, `preferences.yaml`, `runs/<current-ts>/*`
- Loads `runs/<current-ts>/enrichment.yaml` if present (see Step 5.5). Pass `--enrichment NONE` to force the raw-data view regardless of file presence; pass `--enrichment <path>` to use a non-default location.
- Renders a **single self-contained HTML file** (data embedded as JSON, vanilla JS interactivity — no external CSS or scripts)
- Writes two paths:
  - `.github/modernize/reports/<current-ts>-<intent>.html` — versioned, never overwritten
  - `.github/modernize/reports/latest.html` — always the most recent run, easy to bookmark

After the HTML report succeeds, generate the planning compatibility report. This does not restore the old assessment engine; it only preserves the report-to-plan contract and explicit solution/`kbId` mapping:

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs generate-compat-report \
  --memory-dir .github/modernize/.memory \
  --run-id <current-ts> \
  --output-dir .github/modernize/assessment/reports \
  --language <java|dotnet|javascript> \
  --solution-mapping .github/modernize/.runtime/assessment/solution-mapping.json
```

The returned `.github/modernize/assessment/reports/report-<timestamp>/report.json` is the path passed to the existing planning coordinator. Never synthesize a `kbId`; the Node command derives it only from the bundled rule-to-solution mapping. Solutions under `bare/` deliberately have no `kbId`.

Report structure (see [report-template.md](references/report-template.md)) is driven by enrichment content: an `ai-narrated` report shows briefing → headlines → change narrative → themed finding cards → next steps; a `raw` report shows the same finding cards grouped by severity tier with no narrative. Both modes share the chip-facet filter bar, drawer for related knowledge, command palette (`/` or `⌘K`), and `j`/`k` keyboard navigation.

If the script fails:
- Log the error to `runs/<current-ts>/summary.md` under `report_generation_errors:`
- Surface a one-line warning to the user
- Continue to the next step — do NOT block on report failure

### 3. Curator follow-up (if any)

If a curator opportunity was deferred during Step 5, mention it once now:

```
FYI: I noticed you've suppressed CWE-477 in test code 4 times.
Next session, ask me to make it a team skill if you want.
```

### 4. Present the report + next-step menu

Replace the old “Saved.” greeting with an **action-oriented handoff**:

```
Report ready: .github/modernize/reports/2026-05-13T10-42-11Z-cloud-readiness.html
             (also at .github/modernize/reports/latest.html)

47 findings tracked  •  4 new this run  •  2 resolved  •  1 regression
Top recommendation: <one sentence from §6 of the report>
```

Then ask the user with `ask_user(...)` — **NOT** by typing your own numbered list. Use this exact call so the visible number and the routing target are identical:

```
ask_user(
  question: "What next?",
  choices: [
    "Open the report in my browser",         # 1 (default)
    "Generate a migration plan",             # 2 → /create-modernization-plan
    "Drill into a specific finding",         # 3
    "Run a group I skipped",                 # 4
    "I'm done"                               # 5
  ]
)
```

- Choice 1 → attempt to open with the platform default (`start` on Windows, `open` on macOS, `xdg-open` on Linux). If that fails, just print the path.
- Choice 2 → hand off to `create-modernization-plan` with a prefilled prompt based on the report's top recommendation (see [iteration-playbook.md](references/iteration-playbook.md) scenario **08**)
- Choice 3 / 4 → stay in Step 5 iteration
- Choice 5 → exit (memory is already saved, report is already generated; nothing to do)

In **coordinator mode**, skip this menu and return: detected language, selected groups, finding counts, top recommendation, HTML report path, and compatibility `report.json` path.

> ⛔ **Menu rendering rule (binding)**:
>
> 1. The choice **order above is fixed**. Do not reorder when localizing. "Open the report" is always position 1 (the default).
> 2. The **visible number = the routing target**. Never renumber based on what you think the user "really wants." If the user types `2`, you execute the action at position 2 in the `choices` list above — no exceptions.
> 3. Always invoke `ask_user(choices=[...])`. Do not hand-write `1. ... 2. ... 3. ...` markdown bullets — those are not interactive and they invite the agent to silently reorder labels.
> 4. Localize the *labels* if needed, but keep the *order*. Example: "1. 在浏览器中打开报告 / 2. 生成迁移计划 / 3. 深入查看某个发现 / 4. 运行跳过的组 / 5. 完成".

### Rule: “save” is never a user-facing verb

Nowhere in Step 6 should the agent ask “do you want to save?”, “should I write the memory?”, or offer a choice like “save and exit”. Saving is implicit, automatic, and irreversible by design — it's not a feature, it's the substrate.

---

## Error handling

| Error | Action |
|-------|--------|
| `.memory/` schema version mismatch | Stop, ask user how to proceed |
| AppCAT install failure | Surface error, offer to retry; skip pre-assessment if user declines |
| AppCAT run failure | Log to `runs/<ts>/summary.md`, continue with AI-skill phase |
| `report.json` not generated | Treat as failed pre-assessment; continue with the rest |
| Single skill failure | Log to `runs/<ts>/summary.md`, continue with remaining skills in the group |
| Skill timeout (10 min) | Same as failure |
| Whole group fails | Surface to user with `ask_user("Group X had N failures. Continue / abort / retry?")` |
| `.memory/` write fails (file changed on disk) | Re-read, reconcile, ask user before overwriting |
| Network failure during CVE scan | Skip CVE scan, continue, surface error in summary |
| `GITHUB_TOKEN` missing for CVE | Use unauthenticated API; warn about rate limits |

---

## Examples

### Example 1: Security-only quick scan

```
User: /assessment
Agent: First assessment in this repo. I'll set up .memory/ as we go.
       What do you want this assessment to focus on?
         > Security only (CVE + CWE)
         > Cloud / containerize readiness
         > Architecture understanding
         > Full audit (~30+ min)
         > Custom — let me pick groups
User: security only
Agent: [renders plan: 7 skills, ~12 min]
       Run this plan?
User: yes
Agent: [runs security-cve → ✓ saved to .memory/ → summary → pauses]
       What next? (Continue / Pause / Skip remaining)
User: continue
Agent: [runs security-cwe → ✓ saved → summary → jumps to Step 6]
       Report ready: .github/modernize/reports/<ts>-security.html
       11 findings tracked, 4 new this run.
       Top recommendation: upgrade log4j-core to 2.17.1.
       What next? (1 Open report / 2 Generate plan / 3 Drill in / 5 Done)
User: 5
Agent: Done. Report and .memory/ are saved.
```

### Example 2: Returning user with sticky preference

```
User: /assessment
Agent: Loaded 23 known findings (3 new since last run, 2 still open).
       Last time you focused on security. Same again?
         > Same as last time (security only)
         > Switch focus
         > Show me what changed since last run first
User: same
Agent: [renders plan with same groups, plus auto-loads team-internal-libs-cve-suppress]
       Run this plan?
User: yes
Agent: [runs, applies team skill, pauses, summarizes]
```

### Example 3: Iteration drill-down

```
[After Step 4, user is in Step 5]
User: why is the log4j one marked critical?
Agent: [iteration-playbook scenario 01]
       Finding cve-known-vulnerabilities::a3f2c19b8e1d
         What it says: CVE-2021-44228 (Log4Shell) in log4j-core 2.14.1
         Why critical: remote code execution, CVSS 10.0
         Where: pom.xml line 47
         Suggested next: upgrade to 2.17.1 or later
       Want me to acknowledge it, suppress similar findings, or move on?
User: ignore findings in our internal-libs folder
Agent: [iteration-playbook scenario 02]
       This rule will suppress 0 existing findings and apply to future runs.
       Description: "ignore findings in our internal-libs folder". Confirm?
       > Yes  > Adjust scope  > Cancel
User: yes
Agent: Suppressed 0 findings. Rule saved.
       [Tracks suppression count = 1; will trigger curator at 3]
```
