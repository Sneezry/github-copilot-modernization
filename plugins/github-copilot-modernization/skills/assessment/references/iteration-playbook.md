# Iteration Playbook — Handling User Requests After the First Run

> **Purpose**: Once Step 4 (execution) finishes, the agent enters Step 5 (iteration mode) and stays there until the user explicitly exits. This playbook is the agent's lookup table: "user said X → do Y, read Z, write W."

> **Core principle**: Never re-run the full pipeline because the user wants to refine one finding. Every interaction below is incremental.

---

## How to use this playbook

When a user message arrives during Step 5:

1. Match the message to the closest **scenario** below (use the trigger phrases as a fuzzy guide).
2. Follow the **action sequence** exactly.
3. If no scenario matches, fall back to scenario **00**.
4. If the user combines two scenarios (e.g. "ignore all internal-libs findings AND show me the rest"), execute them sequentially — suppression first, then display.

After every scenario, ask one short follow-up: `"Anything else, or want me to open the report?"`

> **Important**: All `.memory/` state is **already saved** — each group autosaves at the end of Step 4, and any iteration write (suppressions, state transitions) is committed immediately. So follow-ups should be value-oriented ("what next?") rather than infrastructure-oriented ("want to save?"). Never offer "save and exit" as a user-facing choice.

---

## 00 — Unrecognized intent (fallback)

**Trigger**: Anything that doesn't fit a scenario below.

**Action**:

1. Show the user the menu of common things they can do (compact, ≤ 5 lines):
   - "explain finding X"
   - "ignore findings matching Y"
   - "re-run skill Z with stricter rules"
   - "compare with previous run"
   - "create a plan from the high-severity findings"
   - "open the report" / "I'm done"
2. Wait for clarification. Do **not** guess and execute.

---

## 01 — "Why is X marked high?" / "Explain this finding"

**Trigger**: `why`, `explain`, `tell me more about`, `what does X mean`, references a finding ID or title.

**Action**:

1. Resolve the reference to a finding ID. If ambiguous (multiple matches), list candidates with IDs and ask the user to pick.
2. Read the finding's full record from `runs/<latest>/<skill-id>.json` (the per-skill output) AND the corresponding `../assessment-skills/<skill-id>/SKILL.md` to understand the rule.
3. Compose an answer with these sections:
   - **What the finding says**: 1-2 sentences from the evidence
   - **Why this skill flagged it**: quote the rule from the skill's SKILL.md
   - **Where it lives**: file path + line if known
   - **What "high" means here**: severity scale per skill
   - **Suggested next moves**: ignore / fix / acknowledge / escalate
4. Do NOT modify any state — this is read-only.
5. End with: `"Want me to acknowledge it, suppress similar findings, or move on?"`

---

## 02 — "Ignore this finding" / "Suppress findings matching Y"

**Trigger**: `ignore`, `suppress`, `hide`, `false positive`, `not relevant`.

**Action**:

1. Determine the suppression scope:
   - **Single finding**: `match: { id: <finding-id> }` → action: `suppress`
   - **By location**: `match: { location_glob: "**/internal-libs/**" }`
   - **By skill**: `match: { skill: cwe-injection-attacks }`
   - **By title**: `match: { title_regex: "CWE-477" }`
2. If the user's request is broad (e.g. "ignore everything in test code"), confirm with `ask_user(...)` showing the impact: `"This rule will suppress N existing findings and apply to future runs. Continue?"`.
3. Append the rule to `suppressions.yaml` with:
   - `description`: the user's wording (verbatim)
   - `created_by: user`
   - `created_at`: current ISO timestamp
4. Re-apply suppressions atomically by running:
    ```bash
    node .github/modernize/.runtime/assessment/assess-cli.mjs update-state \
       --findings .github/modernize/.memory/findings.yaml \
       --apply-rules true
    ```
5. Print: `"Suppressed N findings. Rule saved to suppressions.yaml."`
6. Track this for curator: increment a counter "suppressions added this session" — at threshold (`preferences.curator_threshold`, default 3), trigger scenario **10**.

---

## 03 — "Mark this fixed" / "I resolved that"

**Trigger**: `fixed`, `resolved`, `done`, `addressed`, `we patched it`.

**Action**:

1. Resolve the finding ID(s).
2. Transition state atomically:
    ```bash
    node .github/modernize/.runtime/assessment/assess-cli.mjs update-state \
       --findings .github/modernize/.memory/findings.yaml \
       --ids <comma-separated-finding-ids> \
       --state resolved \
       --reason "<user's reason or manually marked resolved>"
    ```
