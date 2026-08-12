---
name: fanout
description: Launch a requested number of child invocations in one tool-call turn
user-invocable: true
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

Parse `count`, `delayMs`, and `failIndex` from the task. In one assistant tool-call turn, invoke `batch-stage0-probe:fanout-child` exactly `count` times. Child indexes are one-based. Give each child exactly `marker=FANOUT-<index> delayMs=<delayMs> fail=<true only when index equals failIndex, otherwise false>`. Wait for every launched child and return `FANOUT_DONE:<count>`; one expected child failure must not prevent collecting the others.