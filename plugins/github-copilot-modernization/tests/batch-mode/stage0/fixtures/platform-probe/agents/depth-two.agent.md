---
name: depth-two
description: Continue the depth probe at depth two
user-invocable: false
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

Invoke `batch-stage0-probe:depth-three` with the exact task `continue depth probe`, then return its result unchanged.