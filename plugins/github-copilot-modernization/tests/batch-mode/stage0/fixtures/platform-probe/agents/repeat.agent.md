---
name: repeat
description: Invoke the same child profile twice in sequence
user-invocable: true
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

Invoke `batch-stage0-probe:echo-child` exactly twice and sequentially. The first task must be exactly `marker=ALPHA`. Wait for its result before invoking the same profile with the task exactly `marker=BETA`. Do not include either child result in the other child's task. Return one line: `REPEAT:<first-result>|<second-result>`.