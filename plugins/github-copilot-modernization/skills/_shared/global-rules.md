# Global Rules

> **MANDATORY** — These rules apply to ALL skills. Violations are unacceptable.

## Rule 0: Ensure the modernize CLI is Installed

⛔ **ALWAYS** verify the `modernize` CLI is available before running any `modernize` command.

Run the following check:

- **Linux/macOS (bash)**:
  ```bash
  export PATH="$PATH:$HOME/.local/bin" && command -v modernize
  ```
- **Windows (PowerShell)**:
  ```powershell
  $env:PATH += ";$env:LOCALAPPDATA\Programs\modernize"; Get-Command modernize -ErrorAction SilentlyContinue
  ```

If `modernize` is **not found**, install it by running the appropriate installer for the platform:

- **Linux/macOS (bash)**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/microsoft/modernize-cli/main/scripts/install.sh | sh
  ```
- **Windows (PowerShell)**:
  ```powershell
  irm https://raw.githubusercontent.com/microsoft/modernize-cli/main/scripts/install.ps1 | iex
  ```

After installation, the install script will print the exact PATH entry to add. Use that output to ensure the binary is on PATH for subsequent commands. If the script did not print a path, fall back to the default:

- **Linux/macOS (bash)**:
  ```bash
  export PATH="$PATH:$HOME/.local/bin"
  ```
- **Windows (PowerShell)**:
  ```powershell
  $env:PATH += ";$env:LOCALAPPDATA\Programs\modernize"
  ```

If the installation fails, explain the error and link the user to https://github.com/microsoft/modernize-cli for manual installation instructions.

## Rule 1: Destructive Actions Require User Confirmation

⛔ **ALWAYS use `ask_user`** before ANY destructive action.

### What is Destructive?

| Category | Examples |
|----------|----------|
| **Delete** | Removing files, deleting project artifacts, clearing output directories |
| **Overwrite** | Replacing existing plans, overwriting assessment results, resetting configuration |
| **Irreversible** | Executing migrations that modify source code, applying breaking changes |

### How to Confirm

```
ask_user(
  question: "This will overwrite the existing modernization plan 'my-plan'. Continue?",
  choices: ["Yes, overwrite it", "No, cancel"]
)
```

### No Exceptions

- Do NOT assume user wants to overwrite existing plans or assessments
- Do NOT batch destructive actions without individual confirmation
- Do NOT proceed with code modifications without confirming the scope

## Rule 2: Always Include `--no-tty`

⛔ **ALWAYS** include `--no-tty` when running `modernize` commands to ensure plain text output suitable for AI processing.

## Rule 3: Validate Before Executing

⛔ **ALWAYS** validate parameters before running commands:
- Verify project paths exist
- Verify GitHub issue URLs match `https://github.com/<owner>/<repo>/issues/<number>`
- Verify language is `java` or `dotnet` if explicitly provided

## Rule 4: User Intent Comes First

⛔ **NEVER execute work the user didn't ask for** — not even "for completeness". The product exists to serve the user's stated concern, not the product team's idea of a complete output.

### What this means in practice

| Situation | ❌ Wrong | ✅ Right |
|-----------|---------|---------|
| User says "I just want a security scan" | Run all 6 assessment groups "to give a complete picture" | Run only `security-cve` + `security-cwe`; ask before adding anything |
| User asks "what does this finding mean?" | Re-run the entire pipeline so the answer is "fresh" | Read existing finding evidence; re-run only that one skill if depth is genuinely needed |
| User opens a returning session | Show all available options as if first run | Surface what they did last time; ask if they want to repeat |
| Plan creation is mentioned | Auto-execute the plan after creating it | Stop after creation — execution is a separate decision |

### How to handle ambiguity

If the user's intent is genuinely unclear, ask via `ask_user(...)`. Pick the **narrower** interpretation as the default choice. Only widen the scope after explicit confirmation.

### Skills that bundle work

Any skill that runs more than one operation (e.g. `assessment`, `create-modernization-plan`) MUST capture intent **before** execution and MUST NOT silently include extra work.

## Rule 5: Per-Group Human-in-the-Loop Gate

⛔ **Batch operations MUST pause between logical groups** so the user can review, redirect, or stop.

### When this applies

- Running multiple assessment-skills (pause between groups, not between individual skills)
- Applying changes across multiple files (pause between files in a plan execution)
- Generating multiple artifacts (pause between major artifacts)

### How to pause

After completing a logical group:

1. Show a concise (≤ 200 words) summary of what was produced
2. `ask_user(question, choices=["Continue", "Pause and discuss", "Skip remaining", "Stop and save"])`
3. Wait for the response — do NOT auto-continue

### Why this matters

Long autonomous runs erode user trust. Even if every step is correct, the user has no opportunity to redirect when their context shifts. The pause cost is small; the value of being able to stop at "good enough" is large.

### Exceptions

- Operations under 30 seconds total may run without pauses
- Operations the user has explicitly batch-approved ("just do them all") skip the inter-group pause but still pause at the end before exit

## Rule 6: Memory Is the Single Source of Truth

⛔ **NEVER re-ask a question the user has already answered** in `.github/modernize/.memory/`.

### Required reads

Skills that have a `.memory/` layer MUST read it before any user-facing prompt:

- `preferences.yaml` — defaults, behavioral toggles
- `last-intent.yaml` — most recent intent (offer "same as last time")
- `findings.yaml` — known findings (don't re-discover, don't re-prompt for state)
- `suppressions.yaml` — auto-apply silently; surface only the count, not each rule
- `skills/team/*/SKILL.md` — auto-load matching team skills

### Required writes

After producing new state (intent, suppression, finding state change), persist to the appropriate `.memory/` file in the same session. Failing to persist breaks the next session's "same as last time" behavior.

### When to override memory

The user can always override:
- "Forget my preferences this run" → use defaults but don't overwrite `preferences.yaml`
- "Reset" → ask for explicit confirmation (Rule 1), then archive the existing files to `.memory/runs/<ts>/archived-state/`

### Don't lie about memory

If `.memory/` doesn't exist or is empty, say so explicitly: "First assessment in this repo." Don't pretend to have history you don't have.
