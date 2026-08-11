# Skill Groups — Semantic Bundling of Assessment Skills

> **Purpose**: Map the 45 atomic assessment-skills into 6 user-facing semantic groups. The user picks groups (or drills down to individual skills); the agent translates that intent into the exact skill list to execute.

> **Source of truth for the skill list**: [`skills-java.md`](skills-java.md), [`skills-dotnet.md`](skills-dotnet.md), [`skills-jsts.md`](skills-jsts.md). When those reference files add or remove a skill, update this document.

## Why groups?

The previous assess pipeline was all-or-nothing (`AiAnalysis: yes` ran every skill, `no` ran none). Users almost never want "everything". They want:

- "I just had a CVE alert — only run security."
- "We're planning containerization — focus on infra and runtime."
- "We just want a baseline architecture diagram."

Groups are the user-facing vocabulary. Skills are the implementation.

---

## The 6 Groups

| Group ID | Display Name | What it answers | Time tier¹ | Network² |
|----------|--------------|-----------------|------------|----------|
| `security-cve` | Known Vulnerabilities | "Are any of my dependencies known to be vulnerable?" | light | yes (GitHub Advisory API) |
| `security-cwe` | Code Weakness Patterns | "Does my source code contain known dangerous patterns?" | medium | no |
| `architecture` | Architecture & Dependencies | "What does this system look like? What does it depend on?" | light | no |
| `infrastructure` | Container, Orchestration, Runtime | "How is this packaged and deployed?" | medium | no |
| `configuration` | Config, Env, Health | "How is this configured at runtime?" | light | no |
| `application-facts` | Application Metadata | "What kind of application is this? Who/what does it talk to?" | medium | no |

¹ **Time tiers** (per repo, rough): `light` ≤ 5 min · `medium` ≤ 15 min · `heavy` ≤ 30 min. The whole pipeline timeout is 10 min/skill but groups bundle multiple skills.

² **Network**: whether the group hits external APIs. `security-cve` requires `GITHUB_TOKEN` for authenticated rate limits; without it the API still works but quotas are tight.

---

## Group → Skill Mapping

The mapping below covers Java (the richest catalog). For .NET / JS-TS, see the language-specific reference files and intersect — skills not present in that language's catalog are silently dropped from the group.

### `security-cve` — Known Vulnerabilities

| Skill | Notes |
|-------|-------|
| `cve-known-vulnerabilities` | Java only today; .NET/JSTS skip silently |

Security results are normalized immediately by the parent assessment's `record-result` contract. No separate merge skill runs.

### `security-cwe` — Code Weakness Patterns

| Skill | Notes |
|-------|-------|
| `cwe-code-quality` | Initialization, type conversion, resource leaks (16 CWE rules) |
| `cwe-concurrency-synchronization` | Race conditions, deadlocks |
| `cwe-credentials-secrets` | Hardcoded passwords, exposed keys |
| `cwe-file-path-security` | Path traversal, unsafe file ops |
| `cwe-injection-attacks` | SQL/command/LDAP injection |
| `cwe-memory-safety` | Unsafe memory access (mostly .NET / native interop) |

### `architecture` — Architecture & Dependencies

| Skill | Notes |
|-------|-------|
| `architecture-diagram` | Two Mermaid diagrams: app layers + component relationships |
| `dependency-map` | Categorized dependency Mermaid graph |
| `fact-architecture-pattern` | Detected pattern (monolith, microservice, layered, etc.) |
| `fact-communication-protocols` | HTTP/gRPC/MQ/etc. |

### `infrastructure` — Container, Orchestration, Runtime

| Skill | Notes |
|-------|-------|
| `fact-container-engine` | Docker, Podman, etc. |
| `fact-base-image` | Base image identity + version |
| `fact-image-size` | Image bloat indicator |
| `fact-image-layers` | Layer count / structure |
| `fact-multi-stage-build` | Multi-stage detected? |
| `fact-container-version` | Container runtime version pinning |
| `fact-volume-mounts` | Mount points / persistence |
| `fact-orchestration-tool` | Kubernetes, Compose, Nomad |
| `fact-service-definition` | Service manifests |
| `fact-resource-limits` | CPU / memory limits |
| `fact-network-settings` | Ports, networks, ingress |
| `fact-runtime-environment` | JDK / .NET / Node version |
| `fact-servlet-container` | Tomcat / Jetty / etc. (Java) |
| `fact-operating-system` | Target OS |
| `fact-hardware-requirements` | Declared resource needs |
| `fact-system-packages` | OS-level packages |

