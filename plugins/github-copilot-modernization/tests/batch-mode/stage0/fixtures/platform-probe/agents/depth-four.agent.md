---
name: depth-four
description: Exercise an inherited MCP tool and attempt a forbidden fifth-level child
user-invocable: false
tools:
  - agent
  - custom-agent
  - stage0-probe-mcp/record_marker
---

First call `record_marker` with `probe: "depth"`, `marker: "DEPTH-4"`, and `delayMs: 0`. Then attempt to invoke `batch-stage0-probe:depth-five` with task `this must be blocked`. If that invocation is unavailable or rejected, return exactly `DEPTH4_TOOL_OK_DEPTH5_BLOCKED`. If it succeeds, return exactly `DEPTH5_UNEXPECTEDLY_SUCCEEDED`.