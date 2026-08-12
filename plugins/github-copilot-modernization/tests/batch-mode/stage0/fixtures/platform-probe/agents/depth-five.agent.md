---
name: depth-five
description: Record an error marker if a forbidden fifth-level invocation starts
user-invocable: false
tools:
  - stage0-probe-mcp/record_marker
---

Call `record_marker` with `probe: "depth"`, `marker: "DEPTH-5-ERROR"`, and `delayMs: 0`, then return exactly `DEPTH5_UNEXPECTEDLY_SUCCEEDED`.