# Bias-Patch Memory — capture what surprises you

> **Scope**: This rule is loaded and enforced by the **assess** skill. The
> **create-modernization-plan** and **execution-coordinator** skills consume
> the patches as constraints but do NOT capture new ones — capture is
> only valid inside the assess conversation, where intent and project
> context are richest.

> **Storage**: `.github/modernize/.memory/bias-patches.yaml`. Sits as a
> sibling to `findings.yaml` / `suppressions.yaml` / `preferences.yaml`.
> Committed to git; the whole team benefits from one user's correction.

---

## Why this exists

Every other `.memory/` file records **observed facts** (findings) or
**explicit choices** (suppressions, preferences). `bias-patches.yaml`
records the **deltas between the model's default output and reality**.

A patch is justified only when the conversation forces the model to
change a default it would otherwise produce. That makes the file
naturally small and naturally relevant — it is, by construction, the
set of corrections the model needs in order to stop being wrong about
this project.

This is the same idea as a compiler optimization pass remembering
which inlining decisions backfired — not a generic log of everything
that happened.

---

## When to capture (the three-step self-check)

Run this check after every user turn that touches architecture,
target, scope, dependencies, recommendations, or any factual claim
about the codebase.

### Step 1 — Externalize your prior (one sentence)

Before evaluating surprise, write down what you **would have said /
chosen / generated** if the user hadn't provided this turn. This must
be a real, concrete sentence — not a hedge. The act of writing it
locks the prior and prevents hindsight rationalization ("oh, I would
have gotten there anyway").

### Step 2 — Score the surprise

Ask: **would I have bet against the actual answer at meaningful
odds?**

- If prior ≈ actual → **skip**. No patch needed. The model already
  defaults to the right thing.
- If prior and actual diverge such that you'd have produced something
  the user would push back on → **continue to Step 3**.

This is the gating criterion. Most user turns will not pass it. That
is correct and intentional.

### Step 3 — Score scope + reusability

Ask both:

1. **Reusability**: would this patch change my output in a future
   similar situation? If the answer is "only this one time", skip.
   The patch must be a behavioral generalization, not a transcript.

2. **Scope**: pick the **narrowest** scope that captures the lesson.
   - `session` — local to this conversation. Do NOT write to yaml;
     just hold it in context.
   - `repo` — true for this codebase only. **Default choice when in
     doubt.** Write to `bias-patches.yaml`.
   - `user` — true across all of this user's projects. Rare; only
     write when the user explicitly says something like "I always
     prefer X". Goes to Copilot's `/memories/`, not this file.

---

## How to capture (when all three checks pass)

### 1. De-duplicate first

Read existing `bias-patches.yaml`. If a patch with state `active`
already covers the same `actual`:

- **Do not create a new entry.**
- Update the existing entry: bump `reinforce_count += 1` and set
  `last_reinforced_at` to the current ISO timestamp.
- Surface a one-line audit: `📌 Reinforced behavioral patch bp-NNNN
  (now reinforced N times).`

### 2. Otherwise, append a new entry

Use the schema defined in [memory-schema.md](memory-schema.md) §
`bias-patches.yaml`. Required fields:

- `id` — monotonically increasing `bp-NNNN`
- `captured_at`, `last_reinforced_at` — current ISO timestamp
- `reinforce_count` — `1` for new patches
- `captured_in_run` — current run id (the `runs/<ts>/` folder)
- `source` — `user-correction` | `user-preference` | `user-confirmation`
- `scope` — `repo` (default) | `user` (rare)
- `prior` — the one-sentence prior from Step 1 above
- `actual` — what the user's correction / preference / confirmation
  actually established
- `applies_to.skills` — which skills should honor this (at minimum
  the assess skill itself; usually also `create-modernization-plan` /
  `execution-coordinator` if the patch affects target selection)
- `applies_to.intents` — which intent groups (`cloud-readiness`,
  `architecture`, `upgrade`, `security`, `full`)
- `state` — `active` for new patches
- `state_changed_at` — current ISO timestamp

### 3. Surface a single audit line

Match the style of suppression auto-application. One line, no
question, no permission-seeking:

```
📌 Recorded behavioral patch bp-0007: <one-line prior summary> → <one-line actual summary> (scope: repo)
```

The user has opted into this by installing the plugin. **Never ask
`ask_user` for permission to write a patch.** Confirmation prompts
defeat the entire "silent base capability" design.

---

## When loading (every assess run, Step 1)

Read `bias-patches.yaml` together with the other `.memory/` files.
Apply this filter pipeline:

1. **Active only** — drop `state: retired` and `state: superseded`.
   Retired patches remain on disk for audit but never enter context.
2. **Relevance filter** — keep only patches whose
   `applies_to.intents` intersects the current run's intent.
3. **Recency sort** — sort by `last_reinforced_at` descending.
4. **Cap at `preferences.behavior.bias_patches.max_loaded_per_run`**
   (default `20`). When the filtered list exceeds the cap, apply the
   configured `overflow_strategy`:
   - `digest` (default) — compress the overflow into a short
     bullet-list digest using your own summarization; inject the
     digest instead of the raw patches. The yaml file stays
     untouched.
   - `drop-oldest` — drop overflow silently. Still surface a count
     in the greeting so the user knows.
   - `warn-user` — load the cap, but include
     `"You have N active patches; consider review"` in the
     greeting so the user can prune manually.

Once loaded, every retained patch is a **hard constraint on
generation** for the remainder of the conversation. Treat them with
the same authority as `suppressions.yaml` rules.

### Greeting integration

Augment the Step-1 greeting to surface the patch count, grouped by
intent for readability (not full text):

```
Loaded 23 findings + 7 active behavioral patches:
  - 3 cloud-readiness constraints (e.g. "no containerization")
  - 2 architecture corrections (e.g. "msg queue between login and DB")
  - 2 upgrade preferences
  (12 retired patches in archive)
```

If the file does not exist or has zero active patches, say nothing
about patches in the greeting. Silence is the right default.

---

## Garbage collection (Step 6 of assess)

At the end of every assess run, immediately before report generation,
sweep `bias-patches.yaml`:

For each `active` patch:

1. **Stale + obsolete**: if `last_reinforced_at` is older than 90
   days AND the patch's `actual` matches what you would now generate
   by default (re-run Step 1 of the three-step check against the
   patch's `prior`), set `state: retired` with
   `retirement_reason: "default-now-matches-actual"`.

2. **Superseded**: if a newer active patch directly contradicts an
   older one, mark the older one `state: superseded` with
   `retirement_reason: "superseded by bp-NNNN"`.

Never delete. Retirement is auditable; deletion is not.

Sweep results are logged silently to `runs/<current-ts>/summary.md`
under `bias_patches:` — they are not surfaced to the user unless the
user explicitly asks "what changed in memory this run?".

---

## Application to plan-create / plan-execute

Those skills do NOT run the capture pipeline. They only:

1. Load `bias-patches.yaml` with the same filter pipeline above
   (active → relevance → recency → cap).
2. Treat every loaded patch as a hard constraint on their output.
   Example: a repo-scoped patch saying "non-containerized PaaS only"
   removes ACA, AKS, and Dockerfile-based paths from the candidate
   set silently — no need to argue with the user about it again.
3. If a loaded patch would force the user's explicit current request
   to be impossible (e.g. user asks "containerize this" but a patch
   says "no containers"), surface the conflict and let the user
   decide:

   ```
   ask_user(
     question: "An active patch (bp-0007) says 'non-containerized PaaS only',
                but you're asking to containerize. How do I reconcile?",
     choices: [
       "Containerize anyway — this request overrides the patch",
       "Retire patch bp-0007 (no longer true)",
       "Cancel — the patch wins"
     ]
   )
   ```

   If the user picks "Containerize anyway", honor the request for
   this run only — the patch stays active for future runs unless the
   user picks "Retire". This asymmetry protects long-lived
   constraints from one-off overrides.

---

## Anti-patterns

- ❌ Asking the user "should I remember this?" — defeats the purpose.
- ❌ Writing a patch for every user turn — only when prior ≠ actual.
- ❌ Defaulting `scope: user` — pollutes the user's global memory
  with project-specific facts. Default to `repo` when uncertain.
- ❌ Acknowledging a correction verbally without persisting it — the
  next session will repeat the same mistake.
- ❌ Deleting retired patches to keep the file small — use the
  filter pipeline at load time instead. The on-disk audit trail is
  cheap and valuable.
- ❌ Running the capture check inside `create-modernization-plan` or
  `execution-coordinator` — capture is assess-only.
