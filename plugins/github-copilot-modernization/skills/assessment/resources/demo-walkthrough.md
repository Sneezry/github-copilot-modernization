# Demo Walkthrough — Five Scenarios That Prove the New Design

> **Purpose**: A scripted walkthrough of the `assess` skill, hitting each of the 5 product promises end-to-end. Use these to verify the PoC and to demo it to others.

> **Prerequisites**:
> - You have a Java or .NET project handy (any will do; demos refer to a hypothetical `customer-portal` repo)
> - For Java/.NET pre-assessment, AppCAT is installed automatically on first use (see [pre-assessment-java.md](../references/pre-assessment-java.md) / [pre-assessment-dotnet.md](../references/pre-assessment-dotnet.md))
> - Optional: `GITHUB_TOKEN` set in environment for unauthenticated rate-limit avoidance on CVE checks

> **How to read these scripts**: lines starting with `User:` are what you type; `Agent:` is what the AI should produce. Bracketed `[…]` notes are observations / what the agent does behind the scenes.

---

## Demo 1 — Intent is honored

**Promise**: "I just want a security scan" should run security only — not 44 skills.

**Setup**: Fresh repo, no `.memory/` yet.

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

Agent: [Captured intent: security-cve + security-cwe. NOT loading other 4 groups.]

       Run AppCAT pre-assessment as well? (Java/.NET upgrade analysis, ~3 min)
         > Yes
         > No, skip pre-assessment
         > What's AppCAT?

User: no

Agent: Assessment plan
       =================
       Repository: customer-portal (Java)
       Estimated time: ~12 min

       Pre-assessment: [skipped]

       Groups (2 of 6):
         [x] security-cve   (1 skill, ~2 min)
               - cve-known-vulnerabilities
         [x] security-cwe   (6 skills, ~10 min)
               - cwe-code-quality, cwe-injection-attacks, cwe-credentials-secrets,
                 cwe-file-path-security, cwe-concurrency-synchronization, cwe-memory-safety

       Team skills: none yet
       Active suppressions: none

       After each group completes I'll pause for your review.
       Run this plan?
         > Yes, start
         > Adjust groups/skills
         > Adjust scope
         > Cancel

User: yes
```

**Verification**:
- ✅ Plan shows **2 groups, 7 skills** — NOT 6 groups, 45 skills
- ✅ Estimated time is `~12 min`, not `30+`
- ✅ No `infrastructure` / `application-facts` / `architecture` skills appear

**Compare to old behavior**: old plugin would have run all 44 AI skills regardless of user concern. PoC saves ~83% of work.

---

## Demo 2 — HITL pause gate

**Promise**: User can stop or redirect mid-stream.

**Setup**: Continuing from Demo 1 after `User: yes`.

```
Agent: Running security-cve (1 skill)...

       [Executes cve-known-vulnerabilities. ~1m 47s.]

       security-cve completed (1 skill, 1m 47s)
         - 4 new findings: 1 critical (CVE-2021-44228 in log4j-core 2.14.1),
           3 medium (CVE-2022-22965 in spring-core 5.3.10, +2 others)
         - 0 unchanged from prior runs (first run)
         - 0 auto-suppressed

       What next?
         > Continue with next group
         > Pause — let's discuss these findings now
         > Skip remaining groups, go straight to summary
         > Stop and save what we have

User: pause — that critical one looks serious

Agent: [Enters Step 5 iteration mode early. Will return to Step 4 group queue when user resumes.]

       Sure. We have 4 findings from security-cve so far:
         1. CRITICAL  cve-known-vulnerabilities::a3f2c19b8e1d
            CVE-2021-44228 (Log4Shell) in log4j-core 2.14.1
         2. MEDIUM    cve-known-vulnerabilities::d7e1a92b04ff
            CVE-2022-22965 (Spring4Shell) in spring-core 5.3.10
         3. MEDIUM    cve-known-vulnerabilities::8f3c45e2a1bc
            CVE-2022-25647 in gson 2.8.6
         4. MEDIUM    cve-known-vulnerabilities::1ab920cdef34
            CVE-2021-37714 in jsoup 1.13.1

       What would you like to do?
