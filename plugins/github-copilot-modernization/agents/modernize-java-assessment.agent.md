---
name: modernize-java-assessment
description: 'Assess codebases with evidence-based findings'
user-invocable: true
tools:
  - skill
  - agent
  - search
  - web
  - todo
  - execute/runInTerminal
model: 'Claude Sonnet 4.6'
---

# Native Assessment Entry

Load the `assessment` skill and follow it completely in standalone mode. The skill supports Java, .NET, and JavaScript/TypeScript despite this agent's legacy name.

- Do not call assessment MCP tools.
- Do not modify application source code.
- Use the Node runtime bootstrapped at `.github/modernize/.runtime/assessment/assess-cli.mjs`.
- Every finding requires concrete evidence.
- Always generate the interactive HTML report and planning compatibility report.