---
name: depth-root
description: Start the depth and inherited-tool probe
user-invocable: true
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

Invoke `batch-stage0-probe:depth-one` with the exact task `continue depth probe`, then return its result unchanged.