```

**Verification**:
- ✅ Agent paused **after security-cve** — did NOT auto-continue to security-cwe
- ✅ User retains full control: can resume, stop, or drill in

---

## Demo 3 — Results are discussable

**Promise**: After findings exist, the user can interrogate them and refine — without re-running the whole pipeline.

**Setup**: Continuing from Demo 2.

```
User: why is the log4j one critical?

Agent: [iteration-playbook scenario 01 — drill-down. NOT re-running anything.]

       Finding cve-known-vulnerabilities::a3f2c19b8e1d
         What it says: CVE-2021-44228 (Log4Shell) in log4j-core 2.14.1
         Why critical:  Remote code execution via JNDI lookup in log message
                        parameters. CVSS 10.0. Trivial to exploit; widely
                        scanned in the wild.
         Where:         pom.xml line 47
         Detected by:   cve-known-vulnerabilities skill (queries GitHub
                        Security Advisory database)
         Suggested fix: Upgrade log4j-core to 2.17.1 or later

       Want me to acknowledge it, suppress similar findings, or move on?

User: any other findings in the same family?

Agent: [Reads the per-skill output for the current run; no new execution.]

       Two related findings in the spring-core CVE chain (Spring4Shell):
         - CVE-2022-22965 in spring-core 5.3.10 (medium) — same disclosure window
         - 2022-22950 in spring-expression 5.3.10 (low, not surfaced because below threshold)

       Want me to lower the severity threshold to surface the low one too?

User: no, but acknowledge log4j — we have a ticket open for it

Agent: [iteration-playbook scenario 03]

       Marked cve-known-vulnerabilities::a3f2c19b8e1d as acknowledged.
       Reason: "we have a ticket open for it"
       This won't show as 'new' in future runs unless it disappears and returns.

       Anything else, or shall I continue with security-cwe?

