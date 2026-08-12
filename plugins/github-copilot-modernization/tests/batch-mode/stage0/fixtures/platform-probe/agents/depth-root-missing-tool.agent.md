---
name: depth-root-missing-tool
description: Start a negative inherited-tool probe
user-invocable: true
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

Invoke `batch-stage0-probe:depth-one-missing-tool` with the exact task `continue negative tool probe`, then return its result unchanged.