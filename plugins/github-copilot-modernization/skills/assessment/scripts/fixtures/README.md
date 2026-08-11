# Assess Report Fixtures

> Hand-crafted `.memory/` snapshots used for local UI / template iteration of the assess HTML report.
>
> These are **NOT** real assessment runs. They exist so contributors can render the report end-to-end without standing up a Java/.NET project, installing AppCAT, and running the full pipeline.

## Available fixtures

| Fixture | Describes | Use it to verify |
|---------|-----------|------------------|
| `acme-orders/` | A mid-sized Spring Boot 2.7 service. 12 findings across security / cloud-readiness / code-quality / inventory. Includes a hand-written `enrichment.yaml`. | The full "AI-narrated" view — briefing, headlines, change narrative, themed cards, related-knowledge drawer, next-step action cards. |

## How to render a fixture

```bash
node .github/modernize/.runtime/assessment/assess-cli.mjs generate-report \
  --memory-dir plugins/modernization/skills/assessment/scripts/fixtures/acme-orders/.memory \
  --run-id    2026-05-20T14-22-11Z \
  --output-dir /tmp/report-preview \
  --project-root /tmp/fake-acme-orders

# Windows
start "" /tmp/report-preview/latest.html
# macOS
open /tmp/report-preview/latest.html
# Linux
xdg-open /tmp/report-preview/latest.html
```

`--enrichment` defaults to `<memory-dir>/runs/<run-id>/enrichment.yaml`, so pass nothing to use the fixture's hand-written one; pass `--enrichment /dev/null` (or `NUL` on Windows) to exercise the degraded raw-data view.

## What's inside a fixture

```
<fixture>/.memory/
├── findings.yaml              # fact layer
├── suppressions.yaml          # one rule, to exercise § appendix
├── preferences.yaml           # minimal — drives nothing visible
└── runs/
    └── <run-id>/
        ├── intent.yaml
        ├── selected-skills.yaml
        └── enrichment.yaml    # narrative layer (AI-authored in production)
```

## When to add a new fixture

Add one when:

- A new section of the report needs a degenerate input (e.g. "0 findings", "all info-level", "no prior run") that the existing fixtures don't cover, AND
- The case is awkward to construct on the fly during template development.

Otherwise, modify an existing fixture. Keep the count of fixtures small — they are documentation, not test data.
