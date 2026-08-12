---
name: depth-one-missing-tool
description: Remove the MCP tool before continuing the depth probe
user-invocable: false
tools:
  - agent
  - custom-agent
---

Invoke `batch-stage0-probe:depth-two` with the exact task `continue depth probe without inherited MCP`, then return its result unchanged.