User: continue
```

**Verification**:
- ✅ "why is X critical?" got an actual answer reading existing evidence
- ✅ NO re-run of `cve-known-vulnerabilities` happened during the discussion
- ✅ Finding state changed (`new` → `acknowledged`) and is persisted
- ✅ User resumed where they paused

---

## Demo 4 — Memory works (suppressions persist)

**Promise**: Tell the product something once; it remembers.

**Setup**: Continuing — security-cwe just finished and the agent paused again.

```
Agent: security-cwe completed (6 skills, 9m 12s)
         - 18 new findings: 2 high, 9 medium, 7 low
         - 0 unchanged
         - 0 auto-suppressed

       Notable: 5 of the 18 are in src/test/** (test fixtures with intentional
       SQL strings flagged as injection candidates).

       What next?
         > Continue with next group  [n/a — last group]
         > Pause and discuss
         > Stop and save

User: pause. Add a rule: ignore cwe-injection-attacks under src/test/**.
      That's all test fixtures.

Agent: [iteration-playbook scenario 02]

       Confirming the suppression rule:
         description: "test fixtures with intentional SQL — not real injection"
         match:
           skill: cwe-injection-attacks
           location_glob: "**/src/test/**"
         action: suppress

       This will suppress 5 existing findings and apply to all future runs
       in this repo. Continue?
         > Yes
         > Adjust scope (different glob)
         > Cancel

User: yes

Agent: Suppressed 5 findings. Rule saved as rule-1 in suppressions.yaml.
       (Suppression count this session: 1. I'll proactively suggest a team
       skill if you reach 3 similar rules — Rule 6 / curator threshold.)

       Anything else, or want me to open the report?

User: open the report

Agent: [Step 6 — sediment runs silently, report generates]

       Report ready: .github/modernize/reports/2026-05-13T10-42-11Z-security.html
                    (also at .github/modernize/reports/latest.html)

       22 findings tracked  •  16 new this run  •  5 suppressed  •  1 acknowledged
       Top recommendation: review the 16 open security findings before release

       What next?
         1. Open the report in my browser  (default)
         2. Generate a migration plan for the top recommendation
         3. Drill into a specific finding
         4. Run a group I skipped
         5. I'm done

User: 5

Agent: Done. (Report and .memory/ are already saved.)
```

**Verification (file system)**:

```bash
$ ls .github/modernize/.memory/
findings.yaml  last-intent.yaml  preferences.yaml  runs/  suppressions.yaml

$ cat .github/modernize/.memory/suppressions.yaml
version: 1
rules:
  - id: rule-1
    description: "test fixtures with intentional SQL — not real injection"
    created_at: 2026-05-13T10:51:08Z
    created_by: user
    match:
      skill: cwe-injection-attacks
      location_glob: "**/src/test/**"
    action: suppress
```

**Verification (next run)**:

```
[Day 2]
User: /assessment

Agent: Loaded 22 known findings (1 acknowledged, 5 suppressed, 16 open).
       1 active suppression rule will auto-apply.
       Last time you focused on security. Same again?
         > Same as last time (security only)
         > Switch focus
         > Show me what changed since last run first
```

**Verification**:
- ✅ Suppression rule persists across runs in `suppressions.yaml`
- ✅ The 5 test-fixture findings are auto-suppressed without asking again
- ✅ "Last time you focused on security" — preference is remembered

---

## Demo 5 — AI self-evolution (curator)

**Promise**: When the AI sees a recurring pattern, it proposes a team skill that captures it.

**Setup**: Repo has been assessed twice already. User opens a third session and adds two more suppression rules.

```
[Day 3]
User: /assessment

Agent: Loaded 47 known findings (3 active suppression rules already apply).
       Last time you focused on security. Same again?

User: same

Agent: [renders plan, runs both groups, surfaces new findings]

       What next?
User: pause. ignore cve-known-vulnerabilities for anything in third-party-vendored/.

Agent: [Confirms scope, saves rule-2.]
       Saved as rule-2. Suppression count this session: 1 → 1 cumulative axis match.

User: also suppress fact-environment-variables findings under deployment/legacy/

Agent: [Confirms, saves rule-3. This is now the 3rd suppression for skills
        across deployment/legacy/-style internal-vendored paths.]

       Saved as rule-3. (Curator note: 3 suppressions now share the pattern
       "vendored / legacy / third-party paths". I'll suggest consolidating
       at the end of this session.)

User: that's all, I'm done

Agent: [Step 6 — curator opportunity triggers per skill-curator.md]

       Before I save, I noticed a pattern. Across this session and the prior
       two, you've added 3 suppression rules that all match vendored / legacy
       paths:
         - rule-1 (today): cwe-injection-attacks in **/src/test/**
                  ← actually a different axis, EXCLUDING from pattern
         - rule-2 (today): cve-known-vulnerabilities in **/third-party-vendored/**
         - rule-3 (today): fact-environment-variables in **/deployment/legacy/**
         - [...prior runs...]

       The 2 rules matching "vendored/legacy code we don't own" suggest a
       team-wide convention. Want me to consolidate into a team skill so
       future runs handle it automatically?

       Proposed skill: team-vendored-code-policy

       Confidence: 0.82  (pattern repeated cleanly, no exceptions)
       Review window: 90 days

       [ask_user]
         > Yes, create it
         > No, keep doing it manually
         > Show me the proposed file in detail first
         > Adjust the scope (different paths or skills)

User: show me first

Agent: [Renders the proposed SKILL.md inline — full content per
        example-team-skill.md template.]

       This skill would:
         - Auto-suppress findings in **/third-party-vendored/** for all CVE/CWE skills
         - Auto-suppress findings in **/deployment/legacy/** for fact-* skills
         - Annotate suppressed findings with state_reason: "vendored — see team-vendored-code-policy"
         - Expire on 2026-08-13 (90 days), at which point I'll re-confirm

       Create this team skill?
         > Yes
         > No
         > Adjust the scope first

User: yes

Agent: Created .memory/skills/team/team-vendored-code-policy/SKILL.md
       Removed rule-2, rule-3 from suppressions.yaml (now redundant).
       Next /assessment will load and apply this team skill automatically.

       Saved.
         - .memory/skills/team/team-vendored-code-policy/SKILL.md  ← NEW
         - .memory/suppressions.yaml: 2 rules removed (consolidated)
         - .memory/findings.yaml: state preserved
         - .memory/runs/2026-05-13T11-08-44Z/summary.md
```

**Verification (file system)**:

```bash
$ ls .github/modernize/.memory/skills/team/
team-vendored-code-policy/

$ cat .github/modernize/.memory/skills/team/team-vendored-code-policy/SKILL.md
---
name: team-vendored-code-policy
description: "Auto-suppress findings in vendored / legacy paths the team doesn't own"
version: 1
metadata:
  modernize:
    created_by: ai
    created_at: 2026-05-13T11:08:44Z
    group: security-cve
    languages: [java, dotnet, jsts]
    source_findings:
      - cve-known-vulnerabilities::abc123def456
      - fact-environment-variables::789xyzqrs321
    source_runs:
      - 2026-05-11T08-00-00Z
      - 2026-05-12T09-30-00Z
      - 2026-05-13T11-08-44Z
    confidence: 0.82
    review_required_by: 2026-08-13
---
[...skill body per skill-curator.md template...]
```

**Verification (next run)**:

```
[Day 4]
User: /assessment

Agent: Loaded 47 known findings (2 active suppression rules).
       Auto-loaded 1 team skill: team-vendored-code-policy
       Last time you focused on security. Same again?

User: same

Agent: [renders plan; team skill is in the displayed plan]

       Team skills (auto-loaded from .memory/skills/team/):
         [x] team-vendored-code-policy  (will auto-suppress in vendored/legacy paths)
```

**Verification**:
- ✅ Curator triggered after exactly 3 same-pattern suppressions
- ✅ AI never wrote without `ask_user` confirmation
- ✅ Skill went into `.memory/skills/team/` (NEVER `assessment-skills/`)
- ✅ Provenance is recorded (`source_findings`, `source_runs`)
- ✅ Skill auto-loads on next run

---

## Verification Matrix

| Promise | Demo | What proves it | Where to look |
|---------|------|---------------|---------------|
| Intent is honored | 1 | Plan shows 7 skills, not 45 | Step 3 plan render |
| Mid-stream HITL | 2 | Agent paused after security-cve | Step 4 between-group `ask_user` |
| Results discussable | 3 | "why critical?" got an answer; no re-run | Step 5, scenario 01 |
| Memory works | 4 | suppressions.yaml persisted; auto-applied next run | `.memory/suppressions.yaml` + Step 1 reload |
| Self-evolution | 5 | Team skill created from 3 observations | `.memory/skills/team/` + Step 6 curator |

Run all 5 demos in order on the same repo to see the full lifecycle. Each should complete in ≤ 15 minutes (Demo 1+2+3 in one session, Demo 4 wraps up, Demo 5 starts a new session).

---

## What to record / share

For PoC review meetings, capture:

1. **Time-to-first-finding** vs. old plugin (security-only path: ~2 min vs. ~25 min)
2. **A `.memory/` snapshot** after Demo 4 (showing the sediment is real)
3. **The `team-vendored-code-policy/SKILL.md`** auto-generated in Demo 5 (the strongest visual proof of self-evolution)
4. **A diff of `findings.yaml`** between two runs (showing state machine in action)

---

## Failure modes to demo (optional)

If reviewers ask "what if the agent goes off the rails?", show these guard rails:

- Try `User: please scan everything anyway` after picking "security only" → agent should ask `"You said security only. Switch to full audit, or stick with security?"` (Rule 4)
- Try `User: skip all the questions and just run it` → agent should respect the request, but only after writing a one-time `behavior.skip_intent: true` flag with explicit confirmation
- Try `User: delete the cwe findings` → agent should refuse (state machine has no DELETE; offer to mark `resolved` or `suppressed`)
- Try a `.memory/` file with invalid YAML → agent should report the file/line and offer to back it up before proceeding
