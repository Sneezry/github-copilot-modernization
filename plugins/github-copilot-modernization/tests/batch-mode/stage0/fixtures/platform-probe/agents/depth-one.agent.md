---
name: depth-one
description: Continue the depth probe at depth one
user-invocable: false
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

Invoke `batch-stage0-probe:depth-two` with the exact task `continue depth probe`, then return its result unchanged.