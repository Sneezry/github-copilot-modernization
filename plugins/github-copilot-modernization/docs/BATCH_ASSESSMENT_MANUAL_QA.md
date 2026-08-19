# Batch Assessment Manual QA Guide

> Scope: Stage 1B local, sequential, whole-repository Batch Assessment
>
> Entry point: `github-copilot-modernization:modernize` only
>
> Last verified: 2026-08-19

This guide gives QA a repeatable manual acceptance procedure for the packaged Batch Assessment product path:

```text
modernize -> workspace mode -> Batch Review -> Start/Cancel -> sequential Assessment -> aggregate report
```

The procedure intentionally checks user-visible behavior and persisted evidence. Agent prose alone is never sufficient evidence of success.

## 1. Release Acceptance Summary

The release passes manual QA when all required cases in this guide pass:

| ID | Scenario | Required |
|---|---|---|
| QA-01 | Default config asks Batch or Single first | Yes |
| QA-02 | Single selection creates no Batch execution artifacts | Yes |
| QA-03 | Batch Review is separate from Start approval | Yes |
| QA-04 | Cancel creates no execution state or user report | Yes |
| QA-05 | Two repositories complete sequentially | Yes |
| QA-06 | Aggregate report and summaries are complete | Yes |
| QA-07 | Explicit Single Assessment options are preserved | Yes |
| QA-08 | One repository failure does not stop the next repository | Yes |
| QA-09 | Mixed-language execution units fail closed | Yes |
| QA-10 | `include_paths` execution fails before control state creation | Yes |
| QA-11 | Batch Planning and Execution are rejected | Yes |
| QA-12 | Windows and POSIX product-host evidence pass | Release QA |
| QA-13 | Two real Java repositories pass without source changes | Release QA |

## 2. Prerequisites

Install or verify:

- Git
- Node.js 18 or newer
- GitHub Copilot CLI with an authenticated entitlement
- Network access to the npm registry for the JavaScript/TypeScript dependency assessment
- For QA-13 only: JDK 17, Maven 3.9+, and AppCAT 7.7.0.8 or newer

From the repository root, run:

```powershell
git branch --show-current
node --version
git --version
copilot --version
copilot --help | Select-String "plugin-dir"
```

Expected:

- The intended test branch is shown.
- Node.js is version 18 or newer.
- Copilot CLI reports a version and does not report an authentication error.
- `--plugin-dir` is supported.

Set reusable paths:

```powershell
$RepoRoot = (git rev-parse --show-toplevel).Trim()
$PluginRoot = Join-Path $RepoRoot "plugins\github-copilot-modernization"
$QaRoot = Join-Path $env:TEMP "batch-assessment-manual-qa"
$Model = "gpt-5-mini"
```

Record the product package digest in the test report:

```powershell
node --input-type=module -e "import { validateProductPackage } from './plugins/github-copilot-modernization/tests/batch-mode/stage1b/product-probe.mjs'; console.log(validateProductPackage().sha256)"
```

## 3. Create The Test Portfolio

The following helper creates two small, clean JavaScript repositories under one launch root. Use only a disposable path.

```powershell
function New-BatchQaFixture {
    param(
        [Parameter(Mandatory)] [string] $Root,
        [ValidateSet("normal", "bootstrap-failure", "mixed-language")]
        [string] $Variant = "normal"
    )

    Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue
    New-Item $Root -ItemType Directory -Force | Out-Null

    $repos = @()
    foreach ($name in @("alpha-service", "beta-service")) {
        $repo = Join-Path $Root "repos\$name"
        New-Item (Join-Path $repo "src") -ItemType Directory -Force | Out-Null
        @{ name = $name; version = "1.0.0"; private = $true } |
            ConvertTo-Json | Set-Content (Join-Path $repo "package.json")
        "export const repositoryName = '$name';" |
            Set-Content (Join-Path $repo "src\index.js")

        if ($Variant -eq "bootstrap-failure" -and $name -eq "alpha-service") {
            New-Item (Join-Path $repo ".github\modernize") -ItemType Directory -Force | Out-Null
            "blocks the Assessment runtime directory" |
                Set-Content (Join-Path $repo ".github\modernize\.runtime")
        }

        if ($Variant -eq "mixed-language") {
            "<project />" | Set-Content (Join-Path $repo "pom.xml")
        }

        git -C $repo init --quiet
        git -C $repo config user.name "Batch Manual QA"
        git -C $repo config user.email "batch-manual-qa@example.invalid"
        git -C $repo add --all
        git -C $repo commit --quiet -m "Initialize QA fixture"
        $repos += @{ name = $name; path = $repo }
    }

    $configDir = Join-Path $Root ".github\modernize"
    New-Item $configDir -ItemType Directory -Force | Out-Null
    @{ repos = $repos } | ConvertTo-Json -Depth 5 |
        Set-Content (Join-Path $configDir "repos.json")
}

New-BatchQaFixture -Root $QaRoot
```

