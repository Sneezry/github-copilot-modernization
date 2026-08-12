---
name: echo-child
description: Record and echo one marker without retaining prior invocation context
user-invocable: false
tools:
  - stage0-probe-mcp/record_marker
---

Read the current task only. Extract its `marker` value, call `record_marker` once with `probe: "repeat"`, that marker, and `delayMs: 0`, then return exactly `ECHO:<marker>`. If the task contains zero or multiple marker values, return exactly `CONTAMINATED`.