---
name: depth-three
description: Continue the depth probe at depth three
user-invocable: false
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

Invoke `batch-stage0-probe:depth-four` with the exact task `finish depth probe`, then return its result unchanged.