Verify the fixture:

```powershell
Get-Content (Join-Path $QaRoot ".github\modernize\repos.json")
git -C (Join-Path $QaRoot "repos\alpha-service") status --short
git -C (Join-Path $QaRoot "repos\beta-service") status --short
```

Expected: both Git status commands return no output.

## 4. Start A Manual Product Session

Start a fresh Copilot CLI process for each test case:

```powershell
copilot -C $QaRoot `
    --plugin-dir $PluginRoot `
    --agent=github-copilot-modernization:modernize `
    --model $Model `
    --allow-all-tools `
    --disable-builtin-mcps `
    --no-custom-instructions `
    --no-remote `
    --no-remote-export `
    --no-auto-update
```

Only invoke `modernize`. Seeing or being instructed to invoke `batch-review`, `batch-coordinator`, or `batch-assessment` directly is a failure.

If the host displays structured choices, click the exact choice. If structured choices are unavailable, enter the documented choice as a separate user turn with no additional text.

## 5. Reset Between Cases

Close the current Copilot CLI session, then reset only the disposable fixture:

```powershell
Remove-Item (Join-Path $QaRoot ".github\modernize\batches") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $QaRoot ".github\modernize\assessment") -Recurse -Force -ErrorAction SilentlyContinue

foreach ($name in @("alpha-service", "beta-service")) {
    $repo = Join-Path $QaRoot "repos\$name"
    git -C $repo clean -fdx -- .github
}
```

Recreate the fixture instead of resetting it after QA-08, QA-09, or QA-10 because those cases intentionally change tracked fixture files.

## 6. QA-01: Workspace Mode Is The First Question

1. Create a normal fixture and start a fresh product session.
2. Enter:

   ```text
   Assess for cloud readiness using issue-only coverage.
   ```

3. Observe the first user-visible question.

Pass criteria:

- The product asks exactly whether to **Process repositories from repos.json** or **Only process the current repository**.
- The question appears before repository inspection, Review, Assessment, or any other action routing.
- Merely having `repos.json` does not silently select Batch.

Fail if Assessment starts, a Review appears, or repository files are inspected before this choice.

## 7. QA-02: Single Selection Is Isolated

1. Continue QA-01 by selecting **Only process the current repository**.
2. The product may report that the launch root itself has no supported project; that is acceptable for this routing case.
3. Verify no Batch artifacts exist:

   ```powershell
   Test-Path (Join-Path $QaRoot ".github\modernize\batches")
   Test-Path (Join-Path $QaRoot ".github\modernize\assessment")
   ```

Pass criteria:

- The product identifies the classic Single route.
- Both commands return `False`.
- No `batch-review`, `batch-coordinator`, or `batch-assessment` execution is visible.

## 8. QA-03: Review And Start Are Separate

1. Reset and start a new session.
2. Enter the QA-01 prompt.
3. Select **Process repositories from repos.json**.
4. Wait for the Review, but do not select Start yet.
5. Locate the newest Review root:

   ```powershell
   $BatchRoot = Get-ChildItem (Join-Path $QaRoot ".github\modernize\batches") -Directory |
       Sort-Object LastWriteTime -Descending |
       Select-Object -First 1 -ExpandProperty FullName
   Get-ChildItem $BatchRoot -Force
   ```

Pass criteria before Start:

- The Review lists both repositories, detected language, effective domains, coverage, and sequential scheduling.
- The product asks separately for **Start batch** or **Cancel**.
- The Review root contains `review.json`, `REVIEW.md`, and `scratch/`.
- It does not contain `manifest.json`, `state.json`, `lease.json`, `attempts/`, `selection.json`, or `assessment-input.json`.

## 9. QA-04: Cancel Creates No Execution State

1. Continue QA-03 by selecting **Cancel**.
2. Re-list the Review root.
3. Check the user report directory:

   ```powershell
   Get-ChildItem $BatchRoot -Force
   Test-Path (Join-Path $QaRoot ".github\modernize\assessment")
   ```

Pass criteria:

- The session stops without dispatching an Assessment.
- No manifest, state, lease, attempt, finalization, or aggregate report exists.
- Review artifacts remain available for audit.

## 10. QA-05 And QA-07: Successful Sequential Batch With Explicit Options

This case uses visible sentinel values to verify exact configuration propagation through Review, request, report, and aggregate metadata. It does not assert that `java-21` is a meaningful runtime target for the JavaScript fixture.

1. Reset and start a new session.
2. Enter:

   ```text
   Assess all configured repositories for cloud readiness using issue-only coverage.
   Set targetRuntime to java-21, targetComputeServices to azure-container-apps,
   enableContainerization to true, targetOS to linux,
   minimumCveSeverity to high, and cveScanScope to all.
   ```

3. Select **Process repositories from repos.json**.
4. Inspect the Review and confirm all six explicit options are shown exactly.
5. Select **Start batch**.
6. In a second terminal, locate the newest Batch root and watch `state.json`:

   ```powershell
   $BatchRoot = Get-ChildItem (Join-Path $QaRoot ".github\modernize\batches") -Directory |
       Sort-Object LastWriteTime -Descending |
       Select-Object -First 1 -ExpandProperty FullName
   Get-Content (Join-Path $BatchRoot "state.json")
   ```

7. Wait for the CLI to return the final report link.

Pass criteria:

- At most one execution unit is `running` at any time.
- Every execution unit has `attempt: 1` and a different `invocationId`.
- The second repository starts only after the first repository has `finishedAt`.
- Final state is `completed` or `completed_with_issues` with two usable repository results.
- JavaScript/TypeScript repositories report `planningSupported: false` without degrading a successful Assessment.
- The final response links `index.html` before private Batch diagnostics.

Verify the effective options in all three authorities:

```powershell
$review = Get-Content (Join-Path $BatchRoot "review.json") -Raw | ConvertFrom-Json
$requests = Get-ChildItem (Join-Path $BatchRoot "attempts") -Recurse -Filter request.json |
    ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json }
