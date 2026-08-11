# Enrichment Prompt — write `runs/<run-id>/enrichment.yaml`

> **Used by** [`../SKILL.md`](../SKILL.md) Step 5.5 — "AI Enrichment".
> **Output spec** [`enrichment-schema.md`](enrichment-schema.md) is authoritative for every key, type, and constraint mentioned here. When in doubt, the schema wins. **You MUST `read_file` the schema before authoring.**
> **Gate** The Node `validate-enrichment` command implemented in [`../scripts/assess-report.mjs`](../scripts/assess-report.mjs) must exit `0` against the file you produce. Step 6 will not run until it does.

This prompt produces the **AI-authored narrative layer** of the report. The fact layer (`findings.yaml`) is already complete. Your job is to add the human-feel briefing, the headlines, the thematic grouping, the per-finding commentary, the cross-cutting risks, and the cost estimate that make the HTML report read like a consultant wrote it instead of a tool dumping rows.

---

## When to run

After Step 5 (iteration) of the assess skill has converged and **before** Step 6 (report generation). The generator will:

- If `enrichment.yaml` is missing → render the **raw data** view (no narrative, just findings).
- If it is present but partial → render the **partial** report with an amber banner.
- If it passes the validator → render the **AI-narrated** report (the only acceptable outcome unless the user explicitly opted in to raw mode).

Always attempt this step. Running the validator afterwards is mandatory.

---

## Inputs you MUST read first

Read these files in this exact order. Do not invent values for anything not present here.

| # | Path | Why |
|---|------|-----|
| 1 | `references/enrichment-schema.md` | Authoritative output spec. Read this end-to-end before authoring. |
| 2 | `<memory-dir>/findings.yaml` | The authoritative finding list. Every reference you write must resolve here. |
| 3 | `<memory-dir>/runs/<run-id>/intent.yaml` | The user's concern for this run (drives briefing tone and headline selection). |
| 4 | `<memory-dir>/runs/<run-id>/selected-skills.yaml` | Which skills were actually run — tells you what coverage the report has. |
| 5 | `<memory-dir>/preferences.yaml` | Team preferences (e.g. target Azure service). Influences `what_to_do` advice. |
| 6 | `<memory-dir>/suppressions.yaml` | Don't author enrichment for suppressed findings unless asked. |
| 7 | `<memory-dir>/runs/<prior-run-id>/findings.yaml` if a prior run exists | Powers the `change_narrative` block. The prior run is the most recent run dir whose `intent.yaml` has the same `user_concern` slug. If none exists, omit `change_narrative` entirely. |