3. Print: `"Marked N finding(s) as resolved. They'll show as 'regression' if they reappear in a future run."`
4. Do NOT touch source code — this is a state change, not a fix. If the user wants the agent to also fix it, hand off to `execution-coordinator` (scenario **08**).

---

## 04 — "Re-run skill X" / "Drill deeper on Y"

**Trigger**: `re-run`, `rerun`, `again with`, `dig deeper`, `more thorough`, `with stricter rules`.

**Action**:

1. Identify the target — single skill, single group, or single finding.
2. If "deeper" / "stricter":
   - Read the skill's SKILL.md.
   - Identify which thresholds or sample limits the skill exposes (e.g. `cwe-code-quality` stops at first match per rule — the agent can re-run with "scan all matches per rule" instead).
   - Confirm the change with `ask_user(question: "I'll re-run cwe-code-quality scanning all matches (currently stops at first per rule). This may take ~2x longer. Continue?", choices: ["Yes", "No, just first matches", "Cancel"])`.
3. Execute the targeted skill (NOT the whole pipeline).
4. Diff the new findings against the existing `findings.yaml`:
   - **New**: append with state `new`
   - **Disappeared**: existing acknowledged/escalated → no change; existing `new` → also no change (the user must explicitly mark resolved)
   - **Unchanged**: bump `last_seen` and add to `runs:`
5. Show only the diff in the response: `"Re-ran cwe-code-quality. +3 new, ~12 unchanged, -0 disappeared."`
6. Update `runs/<current>/summary.md` with the re-run note.

---

## 05 — "Show me only critical/high" / "Filter results"

**Trigger**: `only`, `filter`, `show me`, `just the X`.

**Action**:

1. This is a view operation, not state. Do NOT modify `findings.yaml`.
2. Render the filtered subset inline. Format: severity-grouped, with finding ID + 1-line title + location.
3. After the list, prompt: `"Want me to do anything with these?"` and offer common verbs (`acknowledge all`, `create plan from these`, `escalate all`).

---

## 06 — "Compare with last run" / "What changed?"

**Trigger**: `diff`, `compare`, `since last`, `what's new`, `regression`.

**Action**:

1. Locate the prior `runs/<previous-ts>/summary.md` (most recent before current).
2. If no prior run exists, say so and offer to commit current as baseline.
3. Compute diff at the finding level using `findings.yaml`:
   - **New since last run**: appeared in current run, didn't exist in prior `runs:` list
   - **Resolved since last run**: prior had `state != resolved`, current has `state: resolved`
   - **Regressions**: `state: resolved` in prior, back to `new` in current
   - **Severity changes**: same ID, different severity
4. Render as a compact table. Highlight regressions (these are the most important).
5. Offer: `"Want a markdown summary I can post to a GitHub issue?"`

---

## 07 — "Acknowledge all" / "Bulk action"

**Trigger**: `acknowledge all`, `escalate all`, plural verbs over a filter.

**Action**:

1. Always show the candidate list and a count first.
2. `ask_user(question: "About to set N findings to <state>. Reason?", choices: ["Reviewed in batch", "Sprint planning", "Other (type your answer)"])` — capture the reason.
3. Apply the transition with `update-state --ids <ids> --state <state> --reason "<captured reason>"` so the write is locked and atomic.
4. Print summary: `"Updated N findings to <state>."`

---

## 08 — "Create a plan from these findings"

**Trigger**: `plan`, `fix it`, `migrate`, `create a plan`, `let's go execute`.

**Action**:

1. Determine which findings should drive the plan:
   - Default: all `new` + `escalated` findings of the user's preferred severity (ask if unclear)
   - Filter explicitly if the user named a subset
2. Summarize the chosen findings into a plan brief (≤ 1 page) with a clear goal and grouping by skill type.
3. Hand off to `create-modernization-plan` skill — pass the brief as input (or stage it at `.github/modernize/plans/<plan-name>/input-brief.md` and invoke the skill).
4. After hand-off, return to iteration mode. Do NOT auto-execute the plan; that's a separate user decision.

---

## 09 — "Add this skill to next run" / "Always include X"

**Trigger**: `always`, `next time`, `default`, `add to my profile`.

**Action**:

