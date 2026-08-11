# Enrichment Schema — `runs/<run-id>/enrichment.yaml`

> **Purpose**: Holds the **AI-authored narrative layer** of an assess run — the briefing, headlines, themes, per-finding "why it matters" / "what to do", risks, cost estimate, and next steps. Turns the report from a row dump into something that reads like a consultant wrote it.
>
> **Why a separate file?** [`findings.yaml`](memory-schema.md#findingsyaml) is the **fact layer** (machine-extracted, git-diffable, identity-stable). Enrichment is the **narrative layer** (AI-authored, free-form, can be regenerated at will). Keeping them apart means:
>
> 1. Re-writing enrichment never churns finding IDs or state.
> 2. The report renders cleanly without enrichment — it degrades to the raw data view.
> 3. Different models / agents / humans can produce different enrichments for the same findings without conflict.
>
> **Owner**: This spec is **authoritative**. The producer is [`enrichment-prompt.md`](enrichment-prompt.md) (executed by the agent in Step 5.5 of [`../SKILL.md`](../SKILL.md)). The consumer is [`../scripts/assess-report.mjs`](../scripts/assess-report.mjs). The Node `validate-enrichment` command gates Step 6 and enforces this schema literally.

---

## Design rules

1. **Structure converges, content diverges.** The schema is strict; the prose is free. Two agents may write very different briefings from the same findings and both are correct.
2. **Never re-state mechanical facts.** Enrichment does NOT carry CVE IDs, file paths, line numbers, severity, or state. Those live in `findings.yaml` and are merged at render time.
3. **Everything references existing finding IDs.** Any `id` or `finding_ids` value MUST resolve in `findings.yaml`. Unresolvable references are dropped at render time with a warning — they do not break the report.
4. **All free text is plain Markdown.** A small subset is rendered: paragraphs, `**bold**`, `* bullet`, `` `code` ``, `[text](url)`. No HTML, no tables, no code fences.
5. **External URLs are advisory.** The generator does NOT validate them. The template tags `verified: false` references with a small "AI-suggested · verify" caption so the user owns the trust decision.
6. **No unknown top-level keys.** The generator warns on any key outside the whitelist below. If you have content that doesn't fit, propose a schema change first — do NOT invent ad-hoc keys (they will be silently dropped).

---

## Top-level shape

```yaml
version: 1                               # REQUIRED — only 1 is supported today
intent_slug: cloud-readiness             # REQUIRED — echo of runs/<id>/intent.user_concern slug
generated_at: 2026-05-20T14:22:11Z       # ISO-8601 UTC
generated_by: copilot-chat               # free-form trace tag
model_hint: claude-opus-4.7              # optional; for debugging only

briefing:         { ... }                # § 1
headlines:        [ ... ]                # § 2
change_narrative: { ... }                # § 3 — OPTIONAL (omit on first run)
themes:           [ ... ]                # § 5 grouping
findings:         [ ... ]                # per-finding narrative (same IDs as findings.yaml)
risks:            [ ... ]                # § 6 cross-cutting risks (optional but encouraged)
cost_estimate:    { ... }                # § 7 effort + monthly run cost (optional but encouraged)
next_steps:       [ ... ]                # § 8 action cards
```

**Whitelist of top-level keys**: `version`, `intent_slug`, `generated_at`, `generated_by`, `model_hint`, `briefing`, `headlines`, `change_narrative`, `themes`, `findings`, `risks`, `cost_estimate`, `next_steps`. Anything else is dropped with a warning.

The seven content blocks (`briefing` through `next_steps`) are **all optional**. The renderer fills the gap with a degraded view when any is missing. See [Degraded rendering](#degraded-rendering).

---

## `briefing`

The 2–6 sentence opening paragraph + project-level chips. Renders at the very top of the report.

```yaml
briefing:
  paragraph: |
    This is a Spring Boot 2.7 service with 12 open findings against the cloud-readiness scan.
    The headline risk is a critical Log4j CVE that is internet-exploitable today — patch path
    is a one-line dependency bump. Cloud-migration effort is moderate (~18 story points),
    dominated by file-system and messaging rewrites. Since the last scan you fixed 3 issues
    and introduced 2 new mediums — overall trend is improving.
  project_tags:                          # chips shown next to the paragraph
    - "Spring Boot 2.7"
    - "Java 17"
    - "Maven"
    - "Tomcat 9"
```

| Field | Required | Notes |
|-------|----------|-------|
| `paragraph` | yes (if `briefing` exists) | 2–6 sentences. Plain Markdown subset. SHOULD weave in concrete numbers from `findings.yaml`. |
| `project_tags` | no | 3–6 short labels derived from `fact-*` findings. Also act as facet chips: clicking filters the report. |

---

## `headlines`

3–5 cards that act as a "table of contents for busy people". Each card opens directly into the relevant theme or finding.

```yaml
headlines:
  - kind: critical-risk                  # critical-risk | warning | effort | trend | opportunity | positive
    title: "Log4Shell is live in production today"
    body: "log4j-core 2.14.1 in pom.xml — internet-exploitable, one-line fix"
    jump_to:
      kind: finding                      # finding | theme
      id: cve-known-vulnerabilities::a3f2c19b8e1d
  - kind: effort
    title: "Cloud migration: ~18 story points across 3 rewrites"
    body: "File-system, AWS S3 and RabbitMQ all need Azure-native replacements"
    jump_to:
      kind: theme
      id: cloud-readiness
  - kind: positive
    title: "Code quality has improved since last run"
    body: "3 medium injection findings resolved; 0 regressions"
    jump_to: null                        # purely informational, no jump
```

| Field | Required | Notes |
|-------|----------|-------|
| `kind` | yes | One of: `critical-risk`, `warning`, `effort`, `trend`, `opportunity`, `positive`. Drives the accent color of the dot. |
| `title` | yes | ≤ 60 characters preferred. Imperative or assertive sentence. |
| `body` | no | One-line subtitle. Used to be called `one_liner`; the field is now `body` to match every other card type. |
| `jump_to` | no | `{kind: "finding"\|"theme", id: <existing-id>}`. Unresolvable IDs are cleared with a warning; the card stays but becomes non-clickable. |

**Hard constraints**: `3 ≤ len(headlines) ≤ 5`. Outside this range the validator (Step 5.5) fails the run.

---

## `change_narrative` (optional)

Cross-run diff in narrative form. The agent emits this only when a prior run with the same `intent_slug` exists.

```yaml
change_narrative:
  baseline_run_id: 2026-05-13T10-42-11Z  # echo of what was compared against
  summary: |
    Since the last cloud-readiness scan a week ago, you resolved 3 medium findings (all
    SQL-injection in the order subsystem) and fixed 1 high file-handle leak. Two new mediums
    appeared in the new payment module — both are AWS S3 usage that needs to migrate to
    Azure Blob before the next deployment.
  highlights:
    - kind: resolved                     # added | resolved | escalated | regressed | unchanged-critical
      title: "3 SQL-injection findings closed"
      body: "All in the order subsystem; planned work landed on schedule"
      finding_ids:
        - cwe-injection-attacks::aa11bb
        - cwe-injection-attacks::cc22dd
        - cwe-injection-attacks::ee33ff
    - kind: added
      title: "2 new S3 usages in the payment module"
      body: "Surfaced after the payment refactor merged on 2026-05-17"
      finding_ids:
        - appcat::aws-s3::1234ab
        - appcat::aws-s3::5678cd
```

| Field | Required | Notes |
|-------|----------|-------|
| `baseline_run_id` | yes (if block present) | The run ID being compared against. Shown in the section heading verbatim. |
| `summary` | yes (if block present) | One-paragraph narrative of the delta. |
| `highlights[].kind` | yes per item | One of: `added`, `resolved`, `escalated`, `regressed`, `unchanged-critical`. |
| `highlights[].title` | yes per item | Short headline for the row. |
| `highlights[].body` | no | Optional one-liner subtitle. |
| `highlights[].finding_ids` | no | Refs to findings. Clicking the row filters the page to these IDs. Unresolvable IDs are dropped. |

Omit the whole block on first run. `kind: unchanged-critical` is reserved for "this critical was open last run and is still open" — surfaces unfinished business.

---

## `themes`

The agent's grouping proposal for the findings list. Replaces severity sorting with a narrative-friendly structure.

```yaml
themes:
  - id: security                         # short slug, unique within this file
    label: "Security risks"
    summary: |
      Two open security risks: a critical Log4j CVE (patch available) and a medium SQL-injection
      in the order subsystem. Both have low-effort fixes.
    finding_ids:                         # ordered: the agent's preferred reading order
      - cve-known-vulnerabilities::a3f2c19b8e1d
      - cwe-injection-attacks::aa11bb
  - id: cloud-readiness
    label: "Cloud readiness gaps"
    summary: |
      Twelve findings, dominated by file-system access patterns that don't survive a containerized
      environment. Azure Files is the natural target.
    finding_ids: [...]
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Short slug, unique within this file. Used as URL hash target `#theme-<id>`. Canonical slugs: `security`, `cloud-readiness`, `code-quality`, `inventory`, `architecture`, `configuration`. |
| `label` | yes | Human-readable section heading. |
| `summary` | no | 2–4 sentences. What this group is and why it matters as a group. |
| `finding_ids` | yes | Non-empty list. Unresolvable IDs are dropped; a theme that ends up empty is dropped entirely with a warning. |

**Rules**:
- A finding ID MAY appear in at most one theme. The generator de-duplicates and warns.
- Findings present in `findings.yaml` but **not** assigned to any theme are auto-bucketed into a synthetic theme with `id: other`, `label: "Other findings"`, `auto_bucketed: true`. This is normal but the validator counts a large `other` bucket against the run.

---

## `findings`

Per-finding narrative. Every entry corresponds to a finding in `findings.yaml` by `id`.

```yaml
findings:
  - id: cve-known-vulnerabilities::a3f2c19b8e1d
    why_it_matters: |
      Log4j 2.14.1 in `pom.xml` is the vulnerable line of the Log4Shell family. Because this
      service exposes an HTTP endpoint, any request containing a crafted JNDI lookup string
      can trigger remote code execution — scanners on the public internet hit this pattern
      continuously.
    what_to_do: |
      Bump `log4j-core` to **2.17.2** or later in `pom.xml`. Then run
      `mvn dependency:tree | grep log4j` to verify no transitive dependency pulls in an
      older version.
    tags:                                # facet chips on the card
      - "internet-exposed"
      - "patch-available"
      - "low-effort"
    related_findings:
      - reason: same_root_cause          # same_root_cause | same_file | co_fix | same_owner
        reason_label: "All Maven dependencies on the old logging stack"
        finding_ids:
          - cve-known-vulnerabilities::beef01
          - cve-known-vulnerabilities::cafe02
    related_knowledge:                   # right-drawer content
      - title: "Log4j 2.17 upgrade for Spring Boot 2.7"
        body: |
          Spring Boot 2.7 manages `log4j-core` via the `spring-boot-dependencies` BOM.
          Override the version by setting the `log4j2.version` property, not by adding a
          direct dependency — that survives BOM resolution.
        steps:
          - "Add `<log4j2.version>2.17.2</log4j2.version>` to `<properties>`"
          - "Run `mvn -U clean verify` to invalidate cached BOM"
          - "Verify with `mvn dependency:tree | grep log4j`"
        references:
          - url: "https://logging.apache.org/log4j/2.x/security.html"
            title: "Apache Log4j Security Vulnerabilities"
            verified: false              # NOT verified by the generator
    quick_actions:                       # chips at the bottom of the card
      - kind: plan                       # plan | plan-with-related | suppress | explain | open-file
        label: "Plan a fix"
        prompt: |
          Upgrade log4j-core from 2.14.1 to the latest 2.17.x in pom.xml and verify with
          mvn dependency:tree.
      - kind: plan-with-related
        label: "Plan with 2 related"
        prompt: |
          Audit and upgrade all logging-stack dependencies (log4j-core, log4j-api,
          slf4j-log4j12) to versions immune to Log4Shell.
      - kind: suppress
        label: "Suppress if internal-only"
        rationale: "This service is internet-facing per the briefing — suppression is not recommended unless that changes."
```

**All fields except `id` are optional.** A finding with only `id` (no `why_it_matters` etc.) renders to the raw card view, same as if enrichment were missing entirely.

### Field reference

| Field | Purpose | Notes |
|-------|---------|-------|
| `id` | Join key to `findings.yaml` | Required. Unresolvable entries are dropped + logged. |
| `why_it_matters` | Card body, first paragraph | Plain Markdown subset. SHOULD NOT repeat the title or severity. |
| `what_to_do` | Card body, second paragraph | Imperative voice. Avoid "you should consider". |
| `tags` | Facet chips | Free strings; kebab-case, ≤ 24 chars preferred. |
| `related_findings[].reason` | Why these are related | Enum: `same_root_cause` \| `same_file` \| `co_fix` \| `same_owner`. |
| `related_findings[].reason_label` | Human label | Shown next to the related-count chip. |
| `related_findings[].finding_ids` | Refs to other findings | Unresolvable IDs dropped silently. |
| `related_knowledge[].title` | Drawer card title | Required if the knowledge entry exists. |
| `related_knowledge[].body` | Drawer body paragraph | Plain Markdown subset, ≤ ~800 chars. |
| `related_knowledge[].steps` | Drawer numbered list | Plain strings, ≤ 8 entries. |
| `related_knowledge[].references[].url` | External doc link | URLs are advisory; see rule 5. |
| `related_knowledge[].references[].title` | Link label | Free string. |
| `related_knowledge[].references[].verified` | Whether the URL was fetched + confirmed | Default `false`. Set `true` ONLY after actually fetching this turn. |
| `quick_actions[].kind` | Behavior class | Enum: `plan` \| `plan-with-related` \| `suppress` \| `explain` \| `open-file`. |
| `quick_actions[].label` | Button text | Short imperative phrase. |
| `quick_actions[].prompt` | What gets copied | Self-contained prompt the user can paste into chat. |
| `quick_actions[].rationale` | Tooltip on the chip | Used to soften aggressive suggestions. |

---

## `risks` (optional, encouraged for cloud-readiness / upgrade intents)

Cross-cutting risks that don't belong to any single finding — data-migration windows, third-party SLAs, operational unknowns, etc. Rendered as a dedicated section between themes and next steps.

```yaml
risks:
  - id: r1                               # stable within this file (used as DOM id)
    title: "Data migration window (S3 → Blob, PG → Azure PG)"
    severity: medium                     # critical | high | medium | low | info
    body: |
      A live cutover from AWS S3 + on-prem PostgreSQL to Azure equivalents needs a
      coordinated window. Reads/writes during the sync gap may be lost unless
      double-writing is implemented first.
    mitigation: |
      Use **AzCopy** for an incremental S3 → Blob sync, and **Azure DMS** for an
      online PostgreSQL migration. Reserve a 30-minute cutover window during low
      traffic; double-write S3 puts for the prior 48 hours to drain queues.
    finding_ids:                         # optional — links the risk to specific findings
      - appcat::aws-s3::1234ab
      - appcat::postgresql::5678cd
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Stable within this file. Used as the DOM anchor (`#risk-<id>`). |
| `title` | yes | One-line headline. |
| `severity` | yes | Drives the accent color of the card border. |
| `body` | yes | 1–4 sentences describing the risk. |
| `mitigation` | no | 1–4 sentences describing the mitigation plan. |
| `finding_ids` | no | Optional list of related findings. Unresolvable IDs are dropped. |

3–8 risks recommended for migration-style intents; omit the whole section if there is nothing genuinely cross-cutting to say (don't pad).

---

## `cost_estimate` (optional, encouraged for cloud-readiness intents)

A coarse effort + monthly run-cost estimate. Rendered as a small panel between risks and next steps.

```yaml
cost_estimate:
  effort_person_days:
    low: 5
    high: 8
  monthly_run_cost:
    currency: USD
    low: 150
    high: 400
  breakdown:                             # optional — line-itemized monthly cost
    - item: "Azure Container Apps (2 apps, 0.5 vCPU × 1–3 replicas)"
      monthly: "30–80"
      note: "Scales to zero when idle"
    - item: "Azure Database for PostgreSQL Flexible (B2s, 32 GB)"
      monthly: "50–120"
    - item: "Azure Service Bus (Standard)"
      monthly: "10–30"
    - item: "Azure Blob Storage (Hot, 100 GB + egress)"
      monthly: "20–50"
    - item: "Log Analytics + Application Insights"
      monthly: "20–80"
    - item: "Key Vault + Container Registry"
      monthly: "10–30"
  notes: |
    Assumes the modest workload profile we saw in `findings.yaml`. Production traffic
    would push monthly cost toward the upper bound and may require Premium tiers for
    Service Bus (geo-replication) and PostgreSQL (zone redundancy).
```

| Field | Required | Notes |
|-------|----------|-------|
| `effort_person_days.low` / `.high` | yes (if block present) | Integer or decimal person-days range. |
| `monthly_run_cost.currency` | no | 3-letter ISO code. Defaults to `USD` if omitted. |
| `monthly_run_cost.low` / `.high` | yes (if block present) | Numbers. The renderer formats with the currency code. |
| `breakdown[].item` | yes per item | Service / cost-driver label. |
| `breakdown[].monthly` | yes per item | Free-form string (e.g. `"30–80"` or `"~50"` or `"included"`). Kept as a string so the agent can use ranges and notes. |
| `breakdown[].note` | no | Brief caveat (e.g. "scales to zero when idle"). |
| `notes` | no | Caveats about the estimate (assumptions, scope, sensitivity). |

Both `effort_person_days` and `monthly_run_cost` are independently optional — you can publish effort-only or cost-only.

---

## `next_steps`

Final action cards. 1–3 items recommended; the agent picks based on the overall verdict.

```yaml
next_steps:
  - kind: plan-now                       # plan-now | plan-soon | monitor | celebrate | defer
    title: "Patch the Log4j CVE today"
    body: |
      It's internet-exploitable, the fix is a one-line dependency bump, and downstream
      services depend on this one.
    effort_hint: "≤ 1 day"
    prompt: |
      Upgrade log4j-core from 2.14.1 to the latest 2.17.x in pom.xml, run the full test
      suite, and prepare a hotfix PR.
    target_skill: create-modernization-plan
  - kind: plan-soon
    title: "Plan the cloud-readiness rewrites"
    body: "12 findings, ~28 story points — schedule a focused sprint."
    effort_hint: "~1 sprint"
    prompt: |
      Plan a migration from local filesystem and AWS S3 usage to Azure Files / Azure Blob,
      suitable for an Azure Container Apps target.
    target_skill: create-modernization-plan
  - kind: monitor
    title: "Watch the new payment module"
    body: "Two regressions appeared there this run; worth a focused re-scan after the next deploy."
    effort_hint: null
    prompt: null                         # not all next-steps need a prompt
    target_skill: null
```

| Field | Required | Notes |
|-------|----------|-------|
| `kind` | yes | One of: `plan-now` (red), `plan-soon` (amber), `monitor` (gray), `celebrate` (green, clean runs), `defer` (gray). |
| `title` | yes | One-line action headline. |
| `body` | no | 1–3 sentences explaining the choice. Used to be called `rationale`; the field is now `body` to match every other card type. |
| `effort_hint` | no | Free-form string (e.g. `"≤ 1 day"`, `"~1 sprint"`). |
| `prompt` | no | Self-contained prompt for the user to paste into chat. Required when `target_skill` is set. |
| `target_skill` | no | Skill name that `prompt` is intended for. SHOULD be `create-modernization-plan` for `plan-now` / `plan-soon`. |

**Hard constraint**: every item MUST be a mapping (`{...}`). Flat strings are rejected by the validator. 1–3 items recommended.

---

## Degraded rendering

The report renders **any subset** of enrichment cleanly. The generator derives the tier from content; the agent does NOT declare it.

| Available | Tier | What the report shows |
|-----------|------|----------------------|
| `briefing` + `themes` + at least one `findings[]` entry | `ai-narrated` | Full experience: briefing, headlines, change narrative (if present), themed cards with why/what/related/knowledge, risks, cost estimate, next steps. Mode pill only — no banner. |
| `briefing` OR `themes` OR per-finding entries (any single one) | `partial` | Same skeleton but missing sections collapse, and per-finding cards fall back to raw `rationale` where `why_it_matters` is absent. Amber "Partial narrative" banner appears under § 0. |
| `enrichment.yaml` missing, empty, or only `version`/`intent_slug` | `raw` | Findings grouped by synthetic severity buckets (`Critical findings`, `High findings`, …). No briefing, no headlines, no themes summary, no risks, no cost, no next steps. Amber "Raw data view" banner appears under § 0. |

Independent of the tier:

- **`risks`** and **`cost_estimate`** are always rendered when present (even in `partial` mode); they have no effect on the tier classifier because they're orthogonal to the main narrative.
- **Unknown top-level keys** are dropped with one warning per key. The warnings appear in § 7 Appendix and (when count > 0) as an amber banner under § 0.
- **Invalid structures** (themes with no `id`, next_steps items that are strings instead of mappings, unresolvable `finding_ids`) are dropped with per-entry warnings.

The Node `validate-enrichment` command implemented in [`../scripts/assess-report.mjs`](../scripts/assess-report.mjs) fails the run when the predicted tier would be `partial` or `raw` — that's the hard contract that prevents low-quality reports from reaching the user.

---

## Validation contract

The validator script enforces the following rules. Each rule maps to a specific failure mode the assess skill has seen in the wild.

### Required structure

1. `version` is present and equal to `1`.
2. `intent_slug` is a non-empty string.
3. Every top-level key is in the whitelist above.

### Content thresholds (for `ai-narrated` tier)

4. `briefing.paragraph` is present and contains at least 200 characters.
5. `headlines` is a list of 3–5 entries; each has `kind` and `title`.
6. `themes` is a non-empty list; every entry has a non-empty string `id` and a non-empty `finding_ids` list.
7. Every finding in `findings.yaml` is assigned to exactly one theme (or auto-bucketed into `other`; the validator counts an `other` bucket > 50% of all findings as a failure).
8. `findings[]` per-finding entries cover ≥ 60% of all high+critical findings with a non-empty `why_it_matters`.
9. `next_steps` has 1–3 entries; every entry is a mapping with at least `kind` and `title`.

### Cross-reference integrity

10. Every `id` in `themes[]`, `findings[]`, `risks[]`, and every `finding_ids` list element resolves in `findings.yaml`.
11. `headlines[].jump_to.id` (when set) resolves to an existing finding ID or theme `id`.
12. No finding ID appears in more than one theme.

### Style

13. No top-level key outside the whitelist.
14. No `risks[]` entry without `id` + `title` + `severity` + `body`.
15. No `next_steps[]` entry that is a flat string instead of a mapping.

Failing any rule blocks Step 6 in [`../SKILL.md`](../SKILL.md). The agent revises and re-runs the validator until it passes (or explicitly opts the run into raw mode by passing `--enrichment NONE` to the report generator, which is rare and reserved for "no findings" runs).

---

## Versioning

Bump `version` whenever the schema makes a breaking change (renaming a field, removing a key, changing a type). The generator refuses to render any version it does not recognize and falls back to the raw view with a clear warning. Today the only supported version is `1`.