### `configuration` — Config, Env, Health

| Skill | Notes |
|-------|-------|
| `fact-environment-variables` | Required env vars |
| `fact-xml-configs` | XML config files (Spring etc.) |
| `fact-profile-settings` | Active profiles / environments |
| `fact-startup-instrumentation` | Startup hooks, agents |
| `fact-health-checks` | Liveness / readiness endpoints |

### `application-facts` — Application Metadata

| Skill | Notes |
|-------|-------|
| `fact-application-name` | Detected app name + confidence |
| `fact-application-type` | Web / batch / CLI / library |
| `fact-application-port` | Listening port(s) |
| `fact-version-information` | App version |
| `fact-data-classification` | Data sensitivity hints |
| `fact-compliance-requirements` | Compliance markers (HIPAA, PCI, etc.) |
| `fact-external-services` | Third-party services consumed |
| `fact-external-dependencies` | Cross-process deps |
| `fact-language-dependencies` | Lockfile-based dep inventory |
| `fact-embedded-language-usage` | Embedded scripts (JS in JSP, etc.) |
| `fact-security-implementation` | Auth/authz scaffolding present |
| `fact-licensing-information` | License headers / SPDX |
| `fact-testing-framework` | JUnit / NUnit / Jest / etc. |

---

## Intent → Group Mapping (for the agent)

When the user says... | Default groups | Notes
---|---|---
"security" / "vulnerabilities" / "audit" | `security-cve` + `security-cwe` | Skip CVE if no `GITHUB_TOKEN`
"upgrade" / "modernize" / "migrate" | `application-facts` + `infrastructure` + `configuration` + `architecture` | AppCAT pre-assessment also runs for Java/.NET (invoked directly — see [pre-assessment-java.md](pre-assessment-java.md) / [pre-assessment-dotnet.md](pre-assessment-dotnet.md))
"cloud" / "containerize" / "kubernetes" / "azure" | `infrastructure` + `configuration` + `application-facts` | AppCAT also if Java/.NET
"architecture" / "diagram" / "understand the codebase" | `architecture` + `application-facts` | Cheapest path to "what is this thing"
"quick scan" / "fast" / "smoke" | `architecture` + `security-cve` | Two cheapest groups
"full" / "everything" / "audit" | all 6 | Default for first-time runs
"baseline" / "snapshot" | `architecture` + `application-facts` | For diffing later

---

## Drill-Down: Add / Remove Individual Skills

After the user picks groups, the agent MUST offer drill-down:

> "Selected groups expand to 28 skills. Want to add/remove specific ones? (say 'show list' or 'looks good')"

If the user wants to customize:
1. Render the resolved skill list with checkboxes (`[x]` / `[ ]`)
2. Accept `+skill-id` / `-skill-id` directives
3. Store the diff in `.memory/last-intent.yaml` under `skill_overrides:`

Persist the customization so subsequent runs honor it without re-asking.

---

## Team Skill Loading

In addition to the standard groups, the agent MUST scan `.github/modernize/.memory/skills/team/` and append any team-defined skills found there. These are AI-curated mini-skills (see [skill-curator.md](skill-curator.md)) that capture team-specific conventions (e.g. "we have 5 internal libraries with custom version policy").

Team skills are appended to whichever group their frontmatter declares (`metadata.modernize.group:`). If no group is declared, attach to `application-facts`.

---

## Cost Estimation

When showing the plan to the user (Step 3 of [SKILL.md](../SKILL.md)), give a rough total:

```
sum(skill.tier_minutes for skill in selected_skills)
where light=2, medium=8, heavy=20
```

Then divide by `min(selected_skill_count, 12)` to account for the max-12 parallelism. Display as "~N min on a single repo".
