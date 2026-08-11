# Report Template Specification

> **Purpose**: Defines the **fixed shape** of every assess HTML report. The report has three rendering tiers (`ai-narrated`, `partial`, `raw`) and adapts its content depth to whichever tier the run produced, but the **section order, visual language, and interaction model are identical across all three tiers**. Consistency makes reports comparable, scannable, and trustworthy.
>
> **Owner**: This spec is authoritative. The implementation lives in [`../scripts/templates/report.html`](../scripts/templates/report.html) and [`../scripts/assess-report.mjs`](../scripts/assess-report.mjs); the producer of the narrative is [`enrichment-prompt.md`](enrichment-prompt.md); the schema of the narrative is [`enrichment-schema.md`](enrichment-schema.md). Any change to section order, count, or required content must land here first.

---

## Design principles

1. **Two layers, one experience.** The **fact layer** (`findings.yaml`, mechanical, stable IDs) and the **narrative layer** (`enrichment.yaml`, AI-authored, regeneratable) merge at render time. The user sees one cohesive report; the underlying split keeps facts stable while letting narrative iterate freely.
2. **Same skeleton, different depth.** Every report renders the same sections in the same order. The depth of each section degrades cleanly when enrichment is partial or absent — see [§ Degradation tiers](#degradation-tiers).
3. **Self-contained.** One HTML file. No CDN, no external CSS / JS / fonts, no network calls after open. Safe to email, attach to a wiki page, or open offline.
4. **Read-only view.** The report never edits `.memory/`. It surfaces state; it never mutates it. All "quick action" buttons copy a prompt to the clipboard for the user to paste — they do not file changes.
5. **Real interactivity.** HTML earns its place over Markdown by doing what Markdown can't: chip facets, drawer for related knowledge, command palette, keyboard navigation, URL-shareable filter state, persistent collapsed-section state.
6. **Severity-color discipline.** `critical=red`, `high=orange`, `medium=amber`, `low=green`, `info=gray`. Used identically for badges, stat tiles, headline accent dots, and theme borders. Never used for purely decorative purposes.

---

## Degradation tiers

The generator derives the tier from the content of `enrichment.yaml`; the agent does NOT declare it.

| Tier | Enrichment fullness | Header banner | Briefing | Headlines | Themes | Per-finding narrative |
|------|---------------------|---------------|----------|-----------|--------|-----------------------|
| `ai-narrated` | `briefing` + `themes` + at least one `findings[]` entry populated | None (pill only) | ✅ | ✅ | ✅ | ✅ |
| `partial` | Some of the above present, some missing | Amber: "Partial narrative" | If present | If present | If present, else severity-bucketed | If present per-finding, else raw rationale |
| `raw` | File missing, empty, or only `version`/`intent_slug` | Amber: "Raw data view" | — | — | Synthetic severity buckets (`Critical findings`, `High findings`, …) | Raw `rationale` from `findings.yaml` |

The mode pill in the top bar (top-right) always shows the current tier. The page's `<html data-mode="…">` attribute also carries it, so CSS or future overrides can branch on it.

---

## Fixed section order

| § | Section | Source | Renders in tier |
|---|---------|--------|-----------------|
| 0 | Top bar + stats strip | `meta`, `counts` | All |
| 1 | Briefing | `enrichment.briefing` | `ai-narrated`, `partial` |
| 2 | Headlines | `enrichment.headlines` | `ai-narrated`, `partial` |
| 3 | Change narrative | `enrichment.change_narrative` | When prior run exists AND enrichment includes block |
| 4 | Filter bar | Computed (active facets) | All; hidden until a filter is active |
| 5 | Themes & finding cards | `enrichment.themes` + `findings` | All (synthetic themes in `raw`) |
| 6 | Risks | `enrichment.risks` | When enrichment includes block (any tier) |
| 7 | Cost estimate | `enrichment.cost_estimate` | When enrichment includes block (any tier) |
| 8 | Next steps | `enrichment.next_steps` | `ai-narrated`, `partial` |
| 9 | Appendix | All inputs | All |

Sections 1, 2, 3, 6, 7, 8 are **omitted entirely** (not rendered as "empty state") when their enrichment source is missing. Section 5 is always present. Section 9 is always present.

A prominent amber **warnings banner** appears immediately under § 0 whenever `meta.enrichment_warnings` is non-empty — it shows up to 3 example warnings plus a link to the full list inside the § 9 appendix.

---

## § 0 — Top bar + stats strip

**Goal**: Identity + at-a-glance counts in the first viewport.

Required elements:

- Sticky top bar: project name (left), mode pill, intent/run/timestamp, palette button (`⌘ Jump`), Reset button
- Five stat tiles below the bar: **New this run**, **Critical**, **High**, **Medium**, **Low** — each tile is clickable and acts as a one-click facet filter on the findings below

Forbidden:

- Charts (defer to a future revision; v1 is dependency-free)
- Any external network call (fonts, telemetry, analytics)

---

## § 1 — Briefing

**Goal**: A consultant-feel opening: 2–6 sentences on "what is this project, where does it stand, what should you do next?". Renders only when `enrichment.briefing.paragraph` exists.

Required elements:

- Paragraph rendered via the [plain Markdown subset](enrichment-schema.md#authoring-rules) (paragraphs, `**bold**`, `` `code` ``, `[text](url)`)
- Below the paragraph: `project_tags` rendered as chips. **Clicking a project tag filters the findings below by that tag.** (Tags double as facets — they are not decorative.)

Forbidden:

- Re-stating numbers the stats strip already shows (the agent is instructed to weave them in only when they add context)

---

## § 2 — Headlines

**Goal**: A "table of contents for busy people" — 3–5 cards each summarizing one important thing the reader should not miss.

Required elements:

- Grid of 3–5 headline cards (kind + title + body + jump button)
- Each card carries a colored accent dot keyed to `kind` (`critical-risk=red`, `warning=orange`, `effort=amber`, `opportunity=green`, `trend=blue`)
- Clicking a card with `jump_to.kind=finding` scrolls to that finding card and pulses its border; with `jump_to.kind=theme` scrolls to (and expands) that theme

Forbidden:

- More than 5 cards (the schema's hard cap; the generator truncates and logs a warning)
- Cards without an accent — the `kind` field is required

---

## § 3 — Change narrative

**Goal**: Cross-run delta in narrative form. Renders only when `enrichment.change_narrative` exists AND a prior run can be referenced.

Required elements:

- Title: "Since baseline run `<baseline_run_id>`"
- Summary paragraph
- Grid of highlight cards, each tagged by `kind` (`added` / `resolved` / `escalated` / `regressed`) with a matching accent color (green for `added`/`resolved`, red for `regressed`, orange for `escalated`)
- Each highlight card with `finding_ids` is clickable: it sets the active filter to those IDs and scrolls back to the findings list

---

## § 4 — Filter bar (sticky)

**Goal**: Make the current view legible. Hidden until at least one filter is active.

Required elements:

- Sticky under the top bar when any filter is active
- Shows each active filter as a chip with `×` to remove individually
- "X of Y findings" live counter
- "Clear all" button

Filter facets:

- `severity` — driven by the stat tiles
- `state` — driven by the "New this run" tile (chip `state:new`)
- `tag` — driven by enrichment `findings[].tags` chips on the cards and `briefing.project_tags`
- `source` — driven by the finding's `source` chip
- `id` — driven by "↪ N related" and change-narrative highlight clicks (lets the user pivot to a specific cluster)

Filter state persistence:

- URL hash `#f=<urlencoded JSON>` — shareable view via copy-paste
- `localStorage` under `assess-report::<run-id>::filters` — survives reload, scoped to the run

---

## § 5 — Themes & finding cards

**Goal**: Group the findings the way the agent decided makes sense, and present each finding as a self-contained decision-ready card.

### Theme heading

- Collapsible (caret arrow); collapsed state persists in `localStorage` per run
- Count badge (number of findings in the theme)
- `auto-bucketed` tag when the theme is the synthetic `other` bucket (the generator's catch-all for findings the agent didn't assign)
- Optional summary paragraph (from `enrichment.themes[].summary`)

In `raw` mode, themes are auto-generated severity buckets: `Critical findings`, `High findings`, `Medium findings`, `Low findings`, `Informational findings`. Empty buckets are omitted.

### Finding card

A finding card is a self-contained mini-page. Each card shows:

- **Head row**: severity badge, state badge, optional "new" dot, monospaced finding ID (truncated, full text in tooltip)
- **Title**: from `findings[].title`/`summary` if present, else the finding ID
- **Body**: enrichment `why_it_matters` if available, else raw `rationale` from `findings.yaml`
- **Locations**: first 2 inline, "+N more" expands the full list. Path + line in monospace.
- **What to do** (`ai-narrated` only): enrichment `what_to_do` paragraph with a bold lead-in
- **Tags row**: `enrichment.findings[].tags` as chips, plus the finding's `source` as a chip — clicking any chip filters the page by that facet
- **Meta row**:
  - "↪ N related" button (when `related_findings` is non-empty) — applies a filter to show only the related cluster
  - "📖 N knowledge" button (when `related_knowledge` is non-empty) — opens the right-side drawer with steps and references
- **Quick actions**: chips colored by `kind` (`plan` and `plan-with-related` in accent blue, `suppress` in dim gray). Clicking copies the action's prompt to the clipboard and shows a toast.

Forbidden:

- Putting occurrence counts inside the title string (it churns finding IDs every time the count changes)
- Leaking the source engine name into titles (`AppCAT rule X`, `OWASP DC: X`) — source attribution belongs in the tag chip
- Splitting one project-level fact into N per-file rows: rolled-up findings (`locations.length > 1`) render as ONE card with the "+N more" expander
- Shipping a finding without a `rationale` AND without `why_it_matters` — the user is left without any way to decide. Integration scripts MUST populate `rationale`; enrichment SHOULD populate `why_it_matters`. (See [memory-schema.md](memory-schema.md) § "Why findings carry an explanation".)
- Hiding the suppress action behind a confirmation step — clicking `suppress` copies a YAML block to the clipboard; the user pastes it into `suppressions.yaml` and re-runs the skill. No silent state changes.

### Right-side drawer (related knowledge)

- Slides in from the right when "📖 N knowledge" is clicked
- Contains an ordered list of knowledge cards: title, optional summary paragraph, numbered `steps[]`, then `references[]`
- Each reference row shows either an `AI-suggested · verify` (amber) or `verified` (green) tag — the generator marks `verified: false` by default; only the agent can mark `verified: true` after actually fetching the URL. See [enrichment-prompt.md § Trust rules](enrichment-prompt.md#trust-rules).
- Closes via the `×` button, `Esc` key, or click on the backdrop

---

## § 6 — Risks (optional)

**Goal**: Surface cross-cutting risks that don't belong to any single finding — data migration windows, third-party SLAs, cold-start latency, vendor lock-in, team skill gaps. Renders only when `enrichment.risks` is non-empty.

Required elements:

- Section heading + short lede line
- Grid of risk cards, one per `risks[]` entry
- Each card carries a 3-pixel left border colored by `severity` (`critical=red`, `high=orange`, `medium=amber`, `low=green`, `info=blue`)
- Body: severity label, title, body paragraph, optional **Mitigation** lead-in paragraph
- Optional "Linked findings:" row with short-form IDs when `finding_ids[]` is non-empty
- DOM anchor `id="risk-<r.id>"` on each card for direct linking

Forbidden:

- Risks that duplicate a specific finding's content — those belong in `findings[].why_it_matters`
- Padding the list to look comprehensive — omit the whole section if you have nothing genuinely cross-cutting to say

---

## § 7 — Cost estimate (optional)

**Goal**: Give the user a coarse effort + monthly cloud spend bracket they can take to a planning conversation. Renders only when `enrichment.cost_estimate` is non-empty.

Required elements:

- Section heading + short lede line warning that the numbers are coarse and should be confirmed with the platform team before quoting
- Two headline tiles: **Effort** (person-days range) and **Monthly run cost** (currency + numeric range)
- Optional **breakdown table** (Item / Monthly): one row per `cost_estimate.breakdown[]` entry. The Monthly column is rendered as a raw string (e.g. `30–80` or `~50` or `included`) — no implicit currency formatting.
- Optional **notes paragraph** with the agent's caveats about assumptions, scope, sensitivity

Forbidden:

- Implying precision the agent doesn't have — the schema uses ranges and the field is a string for a reason
- Rendering when both `effort_person_days` and `monthly_run_cost` are absent and `breakdown[]` is empty (the whole section is hidden)
- A currency code other than the one in `monthly_run_cost.currency` (defaults to USD when omitted)

---

## § 8 — Next steps

**Goal**: Hand the user off to the next skill with zero typing.

Required elements:

- Grid of 1–3 step cards (kind: `plan-now` red, `plan-soon` amber, `monitor` blue, `celebrate` green / `defer` gray)
- Each card with `prompt` shows a primary "Copy prompt" button — clicking copies the prompt to the clipboard and toasts confirmation
- `effort_hint` shows as a subtle "Effort: …" meta line

Forbidden:

- Asking the user to "save" anything (saving happens silently in Step 4 of [SKILL.md](../SKILL.md); the report is read-only)
- A `plan-now` / `plan-soon` card without a `prompt` (defeats the "zero typing" goal)

---

## § 9 — Appendix

**Goal**: Make debugging and audit possible without re-running.

Required elements (all in `<details>`, collapsed by default):

- **Scope & selection** — user concern, selected groups, skipped groups, skills run
- **Suppressions & preferences** — active suppression rules with reasons, team preferences as a JSON snippet
- **Enrichment warnings** (only when non-empty) — every cross-reference the generator dropped from `enrichment.yaml`, useful for diagnosing AI/fact drift
- **Raw payload** — the full merged JSON payload pretty-printed (every value the template received)

A footer line identifies the report as generated by the GitHub Copilot modernization plugin's assess skill.

---

## Interaction contracts

These are the keyboard / mouse behaviors that the implementation MUST provide, in addition to obvious link/button clicks:

| Key / gesture | Effect |
|---------------|--------|
| `/` or `⌘K` / `Ctrl+K` | Open command palette (jump to any finding or theme) |
| `Esc` | Close palette (if open), else close drawer (if open) |
| `j` / `k` | Move "focused" highlight to next / previous visible finding card, scroll into view |
| Click any chip | Toggle that facet on/off |
| Click any stat tile | Toggle that severity/state facet on/off |
| Click a theme heading | Collapse / expand that theme (state persisted) |
| Click a finding card body (outside any button) | Toggle a "focused" highlight on the card |
| Click "↪ N related" | Replace active filters with `id: [card.id, ...related]`, scroll to top |
| Click a change-narrative highlight | Replace active filters with `id: [highlight.finding_ids]`, scroll to top |
| Click "📖 N knowledge" | Open right-side drawer |
| Click a quick action `plan` or `plan-with-related` | Copy prompt to clipboard, show toast |
| Click a quick action `suppress` | Copy a suppression YAML block to clipboard, show toast |

URL state:

- Filter state encoded in `#f=<urlencoded JSON>` for shareability
- No other state is stored in the URL (collapsed sections and per-card focus live in `localStorage`)

---

## Styling rules

- Dark theme by default; light theme auto-activates via `@media (prefers-color-scheme: light)`
- CSS custom properties (`:root { --bg: ... }`) for everything color-related so themes can be tweaked in one place
- System UI font stack — no web fonts
- Max content width 1240px, centered
- Monospace font for IDs and file paths (`ui-monospace, SFMono-Regular, Consolas, monospace`)
- All severity colors reuse the same five CSS variables across badges, stat-tile borders, headline dots, and highlight borders

---

## JSON payload contract

The generator embeds a single JSON document in `<script type="application/json" id="report-data">`. Shape:

```jsonc
{
  "meta": {
    "run_id": "2026-05-20T14-22-11Z",
    "generated_at": "2026-05-20T14:22:12Z",
    "project_root": "/home/me/repo",
    "intent_slug": "cloud-readiness",
    "report_mode": "ai-narrated",                 // ai-narrated | partial | raw
    "enrichment_path": "/abs/path/to/enrichment.yaml",
    "enrichment_warnings": [
      // strings listing every dropped cross-reference
    ]
  },
  "intent": { /* runs/<id>/intent.yaml */ },
  "selected_groups": ["security-cve", "..."],
  "skipped_groups": ["..."],
  "selected_skills": { /* runs/<id>/selected-skills.yaml */ },
  "counts": {
    "total": 12,
    "new_this_run": 3,
    "by_severity": { "critical": 1, "high": 2, "medium": 5, "low": 2, "info": 2 },
    "by_state":    { "new": 10, "acknowledged": 2 },
    "suppression_rules": 1
  },
  "findings": [ /* findings.yaml entries, untouched */ ],
  "suppressions": [ /* suppressions.yaml entries */ ],
  "preferences":  { /* preferences.yaml */ },
  "enrichment":   null | { /* see enrichment-schema.md */ },
  "top_recommendation": { "summary": "...", /* ... */ }
}
```

The template's JavaScript reads only this payload — no separate data fetches, no inline state. Replacing the embedded JSON with a new payload and reloading is sufficient to swap the entire report.