You MAY also read fact-prefixed findings (`fact-application-name::*`, `fact-language-dependencies::*`, etc.) to populate `briefing.project_tags`. Do NOT read external URLs — see [Trust rules](#trust-rules) below.

---

## Output

A single file at `<memory-dir>/runs/<run-id>/enrichment.yaml`. UTF-8, LF line endings, `version: 1`.

Follow [`enrichment-schema.md`](enrichment-schema.md) exactly. **Do not invent new top-level keys** — anything outside the whitelist (`version`, `intent_slug`, `generated_at`, `generated_by`, `model_hint`, `briefing`, `headlines`, `change_narrative`, `themes`, `findings`, `risks`, `cost_estimate`, `next_steps`) is dropped by the loader with a warning. Do not move fields between blocks.

The renamed fields (must match the template, do NOT use the old names):

| Block | Field | Used to be called | Do not write |
|-------|-------|-------------------|--------------|
| `headlines[]` | `body` | `one_liner` | `one_liner:` |
| `change_narrative` | `summary` | `paragraph` | `paragraph:` (this name is reserved for `briefing`) |
| `next_steps[]` | `body` | `rationale` | `rationale:` |

---

## Workflow

1. **Read the schema and the inputs** listed above. Build a mental index of: total findings, severity distribution, sources (`cve-known-vulnerabilities`, `cwe-*`, `appcat::*`, `fact-*`), and which findings are new this run (`first_seen_run == <run-id>`).

2. **Draft `briefing.paragraph`**. 2–6 sentences, ≥ 200 characters. Must weave in concrete numbers from your index. Lead with the most user-relevant fact for the run's `intent.user_concern`. End with the trend (improving / steady / regressing) if a prior run exists.

3. **Pick `briefing.project_tags`**. 3–6 short labels derived from `fact-*` findings (stack, runtime, build tool, container, deploy target). These also work as facet chips in the UI, so prefer canonical labels users would think to filter by.

4. **Write `headlines`**. 3–5 cards. Each one is a one-line "thing the busy reader needs to see". Use these kinds in order of priority:
   - `critical-risk` — open critical findings (CVE, exposed secret, etc.)
   - `warning` — high-severity items or new regressions
   - `effort` — total effort estimates for a theme (e.g. "Cloud migration: ~18 story points")
   - `trend` — meaningful cross-run movements (e.g. EOL deadlines crossing)
   - `opportunity` — quick wins
   - `positive` — celebrate clean areas (only if genuinely true)

   Field reminder: subtitle is **`body`**, not `one_liner`. Every headline SHOULD have a `jump_to` (to a finding or theme) unless it's purely informational. The jump target MUST resolve.

5. **Write `change_narrative`** (skip if no prior run). Compare prior `findings.yaml` to current. Categorize highlights as `added` / `resolved` / `escalated` / `regressed`. The paragraph field is **`summary`**, not `paragraph`. Reference real finding IDs.

6. **Propose `themes`**. Group the findings the way a human consultant would. Suggested canonical slugs for cross-run stability:
   - `security` — CVE + CWE
   - `cloud-readiness` — `appcat::*` and any explicit cloud-migration findings
   - `code-quality` — non-security CWE, performance, maintainability
   - `inventory` — `fact-*` informational findings
   - `architecture` — protocol / structure issues
   - `configuration` — env vars, service definitions, ports

   You may add domain-specific themes (`payments`, `data-platform`) if the project has clearly distinct subsystems. **A finding ID may appear in at most one theme.** Findings you don't assign go into a synthetic `other` bucket — that's fine for a few outliers, but the validator fails the run if `other` holds more than 50% of findings.

7. **For each finding**, write a `findings[]` entry. Skip suppressed findings unless the user has explicitly asked for them. **The validator requires ≥ 60% of high+critical findings to have a non-empty `why_it_matters`.** For each one in scope:
   - `why_it_matters` — 1–3 sentences answering "if a senior engineer skim-reads, what should land?". Do NOT restate severity, file path, or CVE ID. Those appear elsewhere on the card.
   - `what_to_do` — concrete first action. Imperative voice. Reference team preferences when relevant (e.g. "Switch to **Azure Files**" if `preferences.target_platform == azure-container-apps`).
   - `tags` — 2–5 facet chips. Encouraged kebab-case; conventions: `internet-exposed`, `patch-available`, `low-effort`, `eol-soon`, `regression`, `secret-leak`.
   - `related_findings[]` — group by `reason` (`same_root_cause` / `same_file` / `co_fix` / `same_owner`). Only emit a group if there is a substantive relationship; do NOT pad.
   - `related_knowledge[]` — one or two blocks when you can give actionable upgrade-path detail. Each block has `title`, optional `body`, `steps[]`, and `references[]`. **All references default to `verified: false`** — see [Trust rules](#trust-rules).
   - `quick_actions[]` — minimum: a `plan` action with a complete prompt for `create-modernization-plan`. Add `plan-with-related` when `related_findings[]` is non-empty. Add `suppress` only when the finding is plausibly acceptable risk (never for criticals).

8. **Write `risks` (optional but encouraged for migration intents)**. Cross-cutting risks that don't belong to any single finding — data migration windows, third-party SLAs, operational unknowns. Each entry needs `id`, `title`, `severity` (`critical`/`high`/`medium`/`low`/`info`), `body`, and optionally `mitigation` and `finding_ids[]`. Aim for 3–8 risks on a migration-style intent; omit the whole block if you have nothing genuinely cross-cutting to say (don't pad).

9. **Write `cost_estimate` (optional but encouraged for cloud-readiness intents)**. Coarse effort + monthly run cost:
   - `effort_person_days: {low, high}` — total project effort in person-days.
   - `monthly_run_cost: {currency, low, high}` — recurring cloud spend at the **modest workload profile** you saw in `findings.yaml`. State assumptions in `notes`.
   - `breakdown[]` — line-itemized monthly cost. Each item: `item` (service name + sizing), `monthly` (free-form string like `"30–80"` or `"~50"` or `"included"`), optional `note`.
   - `notes` — caveats about assumptions, scope sensitivity, premium-tier needs.

10. **Write `next_steps`**. 1–3 cards. Kinds: `plan-now` (for `critical`), `plan-soon` (for clusters of `high`/`medium`), `monitor` (for areas to watch), `celebrate` (only when run is truly clean). The card body field is **`body`**, not `rationale`. Each card with `target_skill: create-modernization-plan` MUST include a complete `prompt` the user can paste into chat.

11. **Self-check** before writing the file (see [Quality bar](#quality-bar)).

12. **Write the file**. Use YAML literal block scalars (`|`) for multi-line strings — the generator preprocesses them. Do not embed HTML. Do not embed code fences inside `paragraph` / `summary` / `body` / `why_it_matters` / `what_to_do`.

13. **Run the validator.** Execute:

    ```pwsh
    node .github/modernize/.runtime/assessment/assess-cli.mjs validate-enrichment `
        --memory-dir <memory-dir> `
        --run-id <run-id>
    ```

    If the exit code is `0`, proceed to Step 6. If it is non-zero, read the failure list, revise `enrichment.yaml`, and re-run. **Do not call `generate-report` until the validator passes.**

14. **Stop.** Do not modify `findings.yaml`, `suppressions.yaml`, or any other memory file. Do not re-run skills. The enrichment step is read-only against memory.

---

## Authoring rules

These are the [design rules from the schema](enrichment-schema.md#design-rules), restated as instructions for you:

1. **Structure converges, content diverges.** Two valid runs may produce very different prose for the same findings. Don't try to match a prior run's wording; do try to match its `themes[].id` slugs so the user's saved filters keep working.

2. **Never re-state mechanical facts.** The card already displays severity badges, finding IDs, file paths, line numbers, CVE numbers, source skill, "new this run" flags. Saying any of these inside `why_it_matters` wastes the user's attention. Write what they CAN'T see from the badges.

3. **Everything references existing finding IDs.** Before writing any `id`, `finding_ids`, or `jump_to.id`, confirm the ID appears in your index. The generator drops unresolved references and surfaces them as warnings — keep the warning list empty.

4. **Plain Markdown subset only.** Paragraphs, `**bold**`, `* bullet`, `` `code` ``, `[label](url)`. No raw HTML. No tables. No fenced code blocks. Newlines inside `|` block scalars become paragraph breaks at the blank line.

5. **Numbers come from you, not from the generator.** When `briefing.paragraph` says "12 cloud-readiness gaps", count them yourself from `findings.yaml`. The generator does not rewrite prose to insert numbers.

6. **No invented keys.** If a piece of content does not fit the schema, leave it out. Adding ad-hoc top-level keys (e.g. `recommended_target:`, `summary_table:`) produces warnings and is silently dropped — your work disappears from the report.

---

## Trust rules

External URLs you put in `related_knowledge[].references[]` are **advisory by default**. You did not fetch them in this turn, so you cannot guarantee they resolve to the content you claim. The template marks every `verified: false` reference with an "AI-suggested · verify" caption so the user owns the trust decision.

Set `verified: true` ONLY if you actually fetched the URL in this turn and confirmed:

1. It returns HTTP 200.
2. The content matches your claim about it (e.g. it really is the Log4Shell advisory, not a parked domain).

When in doubt, leave `verified: false`. False positives on `verified: true` erode user trust in every future report. False negatives only cost the user a few seconds of skepticism.

---

## Section-by-section guidance

### `briefing.paragraph`

Good: weaves intent + scope + verdict + trend.

> "This Spring Boot 2.7 order service has 12 open findings against a cloud-readiness scan. The headline risk is Log4Shell in `pom.xml` — internet-exploitable today and the patch is a one-line bump. Cloud-migration effort is moderate (~18 story points), mostly file-system and messaging rewrites. Since the last scan a week ago, you fixed 3 issues and introduced 2 new mediums — overall trend is improving."

Bad (re-states mechanical facts the cards already show):

> ~~"There are 12 findings. 1 is critical. 2 are high. 5 are medium. 2 are low. 2 are info. The critical is `cve-known-vulnerabilities::a3f2c19b8e1d`."~~

### `headlines[].title` / `headlines[].body`

Short imperative or assertive sentence. ≤ 60 characters when possible. Headlines stack on small screens so brevity matters. The subtitle field is **`body`** — `one_liner` is rejected by the schema.

Good: `"Log4Shell is live in production today"`, `"Cloud migration: ~18 story points across 3 rewrites"`
Bad: `"There are some security issues that need attention soon"`

### `change_narrative.summary`

The narrative paragraph field is **`summary`** (so it does not collide with `briefing.paragraph`). 2–4 sentences. Reference real finding IDs in `highlights[].finding_ids`.

### `themes[].summary`

2–4 sentences. Tells the user **what this group is and why it matters as a group** — not a recap of individual findings. Helps the user decide whether to expand or skip the section.

### `findings[].why_it_matters`

Write the "if I had 15 seconds to explain this to the on-call engineer, what would I say?" version. Lead with the consequence ("Log4Shell allows remote code execution from a single HTTP request"), follow with the specific reason it applies here ("…and this service exposes a public HTTPS endpoint"), and only add nuance if it changes the prioritization.

### `findings[].what_to_do`

The smallest concrete next step. If a real fix needs a discovery phase, say so explicitly (`"First, run … to enumerate all affected files"`) instead of waving with "investigate".

### `related_findings[]`

Use `reason` precisely:

- `same_root_cause` — fixing one almost certainly fixes the others (e.g. all CVEs in the logging stack).
- `same_file` — same file, different issues; co-fix saves a review round.
- `co_fix` — different root causes but practical to bundle (e.g. all SimpleDateFormat → DateTimeFormatter rewrites).
- `same_owner` — same team / module, useful for sprint planning.

Skip the group entirely if none of these fit; a forced relationship is noise.

### `risks[]`

A risk belongs here (not in `findings[]`) when it is **operational, cross-cutting, or contingent on the rollout plan rather than the code itself**. Typical examples for a cloud-migration run:

- "Cutover window for blob + database migration"
- "Cold-start latency on scale-to-zero plans"
- "Quota / regional availability for the chosen Azure tier"
- "Vendor lock-in or pricing surprise on managed services"
- "Skill gap on the receiving team"

Each entry needs a stable `id` (e.g. `r1`, `r2`, …; used as the DOM anchor `#risk-<id>`), a `title`, a `severity`, a 1–4 sentence `body`. Add `mitigation` whenever you can name a concrete countermeasure. Link to specific findings via `finding_ids[]` only when there is a direct mechanical relationship — don't list every finding in the theme.

### `cost_estimate`

Useful on cloud-readiness, containerization, and upgrade intents. Skip for pure code-quality or security-only runs. Keep numbers conservative and **always state assumptions in `notes`**: the modest workload profile, single-region deployment, whether managed-identity/Key Vault are in or out, etc. The `breakdown[].monthly` field is a **string** so you can write `"30–80"` or `"~50"` or `"included"` without forcing a fake precision.

### `quick_actions[].prompt`

Treat this as the literal text the user will paste into chat. It should be self-contained — assume the chat has no memory of the assess run. Mention the target finding ID(s) and the goal.

Good:

```
Plan a hotfix that bumps log4j-core from 2.14.1 to the latest 2.17.x in
pom.xml, runs the full test suite, and prepares a backportable PR.
Target finding: cve-known-vulnerabilities::a3f2c19b8e1d.
```

Bad (won't make sense out of context):

```
Plan this fix.
```

### `next_steps[].prompt` and `next_steps[].body`

Same rule as `quick_actions[].prompt`: the user pastes the prompt directly. The card body field is **`body`** (not `rationale`). For `kind: plan-now` and `kind: plan-soon`, also set `target_skill: create-modernization-plan` so the UX hints at the intended landing skill.

---

## Quality bar (self-check before saving)

Before writing the file, walk this checklist. If any answer is "no", fix and re-check.

- [ ] Did you `read_file` `references/enrichment-schema.md` this turn?
- [ ] Does every `finding_ids`, `id`, and `jump_to.id` resolve to an actual entry in `findings.yaml`?
- [ ] Does any string anywhere repeat the finding's severity, state, location, or CVE/CWE ID? (It shouldn't.)
- [ ] Does `briefing.paragraph` include at least one specific number (count, story points, or date) and contain at least 200 characters?
- [ ] Are `headlines[]` between 3 and 5 entries, with `body` (not `one_liner`)?
- [ ] Does `change_narrative` use `summary` (not `paragraph`)?
- [ ] Do `themes[]` partition (or near-partition) the findings, with the residue ≤ 50% in the `other` bucket?
- [ ] Do ≥ 60% of high+critical findings have a non-empty `why_it_matters`?
- [ ] Is every `related_knowledge[].references[].verified` set to `false` unless you actually fetched the URL this turn?
- [ ] Does at least one `quick_actions[]` entry per finding have a prompt the user could paste into chat without further editing?
- [ ] Are all `next_steps[]` entries mappings (not plain strings) with `body` (not `rationale`)?
- [ ] Are all multi-line strings using `|` block scalars (not `>` folded scalars)?
- [ ] Is the top-level `version` set to `1` and `intent_slug` echoed from `intent.yaml`?
- [ ] Are all top-level keys in the schema whitelist? (No `recommended_target:`, no `summary_table:`, no ad-hoc keys.)
- [ ] **After saving:** Did `validate-enrichment` exit `0`?

---

## Worked example

For a Spring Boot 2.7 + AWS service migrating to Azure Container Apps (intent slug `cloud-readiness`), with 1 critical Log4j CVE, 1 medium AppCAT file-system gap, and 1 medium AppCAT S3 gap, a complete valid enrichment looks like:

```yaml
version: 1
generated_at: 2026-05-20T14:22:11Z
generated_by: copilot-chat
intent_slug: cloud-readiness

briefing:
  paragraph: |
    This Spring Boot 2.7 service has 3 open findings against the cloud-readiness
    scan: a critical Log4j CVE that is internet-exploitable today, plus a file-
    system access pattern and an AWS S3 dependency that will not survive
    containerization on Azure. The CVE is a one-line dependency bump; the AWS
    rewrites are roughly half a sprint of focused work.
  project_tags:
    - "Spring Boot 2.7"
    - "Java 17"
    - "Maven"
    - "Tomcat 9"

headlines:
  - kind: critical-risk
    title: "Log4Shell is live in production today"
    body: "Patch is a one-line dependency bump; fix before any other work."
    jump_to:
      kind: finding
      id: cve-known-vulnerabilities::a3f2c19b8e1d
  - kind: effort
    title: "Cloud migration: 2 AWS rewrites (~5–8 person-days)"
    body: "File-system → Azure Files; AWS S3 → Azure Blob."
    jump_to:
      kind: theme
      id: cloud-readiness
  - kind: opportunity
    title: "Azure Container Apps is a clean target for this workload"
    body: "Scale-to-zero keeps the bill in the $150–400/month band."

themes:
  - id: security
    label: "Security risks"
    summary: |
      One critical Log4j CVE in `pom.xml`. Internet-exploitable; patch available.
    finding_ids:
      - cve-known-vulnerabilities::a3f2c19b8e1d
  - id: cloud-readiness
    label: "Cloud readiness gaps"
    summary: |
      Two AWS-coupled access patterns that block a clean Azure Container Apps
      target: local-filesystem writes (no persistent disk in ACA) and AWS S3
      SDK usage that should move to Azure Blob.
    finding_ids:
      - appcat::file-system::4f8a01
      - appcat::aws-s3::7b2c03

findings:
  - id: cve-known-vulnerabilities::a3f2c19b8e1d
    why_it_matters: |
      The vulnerable line of the Log4Shell family. Because this service exposes
      a public HTTPS endpoint, any request carrying a crafted JNDI lookup string
      can trigger remote code execution.
    what_to_do: |
      Bump `log4j-core` to **2.17.2** or later in `pom.xml`. Then run
      `mvn dependency:tree | grep log4j` to verify no transitive dependency
      pulls in an older version.
    tags: ["internet-exposed", "patch-available", "low-effort"]
    quick_actions:
      - kind: plan
        label: "Plan a fix"
        prompt: |
          Upgrade log4j-core from 2.14.1 to the latest 2.17.x in pom.xml, run
          the full test suite, and prepare a hotfix PR.
          Target finding: cve-known-vulnerabilities::a3f2c19b8e1d.
  - id: appcat::aws-s3::7b2c03
    why_it_matters: |
      The `S3Client` calls in `ReportExporter` are the only thing standing
      between this service and a clean Azure-native deployment.
    what_to_do: |
      Replace `S3Client` with `BlobContainerClient` from `azure-storage-blob`
      and back the container with Azure Blob Storage (Hot tier). Use
      managed-identity authentication; do not introduce a connection string.
    tags: ["aws", "azure-blob"]

risks:
  - id: r1
    title: "Data migration window (S3 → Blob)"
    severity: medium
    body: |
      A live cutover from AWS S3 to Azure Blob needs a coordinated window.
      Reads/writes during the sync gap may be lost unless double-writing is
      implemented first.
    mitigation: |
      Use **AzCopy** for an incremental S3 → Blob sync. Reserve a 30-minute
      cutover window during low traffic; double-write S3 puts for the prior
      48 hours to drain queues.
    finding_ids:
      - appcat::aws-s3::7b2c03
  - id: r2
    title: "Cold-start latency on scale-to-zero plans"
    severity: low
    body: |
      Azure Container Apps scales to zero when idle. The first request after
      idle pays a ~2–5 s JVM warm-up. Public endpoints with strict SLOs may
      need a min-replicas floor.
    mitigation: |
      Set `minReplicas: 1` on customer-facing apps; leave background workers
      at `minReplicas: 0`.

cost_estimate:
  effort_person_days:
    low: 5
    high: 8
  monthly_run_cost:
    currency: USD
    low: 150
    high: 400
  breakdown:
    - item: "Azure Container Apps (2 apps, 0.5 vCPU × 1–3 replicas)"
      monthly: "30–80"
      note: "Scales to zero when idle"
    - item: "Azure Blob Storage (Hot, 100 GB + egress)"
      monthly: "20–50"
    - item: "Log Analytics + Application Insights"
      monthly: "20–80"
    - item: "Key Vault + Container Registry"
      monthly: "10–30"
  notes: |
    Assumes the modest workload profile we saw in `findings.yaml` (≤ 100 RPM
    sustained). Production traffic would push monthly cost toward the upper
    bound and may require Premium tiers for PostgreSQL (zone redundancy).

next_steps:
  - kind: plan-now
    title: "Patch the Log4j CVE today"
    body: |
      It's internet-exploitable and the fix is a one-line dependency bump.
    effort_hint: "≤ 1 day"
    prompt: |
      Upgrade log4j-core from 2.14.1 to the latest 2.17.x in pom.xml, run the
      full test suite, and prepare a hotfix PR.
    target_skill: create-modernization-plan
  - kind: plan-soon
    title: "Plan the AWS → Azure rewrites"
    body: "Two findings, ~5–8 person-days; schedule as one focused work stream."
    effort_hint: "~1 sprint"
    prompt: |
      Plan a migration from local filesystem and AWS S3 usage to Azure Files /
      Azure Blob, suitable for an Azure Container Apps target.
    target_skill: create-modernization-plan
```

Saving the file then running `validate-enrichment` against it must print `PASS` and exit `0`. Only then does Step 6 (report generation) proceed.