1. Identify the change — adding/removing a group or skill.
2. `ask_user(question: "Should this be the new default for everyone using this repo, or just this run?", choices: ["Save as team default", "Just this run", "Cancel"])`.
3. If "team default": modify `preferences.yaml` (`default_groups` or `skill_overrides`).
4. If "just this run": update `last-intent.yaml` only.
5. Confirm: `"Saved. Next /assessment will use this."`

---

## 10 — Curator opportunity (proactive, not user-triggered)

**Trigger**: The agent itself notices, during iteration, that:

- ≥ `preferences.curator_threshold` (default 3) suppression rules share a common pattern (same skill or same path prefix), OR
- A user has acknowledged the same finding type ≥ 3 times across multiple runs

**Action**:

1. Pause the current scenario.
2. Compose a 2-3 sentence proposal: `"I notice you've suppressed CWE-477 in src/test/** three times. Want me to create a team skill `team-test-cwe-477-allowlist` that automatically handles this?"`
3. `ask_user(choices: ["Yes, create it", "No, keep doing it manually", "Show me what it would look like first"])`.
4. If "show first": render the proposed SKILL.md inline and re-prompt.
5. If "yes": follow [skill-curator.md](skill-curator.md) to write the skill into `.memory/skills/team/`.
6. Return to whatever the user was doing.

This is the only scenario where the agent initiates; everything else is reactive.

---

## 11 — "I'm done" / Done finishing

**Trigger**: `done`, `exit`, `bye`, `that's all`, `finish`, `wrap up`.

**Action**:

1. Run Step 6 of [`SKILL.md`](../SKILL.md):
   - Sediment any small files that aren't already up-to-date (preferences, last-intent, summary.md, prune runs)
   - Generate the interactive HTML report via ``.github/modernize/.runtime/assessment/assess-cli.mjs generate-report``
2. If curator opportunity (scenario **10**) was deferred, mention it once now.
3. Present the action menu (NOT a "saved" greeting):
   ```
   Report ready: .github/modernize/reports/<ts>-<intent>.html
     1. Open the report in my browser  (default)
     2. Generate a migration plan for [top recommendation]
     3. Drill into a specific finding
     4. Run a group I skipped
     5. Done
   ```
4. If user picks 5 (Done), exit silently. There is nothing more to say — saving was always-on, the report is generated, the next session can resume freely.

**What this scenario must NOT do**

- Print "Saved." as the greeting (save is the default state, not an event)
- Offer a "save and exit" choice anywhere in the flow
- Ask the user to confirm writing to `.memory/`
- Block exit on report-generation failure — log the error and exit anyway

---

## 12 — "Open the report" / "Show me the report"

**Trigger**: `open the report`, `show me the report`, `generate report`, `where's the report`, `see findings as a report`, `give me the html`.

**Action**:

1. Determine the run-id:
   - During Step 5 (still in the same session): use the current run-id from `runs/<current>/intent.yaml`
   - User asks days later (fresh session): use `latest.html` directly without regenerating
2. If regenerating, run ``.github/modernize/.runtime/assessment/assess-cli.mjs generate-report`` with the current `--memory-dir`, `--run-id`, and `--output-dir .github/modernize/reports`.
3. Attempt to open the file with the platform default:
   - Windows: `start "" <path>`
   - macOS:   `open <path>`
   - Linux:   `xdg-open <path>` (fall back to printing the path if not available)
4. Reply with both paths so the user can bookmark either:
   ```
   Opened: .github/modernize/reports/<ts>-<intent>.html
   Also at: .github/modernize/reports/latest.html
   ```
5. Stay in iteration mode — do NOT auto-exit. The user may want to drill in further after seeing the report.

**What this scenario must NOT do**

- Modify `.memory/` (report generation is read-only against state)
- Block on report failures — if the script errors, print the path the report *would* be at, log the error, and return control to the user

---

## Anti-patterns (do NOT do these)

- **Re-running the full pipeline** because the user asked about one finding → use scenario 04 instead, target the specific skill
- **Asking the user to repeat their preferences** when they're already in `preferences.yaml` (Rule 6)
- **Silently changing finding state** without showing the user the count → Rule 1 (destructive actions need confirmation)
- **Deleting findings** → state machine only, never DELETE
- **Writing to anywhere other than `.memory/`** during iteration mode (the user's source tree is off-limits unless they invoke execution-coordinator via scenario 08)
- **Inferring suppression scope too broadly** → if the user says "ignore log4j stuff", confirm whether that means "this finding", "all CVEs in log4j-core", or "all dependencies named log4j*"
