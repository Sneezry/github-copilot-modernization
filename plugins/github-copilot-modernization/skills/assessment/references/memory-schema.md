# Memory Schema — `.github/modernize/.memory/`

> **Purpose**: The plugin's persistent layer. Survives across runs. Lets the product remember user intent, suppress already-acknowledged findings, and accumulate team-specific conventions.

> **Location**: `<repo-root>/.github/modernize/.memory/` — repo-shared so the whole team benefits. Personal preferences are NOT stored here (this PoC is repo-scoped).

> **Related**: Reports rendered from this state live at `<repo-root>/.github/modernize/reports/` — see [Reports directory](#reports-directory--githubmodernizereports) below. The two folders are intentionally siblings: `.memory/` is the **state**, `reports/` is the **view**.

---

## Layout

```
.github/modernize/.memory/
├── preferences.yaml      # Default groups, output prefs, behavioral toggles
├── last-intent.yaml      # Most recent run's intent (fast resume)
├── findings.yaml         # Stable finding index with state machine
├── suppressions.yaml     # Rules that auto-hide findings matching a pattern
├── bias-patches.yaml     # Behavioral patches captured silently by assess
├── runs/
│   └── <ISO-timestamp>/
│       ├── intent.yaml           # Frozen snapshot of this run's intent
│       ├── selected-skills.yaml  # Exact skill list executed
│       └── summary.md            # Human-readable summary
└── skills/
    └── team/
        └── <skill-name>/
            └── SKILL.md          # AI-curated team skill (see skill-curator.md)
```

### `.gitignore` recommendation

Commit:

- `preferences.yaml`
- `suppressions.yaml`
- `findings.yaml`
- `bias-patches.yaml`
- `skills/team/`

Ignore:

- `runs/` (per-run snapshots are noise; the curated state lives in the committed files)
- `last-intent.yaml` (machine-generated cache; reproducible from `runs/`)

Suggested `.github/modernize/.memory/.gitignore`:

```gitignore
runs/
last-intent.yaml
```

---

## File-by-file specification

### `preferences.yaml`

Long-lived team preferences. Updated by Step 6 of [`SKILL.md`](../SKILL.md) after each run.

```yaml
version: 1
default_groups:
  - security-cve
  - security-cwe
  - architecture
output:
  format: markdown          # markdown | json | both
  verbosity: concise        # concise | detailed
behavior:
  per_group_pause: true     # require ask_user between groups (Rule 5)
  auto_apply_suppressions: true
  proactive_curator: true   # AI may propose new team skills (Rule 4)
  curator_threshold: 3      # how many repeats before AI proposes a skill
  bias_patches:
    max_loaded_per_run: 20         # hard cap on patches injected into context per run
    relevance_filter: true         # filter by current intent before loading
    overflow_strategy: digest      # digest | drop-oldest | warn-user
    gc_stale_after_days: 90        # active patches not reinforced for N days are GC candidates
language_overrides:
  java:
    target_runtime: openjdk21
    target_compute: [azure-container-apps]
  dotnet:
    target_runtime: net9.0
notifications:
  github_issue_default: null   # or a URL pattern like "https://github.com/owner/repo/issues/{number}"
```

**Read at**: Step 1 (load history), every run.
**Written at**: Step 6 (sediment), only when something materially changed.
**Ask before overwriting**: only if the user is changing a value via natural language (Rule 1 still applies).

### `last-intent.yaml`

Cache of the most recent intent so the agent can offer "same as last time" without re-prompting. Equivalent to `runs/<latest>/intent.yaml` but at a fixed path.

```yaml
version: 1
captured_at: 2026-05-13T10:42:11Z
user_concern: security              # security | upgrade | architecture | full | custom | resume
selected_groups:
  - security-cve
  - security-cwe
skill_overrides:
  added: [fact-security-implementation]
  removed: [cwe-memory-safety]
priorities:
  high: [security-cve]              # run first
  normal: [security-cwe]
notes: "Pre-release security audit for v2.3"
```

### `findings.yaml`

The cross-run finding registry. Each finding has a stable ID; state evolves over time.

```yaml
version: 1
findings:
  - id: cve-known-vulnerabilities::a3f2c19b8e1d
    skill: cve-known-vulnerabilities
    severity: high
    title: "CVE-2021-44228 in log4j-core 2.14.1"
    location: "pom.xml"
    first_seen: 2026-05-13T10:42:11Z
    last_seen: 2026-05-13T10:42:11Z
    state: new                  # new | acknowledged | suppressed | escalated | resolved
    state_changed_at: 2026-05-13T10:42:11Z
    state_reason: ""
    runs:
      - 2026-05-13T10:42:11Z
  - id: appcat::file-system-management::8b1f2c0a4d33
    skill: appcat::file-system-management
    severity: low
    title: "File system - Java NIO"
    location: "src/main/java/com/example/Reader.java"   # primary (first alphabetical) for table display
    line: 23                                            # primary line
    occurrences: 5              # ≥ 1; omitted when 1. Total evidence points across all files.
    effort: 3                   # AppCAT-estimated migration effort, story points. Optional.
    rationale: "The application uses Java NIO for file system access. To migrate to Azure, consider:\n\n * Use **Azure Files**: Replace local NIO paths with Azure Files SMB shares…"
    links:                       # Documentation references the user can jump to. Optional.
      - url: "https://learn.microsoft.com/azure/storage/files"
        title: "Azure Files documentation"
    locations:                                          # Full evidence list. Omitted when occurrences ≤ 1.
      - file: "src/main/java/com/example/Reader.java"
        line: 23
      - file: "src/main/java/com/example/Reader.java"
        line: 47
      - file: "src/main/java/com/example/Writer.java"
        line: 12
      - file: "src/main/java/com/example/Cache.java"
        line: 88
      - file: "src/main/java/com/example/Cache.java"
        line: 91
    first_seen: 2026-05-13T10:42:11Z
    last_seen: 2026-05-13T10:42:11Z
    state: new
    state_changed_at: 2026-05-13T10:42:11Z
    state_reason: ""
    runs:
      - 2026-05-13T10:42:11Z
  - id: cwe-injection-attacks::7d2e9a01b5c4
    skill: cwe-injection-attacks
    severity: medium
    title: "Possible SQL injection in OrderRepository.findByUser"
    location: "src/main/java/com/example/OrderRepository.java:42"
    first_seen: 2026-05-12T08:00:00Z
    last_seen: 2026-05-13T10:42:11Z
    state: acknowledged
    state_changed_at: 2026-05-12T09:15:00Z
    state_reason: "Reviewed; planned for Q3 sprint"
    runs:
      - 2026-05-12T08:00:00Z
      - 2026-05-13T10:42:11Z
```

#### Finding ID generation

```
id = "{skill_id}::" + sha256(skill_id + "|" + identifier_key)[:12]
```

- `identifier_key`: a stable identifier for the *thing being detected*, not its presentation or its evidence location.
  - **AppCAT findings**: the stripped rule ID (e.g. `azure-database-mysql`, `connect`). Improving the rule's description in a later ruleset update must NOT churn the ID.
  - **CVE findings**: the CVE ID + package coordinate (e.g. `CVE-2021-44228|log4j-core`).
  - **CWE findings**: the CWE class + a canonical symbol (e.g. `CWE-89|OrderRepository.findByUser`). Per-call-site disambiguation goes into `locations[]`, not the ID — same vuln class, same sink, same fix.
  - Free-form scanners without a stable identifier may fall back to a normalised title — but every integration should prefer a stable key when one exists, because *title is presentation; identifier_key is identity*.

**Why location is NOT in the ID**: a rule firing in six different files is *one* fact about the project ("this project uses X"), not six separate problems. The locations are evidence — enumerated in the `locations[]` field of the same finding. Putting the file path in the ID would split the finding into six lookalike rows that mock the user with repetition. See *Per-rule rollup* below.

**Why title is not in the ID**: titles are how findings are displayed. When a scanner's description database improves (better wording, localisation, expansion of a cryptic code), the user should see the improved title without losing the finding's acknowledgement history.

#### Optional fields

| Field | When present | Notes |
|-------|--------------|-------|
| `line` | When the source emits a line number | Used as a jump target by the report; never part of `id`. The primary line of the primary location. |
| `occurrences` | When the same rule fires ≥ 2 times across all files (after de-dup) | Integer ≥ 2. Omitted (or 1) means "single hit". Rendered as a small `N×` badge next to the title — NEVER baked into the title string. |
| `locations` | When `occurrences > 1` *or* the finding genuinely spans multiple files | List of `{file, line}` evidence entries, sorted alphabetically by file then line, de-duplicated. The first entry equals the top-level `location`/`line` (primary). Omitted when there is only one evidence point. |
| `rationale` | Whenever the source provides one (AppCAT always does, when its `report.json` is available) | The "why is this flagged / what to do" explanation. Plain-text or minimal markdown (`**bold**`, `* bullet`, bare URLs). Capped at ~4 KB by the integrator. Rendered as the per-row drill-down (§ 3 "Why this matters · What to do"). Without this, a finding is a verdict without a reason — useless to a user who doesn't already know the rule. |
| `links` | When the source provides documentation references | List of `{url, title}`. Rendered as a clickable reference list inside the drill-down. URLs are auto-linked from rationale text too, but explicit links survive any rationale truncation. |
| `effort` | When the source ships an estimate (AppCAT does) | Integer, story-point convention. Shown as a subtle badge in the drill-down ("Effort: N story points"). Advisory only — do NOT sort, filter, or auto-prioritise by this. |
| `evidence` | When the source provides a one-line proof (rule IDs, package coords, regex match) | Free-form. Shown in finding drill-down debug section, not in the table. |
| `source` | Origin scanner (`appcat`, `osv`, `cwe-injection-attacks`, …) | Used by integrators to know which findings to refresh on re-run. |

#### Per-rule rollup (and when NOT to roll up)

For scanners that detect **project-level facts** ("this project uses AWS S3", "this project depends on RabbitMQ", "this project has a Spring Boot restricted config"), each rule produces **one finding** regardless of how many files match. The matched files become entries in the `locations[]` evidence list. AppCAT is the canonical example: a rule firing in 12 files is still "the project uses S3" — one decision to make, one row in the report.

For scanners that detect **distinct bugs** (CWE-style code-quality / security findings where each call site is a separate thing to fix), keep one finding per call site. "SQL injection in `OrderRepository.findByUser`" and "SQL injection in `UserController.lookupBy`" are two independent bugs that must be fixed in two places — collapsing them would hide the second one.

**Each integration script makes its own choice.** The schema supports both: per-rule integrators (the Node `integrate-appcat` command) build their bucket key from `stripped_rule` only and emit `locations[]`; per-site integrators key by `(rule, symbol)` and emit a single `location`. The report renders both shapes from the same template — single-location findings just don't get a `+N more` expander.

**Forbidden**: per-location splitting of project-level facts. "AWS S3 usage found" must never appear as six separate rows.

#### Scanner inventory passes are NOT findings

Some scanners run **discovery / inventory rules** that fire once per matched file just to enumerate what was scanned (e.g. AppCAT's `discover-java-files`, `discover-maven-xml`, `discover-properties-file`). These tell us what the scanner *looked at*, not what is *wrong*. The file tree itself already conveys that information.

**Integration scripts MUST drop these at conversion time** — they never enter `findings.yaml`. Hiding them only in the UI is wrong: they would still inflate `counts.total`, drown the agent in noise when reasoning over the file, and skew "new this run" deltas. See `the Node AppCAT discovery-rule filter` for the AppCAT-specific list.

#### Unclassified scanner findings

When a scanner fires a rule whose human-readable description cannot be resolved (e.g. older AppCAT versions without `report.rules`, or a rule that ships without metadata), the integrator MUST:

1. Use a clearly-marked fallback title: `"Unclassified: <humanized-rule-id>"`. Do **not** leak the scanner name into the title (no `"AppCAT rule X"`, no `"OWASP DC: X"`); the source belongs in the `source` and `evidence` fields, not in user-facing prose.
2. Demote the severity to `info` — we don't know what the rule means, so we cannot honestly claim it's high-priority. The report hides `info` by default, so these stay out of the way until the user explicitly opts in.
3. Leave `rationale`, `links`, and `effort` unset. The drill-down for these rows is empty by design — we don't have anything trustworthy to say. (When the unclassified rate is high, that's a signal to fix the integration script, not to invent fallback prose.)

#### Why findings carry an explanation

An assessment is the start of the user's work, not the end. A row that says only "PostgreSQL database found" leaves a user who doesn't know the rule asking *what does this mean for me, and what do I do now?* Every finding therefore carries (when the source provides them) the three pieces of context that unblock the next step:

- **`rationale`** — why is this flagged in the context of the user's intent (e.g. for cloud-readiness: "Azure offers a managed PostgreSQL service; here's how to move")
- **`links`** — the doc the user would otherwise have to hunt for
- **`effort`** — a rough sense of cost, for triage

Integration scripts must propagate these when available. **Findings without rationale are tolerated, never preferred.** If the upstream scanner exposes a description anywhere (per-rule metadata, per-incident message, sidecar docs), the integration is responsible for capturing it.

#### Finding state machine

```
        new ──┬──> acknowledged ──> resolved
              │         │
              │         └──> escalated
              │
              └──> suppressed (via suppressions.yaml rule match)
```

Transitions allowed:

| From → To | Trigger |
|-----------|---------|
| `new` → `acknowledged` | User says "I've seen this", "noted", or runs `/assessment` again with explicit acknowledgment |
| `new` → `suppressed` | A `suppressions.yaml` rule matches OR user says "ignore this" |
| `new` → `escalated` | User says "this is critical" / "block release" |
| `acknowledged` → `resolved` | User says "fixed", or finding stops appearing for N consecutive runs (default 3) |
| `acknowledged` → `escalated` | User upgrades severity |
| `suppressed` → `new` | The matching suppression rule was removed |
| `escalated` → `resolved` | Same as acknowledged → resolved |
| `resolved` → `new` | Finding reappears after disappearing (regression) |

The agent NEVER deletes findings — only state changes. A `resolved` finding that reappears becomes `new` again so regressions are visible.

### `suppressions.yaml`

Rules that auto-apply on every run. Match findings by skill, location glob, or content regex.

```yaml
version: 1
rules:
  - id: rule-1
    description: "Internal libs are version-managed centrally; ignore version-pin warnings"
    created_at: 2026-05-12T08:00:00Z
    created_by: user             # user | ai-curator
    match:
      skill: cve-known-vulnerabilities
      location_glob: "**/internal-libs/**"
    action: suppress
  - id: rule-2
    description: "Test code is excluded from CWE injection checks (false positives in fixtures)"
    created_at: 2026-05-13T09:00:00Z
    created_by: user
    match:
      skill: cwe-injection-attacks
      location_glob: "**/src/test/**"
    action: suppress
  - id: rule-3
    description: "Acknowledge all CWE-477 (deprecated API usage) — planned for Java 21 sweep"
    created_at: 2026-05-13T09:30:00Z
    created_by: user
    match:
      skill: cwe-code-quality
      title_regex: "CWE-477"
    action: acknowledge          # don't hide; just bump state from new → acknowledged
```

**Match operators**: `skill` (exact), `location_glob` (gitignore-style), `title_regex`, `severity_min` (e.g. `severity_min: high` matches high+critical).

**Actions**: `suppress` (hide from summary, don't count in totals) | `acknowledge` (show but not as new) | `escalate` (force severity bump).

Each rule MUST have a `description` so a teammate reading the file 6 months later can decide whether the rule still applies.

### `bias-patches.yaml`

The behavioral patch log. Captures, in machine-readable form, the deltas between what the model would have generated by default and what the user actually established as true / required during an assess conversation. Loaded as a hard constraint on output for every subsequent run, by every skill in `applies_to.skills`.

> **Capture is assess-only.** The full capture / dedupe / GC contract lives in [bias-patches-rule.md](bias-patches-rule.md). `create-modernization-plan` and `execution-coordinator` load this file (read-only) and treat each active patch as a hard constraint, but they never write to it.

```yaml
version: 1
patches:
  - id: bp-0001
    captured_at: 2026-05-19T14:23:00Z
    last_reinforced_at: 2026-05-19T14:23:00Z
    reinforce_count: 1
    captured_in_run: 2026-05-19T14:20:00Z
    source: user-correction          # user-correction | user-preference | user-confirmation
    scope: repo                      # repo | user  (sessions are NOT persisted here)
    prior: |
      Default Azure migration recommendation for this project includes
      Azure Container Apps as the primary target (Dockerfile-based path).
    actual: |
      User requires non-containerized PaaS only; exclude ACA, AKS, and
      any Dockerfile-based path from the candidate set.
    applies_to:
      skills: [assessment, create-modernization-plan, execution-coordinator]
      intents: [cloud-readiness, upgrade, full]
    state: active                    # active | retired | superseded
    state_changed_at: 2026-05-19T14:23:00Z
    retirement_reason: null          # populated only when state changes away from active

  - id: bp-0002
    captured_at: 2026-05-19T15:01:00Z
    last_reinforced_at: 2026-05-20T09:14:00Z
    reinforce_count: 2
    captured_in_run: 2026-05-19T14:20:00Z
    source: user-correction
    scope: repo
    prior: |
      Login flow connects directly to the user database; no buffering
      observed in static analysis.
    actual: |
      Login flow goes through a message queue between the auth service
      and the user database for write buffering.
    applies_to:
      skills: [assessment, create-modernization-plan]
      intents: [architecture, full]
    state: active
    state_changed_at: 2026-05-19T15:01:00Z
    retirement_reason: null
```

#### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Monotonically increasing `bp-NNNN` (zero-padded to 4 digits). Stable forever; never reused. |
| `captured_at` | ISO timestamp | When the patch was first written. |
| `last_reinforced_at` | ISO timestamp | Updated every time a duplicate would have been created (instead of duplicating, the existing entry is reinforced). Drives recency sort at load time and GC at sweep time. |
| `reinforce_count` | integer | Starts at `1`; `+= 1` on each reinforcement. |
| `captured_in_run` | string | The `runs/<ts>/` folder name for the run that produced this patch. Enables audit ("which assessment surfaced this?"). |
| `source` | enum | `user-correction` (user said "you're wrong"), `user-preference` (user said "I prefer / require X"), `user-confirmation` (user picked a low-prior option the model wouldn't have defaulted to). |
| `scope` | enum | `repo` (default — true for this codebase) or `user` (true across all of the user's projects; rare — those should usually go to Copilot's `/memories/` instead). |
| `prior` | string | One sentence: what the model **would have** said/chosen if the user hadn't intervened. Externalized to prevent hindsight rationalization. |
| `actual` | string | What the user actually established as true / required. |
| `applies_to.skills` | list | Which skills should honor this patch. Always includes `assessment` for repo-scoped facts; includes `create-modernization-plan` / `execution-coordinator` when the patch affects target selection or execution. |
| `applies_to.intents` | list | Which intent groups (`cloud-readiness`, `architecture`, `upgrade`, `security`, `full`, `custom`). Used by the relevance filter at load time. |
| `state` | enum | `active` (loaded and applied), `retired` (default-now-matches-actual, no longer needed), `superseded` (a newer patch contradicts and replaces this one). Patches are NEVER deleted — retirement is auditable. |
| `state_changed_at` | ISO timestamp | When `state` last changed. |
| `retirement_reason` | string \| null | Free text explaining the retirement, e.g. `"default-now-matches-actual"`, `"superseded by bp-0014"`, `"user-retired via 'forget bp-0007'"`. `null` while `active`. |

#### Patch lifecycle

```
        active ──┬──> retired       (default now matches; not reinforced for >gc_stale_after_days)
                 │
                 └──> superseded    (a newer active patch contradicts this one)
```

Transitions allowed:

| From → To | Trigger |
|-----------|---------|
| `active` → `retired` | Step-6 GC sweep finds `last_reinforced_at` older than `preferences.behavior.bias_patches.gc_stale_after_days` AND the patch's `actual` matches the model's current default output. |
| `active` → `superseded` | A newly captured `active` patch directly contradicts an older one (e.g., "no containers" replaced by "containerize via ACA"). The older patch's `retirement_reason` records the superseding `id`. |
| `active` → `retired` (user) | User says "forget bp-0007" / "that's no longer true". Skip the auto checks. |

Reverse transitions (`retired` → `active`) are not allowed automatically — if the patch becomes true again, a fresh `bp-NNNN` is captured. This keeps audit history linear.

#### Load-time pipeline (every skill in `applies_to.skills`)

1. Read all patches.
2. Drop `state != active`.
3. Keep patches whose `applies_to.intents` intersects the current run's intent.
4. Sort by `last_reinforced_at` descending.
5. If the filtered list exceeds `preferences.behavior.bias_patches.max_loaded_per_run` (default `20`), apply `overflow_strategy`:
   - `digest` — compress overflow into a short bullet-list summary; inject that instead of raw patches. File untouched.
   - `drop-oldest` — drop the tail silently; surface the count in the greeting.
   - `warn-user` — load the cap; greeting says `"You have N active patches; consider review"`.
6. Treat each retained patch as a **hard constraint on generation** for the rest of the conversation.

#### Anti-patterns

- ❌ Asking the user "should I remember this?" — silent capture is the design.
- ❌ Writing a patch for every user turn — only when prior ≠ actual passes the three-step self-check.
- ❌ Defaulting `scope: user` — pollutes the user's global memory; default to `repo`.
- ❌ Deleting retired patches to shrink the file — use the load-time filter pipeline instead.
- ❌ Capturing patches inside `create-modernization-plan` / `execution-coordinator` — capture is assess-only.

### `runs/<ISO-timestamp>/`

A frozen per-run record. Used for diffing across runs and audit.

```
runs/2026-05-13T10-42-11Z/
├── intent.yaml           # copy of what the user asked for this run
├── selected-skills.yaml  # exact skill IDs executed
└── summary.md            # ≤500-line digest: groups run, finding counts by state, time taken, errors
```

Folder name uses safe ISO with `:` → `-`. The agent prunes runs older than the 20 most recent on Step 6 (or 90 days, whichever is shorter).

### `skills/team/<name>/`

AI-curated mini-skills. Schema and lifecycle are owned by [skill-curator.md](skill-curator.md). The `team/` namespace is the ONLY location AI is allowed to write skills (Rule 6 / safety boundary).

---

## Versioning

Every YAML has a top-level `version: 1`. When a future PoC iteration changes schema:

1. Bump the version
2. Add a migration block to [`SKILL.md`](../SKILL.md) Step 1 ("if version == 1 and X, transform to version 2")
3. Never silently rewrite — always log the migration to `runs/<ts>/summary.md`

For PoC v1, only `version: 1` exists. Reading anything else → ask user how to proceed.

---

## Concurrency / Locking

`.memory/` is committed to git, so concurrent updates are resolved at git-merge time. The agent SHOULD:

- Read all files once at Step 1
- Hold the in-memory copy through the run
- Write back at Step 6 with a single atomic write per file

If a write fails (e.g. file changed on disk during the run), the agent re-reads, reconciles, and re-asks the user before overwriting.

---

## What does NOT belong in `.memory/`

- API tokens, secrets, credentials → use `.env` or external secret manager
- Full AppCAT raw output, large machine artifacts → keep them next to where the tool wrote them; `.memory/` holds curated state only
- Personal user IDs → keep `.memory/` team-impersonal; if attribution matters, use git blame
- Temporary scratch — use `runs/<ts>/` for that, and let pruning clean up
- **Generated reports** — see `reports/` (next section). `.memory/` holds state, never views.

---

## Reports directory — `.github/modernize/reports/`

A sibling folder to `.memory/`. Holds the interactive HTML reports produced at Step 6 of [`SKILL.md`](../SKILL.md). The reports are a **derived view** of `.memory/` — they can always be regenerated and never contain anything that isn't already in `.memory/`.

### Layout

```
.github/modernize/reports/
├── latest.html                                  # always overwritten; bookmark this
├── 2026-05-13T10-42-11Z-security.html           # versioned, immutable
├── 2026-05-12T08-14-02Z-cloud-readiness.html
└── …
```

### Naming convention

- `latest.html` — a copy of the most recent versioned report. Use this for stable bookmarks ("my team's latest assessment") and for CI comments that should always link to the freshest run.
- `<run-id>-<intent-slug>.html` — versioned, never overwritten. `intent-slug` is derived from `intent.yaml`'s `user_concern` field (e.g. `security`, `cloud-readiness`, `architecture`, `full`, `assess` as fallback).

### Generated by

```
node .github/modernize/.runtime/assessment/assess-cli.mjs generate-report \
  --memory-dir .github/modernize/.memory \
  --run-id <ts> \
  --output-dir .github/modernize/reports
```

Invoked automatically by Step 6 of `SKILL.md`. The runtime uses only Node 18+ built-ins, so no package installation is needed.

### Structure of each report

Fixed 6 sections (regardless of which groups ran; unrun sections render as "Not assessed in this run"):

1. **Executive summary** — finding totals, severity stat tiles, top recommendation
2. **Scope of this run** — groups executed vs skipped
3. **Findings** — filterable, sortable table backed by `findings.yaml`
4. **Active suppression rules** — rendered from `suppressions.yaml`
5. **Next actions** — prefilled prompt for handoff to `create-modernization-plan`, plus drill-in hints
6. **Run metadata** — collapsed raw payload for debugging

The template is owned by [`scripts/templates/report.html`](../scripts/templates/report.html) — a single self-contained file with inline CSS, vanilla JS, and an embedded JSON payload. No external assets; safe to email, copy to a wiki, or open offline.

### `.gitignore` policy

Commit:
- `latest.html` — so PR comments and bookmarks always point at a fresh view

Ignore:
- `<run-id>-*.html` — the versioned snapshots are large and reproducible from `.memory/`

Suggested `.github/modernize/reports/.gitignore`:

```gitignore
*
!latest.html
!.gitignore
```

### What does NOT belong in `reports/`

- Source-of-truth state — that's `.memory/`; `reports/` is always regenerable
- Hand-edited HTML — every file is overwritten on the next run
- Anything that isn't a single self-contained `.html` (no images, no JS bundles)
