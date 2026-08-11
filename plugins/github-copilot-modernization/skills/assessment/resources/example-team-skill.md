# Example Team Skill — `team-vendored-code-policy`

> **Purpose**: A complete, realistic example of an AI-curated team skill. Use this as a template when reviewing what `skill_curator` produces, or when hand-writing a team skill.

> **Where it lives**: `.github/modernize/.memory/skills/team/team-vendored-code-policy/SKILL.md` (path is the only place the AI is allowed to write skills — see [skill-curator.md](../references/skill-curator.md) hard boundary).

---

## The skill file

The block below is the **literal contents** of `SKILL.md` for a team-curated skill. Copy it as a template (replace placeholders) when adding new team skills by hand.

```markdown
---
name: team-vendored-code-policy
description: "Auto-suppress assessment findings in vendored / legacy paths the team doesn't own. Captures the team convention 'we don't fix vulnerabilities or upgrade code we vendored from upstream — we re-vendor on a schedule instead.'"
version: 1
metadata:
  modernize:
    created_by: ai
    created_at: 2026-05-13T11:08:44Z
    group: security-cve              # primary group; also applies to security-cwe and fact-* skills
    languages: [java, dotnet, jsts]
    source_findings:
      - cve-known-vulnerabilities::abc123def456
      - cve-known-vulnerabilities::789xyzqrs321
      - fact-environment-variables::1f2e3d4c5b6a
    source_runs:
      - 2026-05-11T08-00-00Z
      - 2026-05-12T09-30-00Z
      - 2026-05-13T11-08-44Z
    confidence: 0.82
    review_required_by: 2026-08-13   # +90 days
    state: active                    # active | deprecated
---

# Team Vendored-Code Policy

## Why this skill exists

Across three assessment runs, the team consistently suppressed findings in two
location patterns:

- `**/third-party-vendored/**` — upstream libraries we copy in periodically
- `**/deployment/legacy/**` — historical deployment scripts being phased out

Each suppression carried the same reasoning ("we re-vendor on a schedule" or
"slated for removal"). This skill consolidates those manual rules into a single
team-wide policy so individual contributors don't have to repeat the decision.

Provenance: see `metadata.modernize.source_findings` and `source_runs` in the
frontmatter for the exact runs and findings that produced this rule.

## What it checks

When `/assessment` runs, **after** standard skills produce findings but
**before** the per-group summary is shown to the user:

1. For each finding produced by `cve-known-vulnerabilities`, `cwe-*`, or
   `fact-*` skills:

   1.1. If the finding's `location` matches glob `**/third-party-vendored/**`
        OR `**/deployment/legacy/**`:

        - Set the finding's `state` to `suppressed`
        - Set `state_reason` to: `"Vendored / legacy code — managed by team-vendored-code-policy"`
        - Add the team-skill name to the finding's audit trail (so future runs
          know which rule suppressed it)

   1.2. Otherwise: leave the finding alone.

2. After processing, log the count of auto-suppressed findings to the
   per-group summary line:

   ```
   security-cve: 4 new, 0 unchanged, 2 auto-suppressed by team-vendored-code-policy
   ```

## When NOT to apply

- **Critical CVEs newer than 30 days**: Even vendored code with a fresh
  critical CVE (CVSS ≥ 9.0, disclosed within 30 days) should be surfaced
  with a note "Vendored, normally suppressed, but a fresh critical merits
  review." Don't blanket suppress critical-fresh findings.

- **User asks "show all findings"**: If the user explicitly says "show all
  findings including vendored", bypass this skill for the duration of the
  iteration session (Step 5). Restore on next session.

- **The path doesn't actually contain vendored code anymore**: The team may
  have deleted `deployment/legacy/`. If a glob matches no findings for 3
  consecutive runs, the skill should self-flag for review at the next
  session start.

## Effective until

`2026-08-13` (90 days from creation). At Step 1 of the next assessment after
this date, the agent will surface this skill for re-confirmation:

> "team-vendored-code-policy expires today. The pattern still seems active
> (it suppressed 6 findings last run). Renew for another 90 days, adjust
> scope, or deprecate?"

## How to deprecate

If the rule is no longer accurate:

- Set `metadata.modernize.state: deprecated` in the frontmatter (do NOT
  delete the file — keeps git history clean and lets future agents see the
  decision)
- Optionally add a `## Deprecated on YYYY-MM-DD` section explaining why

A deprecated team skill is loaded but produces no effect. The agent
surfaces deprecated skills at Step 1 once per session as a reminder.

## How to adjust scope

Edit the `What it checks` section to change globs / skill IDs. Keep the
frontmatter `version` at `1` as long as schema is unchanged. Bump `version`
only if the file's structure (frontmatter fields) changes.
```

---

## Anatomy of the example

### Frontmatter — required fields

| Field | Why |
|-------|-----|
| `name` | Must start with `team-`, lowercase, hyphen-separated, ≤ 40 chars |
| `description` | One sentence; the agent uses this in the plan-render summary |
| `metadata.modernize.created_by` | Always `ai` for AI-generated; `user` if hand-written |
| `metadata.modernize.created_at` | ISO timestamp; immutable |
| `metadata.modernize.group` | Which group's slot this skill takes; affects display order |
| `metadata.modernize.languages` | Subset of `[java, dotnet, jsts]` or `["all"]` |
| `metadata.modernize.source_findings` | Provenance: finding IDs that justify the skill |
| `metadata.modernize.source_runs` | Provenance: runs where the pattern was observed |
| `metadata.modernize.confidence` | 0.0-1.0 — agent's self-rating; affects review window |
| `metadata.modernize.review_required_by` | Hard date for re-confirmation |
| `metadata.modernize.state` | `active` or `deprecated` (default `active`) |

### Body — required sections

1. **Why this skill exists** — provenance narrative, cite source findings
2. **What it checks** — concrete instructions the agent will follow at run time
3. **When NOT to apply** — guardrails / edge cases
4. **Effective until** — restate the review date for human readers
5. **How to deprecate** — make the off-ramp obvious

---

## What this skill does NOT do

Critical for understanding the safety boundary:

- ❌ It does NOT modify source code
- ❌ It does NOT change the standard skill catalog
- ❌ It does NOT increase any finding's severity
- ❌ It does NOT delete findings from `findings.yaml`
- ❌ It does NOT call external services on its own
- ❌ It does NOT write to anywhere outside `.memory/`

Team skills can ONLY:

- ✅ Transition finding state (`new` → `suppressed` / `acknowledged`)
- ✅ Annotate findings with `state_reason`
- ✅ Add audit-trail metadata
- ✅ Influence what the per-group summary highlights

This is the same constraint as `suppressions.yaml` rules — team skills are
just a richer, code-shaped expression of the same idea, with provenance.

---

## When you'd hand-write one (vs. let the AI propose it)

Reasons to write a team skill manually instead of waiting for curator:

- You're onboarding a new team and want to seed a known convention from day 1
- The pattern is intricate enough that ≥ 3 observations would be impractical
  (e.g. "for our microservice repos, treat any finding in `legacy-services/`
  with severity = original_severity − 1")
- You want to document the team's *philosophy*, not just a pattern (e.g.
  "skills that produce architecture diagrams should always exclude infra
  modules — we have a separate process for those")

For these cases, set `metadata.modernize.created_by: user` and skip the
`source_findings` / `source_runs` arrays. Write the rationale in `Why this
skill exists` directly.

---

## Lifecycle in summary

```
[Curator proposes]   → ask_user → user approves
       │
       ▼
[Write to .memory/skills/team/<name>/SKILL.md]
       │
       ▼
[Auto-load on every subsequent run; apply rules during Step 4]
       │
       ▼
[Step 1 of next run after review_required_by date: re-confirm]
       │
       ├─→ "still relevant" → bump review_required_by (+90 days)
       ├─→ "adjust scope"   → edit the file in place
       └─→ "deprecate"      → set state: deprecated (file stays in git)
```

This is the **self-evolution** loop — the product literally accumulates the
team's working knowledge over time, and the user can always inspect, edit,
or roll back what was learned.