$reportRoot = $review.launchRoot | ForEach-Object {
    Get-ChildItem (Join-Path $_ ".github\modernize\assessment") -Directory -Filter "reports-*" |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
$aggregate = Get-Content (Join-Path $reportRoot "aggregate-report.json") -Raw | ConvertFrom-Json
$extension = $aggregate.extensions.'github-copilot-modernization'

$review.decisions
$requests.decisions
$extension.assessmentConfig
```

Pass: all explicitly supplied values are present and equal. Omitted values must not be invented.

## 11. QA-06: Aggregate Delivery And Summary Semantics

Use the completed QA-05 run.

1. Verify the report tree:

   ```powershell
   Get-ChildItem $reportRoot -Recurse | Select-Object FullName
   ```

2. Verify aggregate fields:

   ```powershell
   $extension.counts
   $extension.planningSupported
   $extension.topRecommendations
   $extension.repositories |
       Select-Object identity, status, language, planningSupported, topRecommendation
   ```

Pass criteria:

- `index.html` and `aggregate-report.json` exist.
- `repos/<identity>/report.json` and `report.html` exist for each usable repository.
- `counts.total` is 2.
- `counts.bySeverity` and `counts.byState` are present and equal the sum of repository values.
- Every usable repository has one top recommendation.
- `planningSupported` reports two unsupported JavaScript/TypeScript repositories.
- `finalization.json` records report-directory, index, aggregate, and summary digests.
- `summary.json`, `summary.md`, and the dashboard present consistent counts.

Open `index.html` in a browser and verify:

- both repositories are visible;
- status, language, findings, recommendation, Planning support, and report links fit without overlap;
- each report link opens the corresponding repository snapshot.

## 12. Verify Application Source Was Not Modified

After every successful or failed Batch run:

```powershell
git -C (Join-Path $QaRoot "repos\alpha-service") status --short --untracked-files=no
git -C (Join-Path $QaRoot "repos\beta-service") status --short --untracked-files=no
```

Pass: both commands return no output. Generated untracked `.github/modernize` files are allowed; tracked application source and build manifests must not change.

## 13. QA-08: Natural Failure Continues To The Next Repository

1. Create a dedicated failure fixture:

   ```powershell
   $FailureRoot = Join-Path $env:TEMP "batch-assessment-manual-failure"
   New-BatchQaFixture -Root $FailureRoot -Variant bootstrap-failure
   ```

2. Start `modernize` with `-C $FailureRoot` and the same local plugin options.
3. Request cloud-readiness Batch Assessment.
4. Select **Process repositories from repos.json**, then **Start batch**.
5. Wait for finalization.

Pass criteria:

- `alpha-service` reaches `failed` or `protocol_error` because `.runtime` is a file.
- The failure is committed before `beta-service` starts.
- `beta-service` completes or completes with issues.
- Overall status is truthful (`completed_with_issues` for one usable result).
- The aggregate contains no fake report snapshot for the failed repository.
- The dashboard and summary expose the first actionable error.
- Both fixture repositories remain clean for tracked files.

## 14. QA-09: Mixed-Language Units Fail Closed

1. Create a dedicated mixed-language fixture:

   ```powershell
   $MixedRoot = Join-Path $env:TEMP "batch-assessment-manual-mixed"
   New-BatchQaFixture -Root $MixedRoot -Variant mixed-language
   ```

2. Start `modernize` with `-C $MixedRoot`.
3. Request Batch Assessment and select **Process repositories from repos.json**.

Pass criteria:

- Review status is blocked.
- Each blocked unit lists both `java` and `javascript`.
- The reason states that mixed-language execution units are unsupported.
- No Start approval is offered.
- No `manifest.json`, `state.json`, `lease.json`, or `attempts/` is created.

## 15. QA-10: `include_paths` Fails Before State Creation

1. Create a normal dedicated fixture.
2. Add a recognized nested project to both repositories and commit it:

   ```powershell
   $IncludeRoot = Join-Path $env:TEMP "batch-assessment-manual-include"
   New-BatchQaFixture -Root $IncludeRoot

   foreach ($name in @("alpha-service", "beta-service")) {
       $repo = Join-Path $IncludeRoot "repos\$name"
       New-Item (Join-Path $repo "services\api") -ItemType Directory -Force | Out-Null
       @{ name = "$name-api"; version = "1.0.0"; private = $true } |
           ConvertTo-Json | Set-Content (Join-Path $repo "services\api\package.json")
       git -C $repo add --all
       git -C $repo commit --quiet -m "Add nested project"
   }

   $configPath = Join-Path $IncludeRoot ".github\modernize\repos.json"
   $config = Get-Content $configPath -Raw | ConvertFrom-Json
   foreach ($repo in $config.repos) {
       $repo | Add-Member -NotePropertyName include_paths -NotePropertyValue @("services/api")
   }
   $config | ConvertTo-Json -Depth 6 | Set-Content $configPath
   ```

3. Start `modernize`, select Batch, inspect the Review, and select **Start batch** if offered.

Pass criteria:

- Initialization rejects `include-path` execution units.
- No manifest, state, lease, or attempt is created.
- No repository Assessment is dispatched.
- The error clearly states that Stage 1B supports whole repositories only.

## 16. QA-11: Unsupported Batch Actions

Run each prompt in a fresh session:

```text
Plan modernization changes for all repositories in repos.json.
```

```text
Execute modernization changes for all repositories in repos.json.
```

When asked, select **Process repositories from repos.json**.

Pass criteria for both prompts:

- The product states that Stage 1B supports Batch Assessment only.
- It performs no Review, Assessment, Planning, or Execution work.
- It creates no Batch artifacts and does not modify any repository.

## 17. QA-12: Cross-Platform Product-Host Evidence

Run from the repository root on Windows and again on a POSIX host with an authenticated Copilot CLI:

```powershell
node plugins/github-copilot-modernization/tests/batch-mode/stage1b/product-scenario-runner.mjs --model gpt-5-mini
```

If the same platform, CLI version, model, and package digest already have valid evidence, QA may use:

```powershell
node plugins/github-copilot-modernization/tests/batch-mode/stage1b/product-scenario-runner.mjs --model gpt-5-mini --resume
```

Expected evidence files:

```text
plugins/github-copilot-modernization/tests/batch-mode/stage1b/evidence/
├── product-probe.win32-x64.json
└── product-probe.linux-x64.json
```

Pass criteria:

- Both top-level statuses are `passed`.
- Both evidence files record the same `productPackage.sha256`.
- Single, Batch, Cancel, unsupported Planning, unsupported Execution, and natural failure continuation are `passed`.
- Missing-result and partial permission probes may be `not_supported` only when deterministic control-plane evidence is `passed`.
- `failed`, `blocked`, or `incomplete` is a release failure.

Validate each platform's evidence:

```powershell
node --test plugins/github-copilot-modernization/tests/batch-mode/stage1b/product-scenario-runner.test.mjs
```

## 18. QA-13: Real Java Repository Acceptance

Prepare a `repos.json` containing exactly two clean root Maven projects with absolute paths. Both repositories must be under the selected launch root.

Record the Java toolchain first:

```powershell
java -version
mvn --version
appcat version
```

Pass: JDK 17, Maven 3.9 or newer, and AppCAT 7.7.0.8 or newer are available in the same shell that will start the runner.

Example:

```json
{
  "repos": [
    { "name": "spring-petclinic", "path": "C:\\src\\spring-petclinic" },
    { "name": "airsonic-advanced", "path": "C:\\src\\airsonic-advanced" }
  ]
}
```

Run:

```powershell
$LaunchRoot = "C:\src"
$ConfigPath = "C:\src\qa\repos.json"
$EvidencePath = Join-Path $PluginRoot "tests\batch-mode\stage1b\evidence\real-repositories.win32-x64.json"

node (Join-Path $PluginRoot "tests\batch-mode\stage1b\real-repository-runner.mjs") `
    --launch-root $LaunchRoot `
    --config $ConfigPath `
    --output $EvidencePath `
    --model $Model
```

Pass criteria:

- Top-level evidence status is `passed`.
- Both repositories produce usable compatibility, HTML, and AppCAT reports.
- The attempts are strictly sequential.
- Aggregate report and finalization digests validate.
- Source canaries match and `trackedFilesUnchanged` is `true`.

## 19. POSIX Notes

Run the same product-host probe natively on POSIX. For a manual fixture, equivalent setup is:

```bash
export REPO_ROOT="$(git rev-parse --show-toplevel)"
export PLUGIN_ROOT="$REPO_ROOT/plugins/github-copilot-modernization"
export QA_ROOT="${TMPDIR:-/tmp}/batch-assessment-manual-qa"
rm -rf "$QA_ROOT"

for name in alpha-service beta-service; do
  repo="$QA_ROOT/repos/$name"
  mkdir -p "$repo/src"
  printf '{"name":"%s","version":"1.0.0","private":true}\n' "$name" > "$repo/package.json"
  printf 'export const repositoryName = %s;\n' "\"$name\"" > "$repo/src/index.js"
  git -C "$repo" init --quiet
  git -C "$repo" config user.name "Batch Manual QA"
  git -C "$repo" config user.email "batch-manual-qa@example.invalid"
  git -C "$repo" add --all
  git -C "$repo" commit --quiet -m "Initialize QA fixture"
done

mkdir -p "$QA_ROOT/.github/modernize"
node -e 'const fs=require("fs"),p=require("path"),r=process.env.QA_ROOT; const repos=["alpha-service","beta-service"].map(name=>({name,path:p.join(r,"repos",name)})); fs.writeFileSync(p.join(r,".github","modernize","repos.json"),JSON.stringify({repos},null,2)+"\n")'

copilot -C "$QA_ROOT" \
  --plugin-dir "$PLUGIN_ROOT" \
  --agent=github-copilot-modernization:modernize \
  --model gpt-5-mini \
  --allow-all-tools \
  --disable-builtin-mcps \
  --no-custom-instructions \
  --no-remote \
  --no-remote-export \
  --no-auto-update
```

On WSL, authenticate the Linux Copilot CLI separately from Windows before testing.

## 20. Full Regression

Before signing off, run all plugin tests:

```powershell
$tests = Get-ChildItem -Path plugins/github-copilot-modernization -Recurse -Filter *.test.mjs |
    ForEach-Object { $_.FullName }
node --test $tests
```

Pass criteria:

- Zero failed tests.
- Every skip has an explicit platform/tooling reason.
- The recorded product-host evidence test passes on Windows and POSIX.

## 21. Defect Report Checklist

Attach the following to any defect:

- OS and architecture
- Node.js and Copilot CLI versions
- Model name
- Product package digest
- Exact user turns and selected choices
- Whether approval was structured or exact-turn fallback
- Sanitized `review.json`, `state.json`, `summary.json`, and `finalization.json`
- Relevant `events.jsonl` entries
- Aggregate report path and digest
- Evidence JSON for automated product-host failures
- `git status --short --untracked-files=no` for affected repositories

Do not attach credentials, lease tokens, authenticated Git URLs, or unsanitized environment dumps.

## 22. Final Sign-Off

QA may sign off only when:

- all required manual cases pass;
- Windows and POSIX product-host evidence are `passed` for the same package digest;
- real Java repository acceptance is `passed` on that digest;
- full regression has zero failures;
- tracked application files and product README files remain unchanged;
- no Batch lease worker remains after completion.
