# Batch Mode 实施计划与风险评估

> 状态：Stage 1B 功能实现完成，但私有预览交付 No-Go；Stage 2 尚未开始
>
> 创建日期：2026-08-12
>
> 设计基线：`BATCH_MODE_DESIGN.md`
>
> 设计基线 SHA-256：`06E99B12BF05523FE0978E10F85AE5A7C6237B9E0A8286DB5C725DE6BF479750`
>
> 问题台账：`BATCH_MODE_OPEN_ISSUES.md`
>
> 问题台账 SHA-256：`E8809135B6F4BEA73C0CB455A1CB3172551EAB9384F44B5CEAF7A961EFC2323D`
>
> 交付评审与整改计划：`BATCH_ASSESSMENT_DELIVERY_READINESS.md`

## 1. 目的与结论

本文把 Batch Mode 设计转换为可分阶段实施、验证和回滚的工程计划，并独立记录实施风险。它不修改或替代设计基线；设计问题仍只在问题台账中跟踪。

总体判断：

- 完整 Batch Mode 是新的执行控制平面，不是小型 UI 增强。
- 若采用独立 batch 路径、显式门禁和 batch-only 工件，现有 single-repository 功能的回归风险可控制在中低水平。
- Batch Assessment 可以作为首个用户可见切片，综合风险为中等。
- 当前 Stage 1B 只达到功能实现完成；成功证据、崩溃一致性、产品链路 E2E 和 `include_paths` 读取边界通过前，不得发布私有预览。
- Batch Planning 涉及交互协议和计划版本化，风险较高。
- Batch Execution 涉及代码修改、分支、提交、中断和重试，是最高风险阶段；不得与 Batch Assessment 同批交付。
- 在对应 open issue 关闭前，不得以“实现时再处理”为理由绕过阶段 Gate。

推荐交付方式：

1. 先建立 single mode 回归基线和平台 Gate。
2. 在不接入 `modernize` 的情况下实现确定性 batch 控制层。
3. 以显式预览门禁接入顺序执行的 Batch Assessment。
4. 单独实现持久化 `NeedsInput` 后再开放 Batch Planning。
5. 仅对 allowlist 中已证明 batch-safe 的 worker 开放 Batch Execution。
6. 最后才启用完整 Assessment → Planning → Execution 流水线和可选增强。

## 2. 风险评级方法

本文使用五级实施风险：

| 等级 | 含义 |
|---|---|
| 1 - Low | 新增且隔离；失败不会改变现有用户流程。 |
| 2 - Guarded | 接触共享入口或工件，但有简单、确定的回滚点。 |
| 3 - Medium | 修改共享 skill 契约或增加持久状态；需要集成测试。 |
| 4 - High | 改变交互、计划或 worker 契约；可能回归 single mode。 |
| 5 - Critical | 修改代码工作区、分支和恢复语义；错误可造成重复或冲突修改。 |

工作量只使用相对大小，不承诺日历时间：

- S：单一模块和窄测试面。
- M：多个相关模块，有集成测试。
- L：跨 agent/skill/script 契约。
- XL：跨阶段状态、工具和破坏性执行路径。

## 3. 实施原则

### 3.1 保护现有功能

- Single mode 保持当前 coordinator、用户确认和仓库内工件位置。
- Batch 路由只在用户明确表达多仓范围，或在配置存在时明确选择 batch 后生效。
- 新 batch 组件全部设置为内部能力，不新增用户可调用 agent。
- 不以重写现有三个 coordinator 作为 Batch 的起点。
- 新参数必须可选；参数缺省时严格保持现有行为。
- Batch 路由最后接入，而不是第一个提交。

### 3.2 控制平面与业务执行分离

- `batch-coordinator` 只处理配置、状态、调度、用户决策和摘要。
- 配置解析、路径检查、schema 校验、lease 和状态转换由确定性脚本实现。
- Batch phase agent 只处理一个 execution unit、一个 phase、一个 attempt。
- Agent 自然语言返回不作为成功证据。
- Batch owner token 不传给 phase agent；子 agent 只能提交 attempt-scoped result。

### 3.3 能力逐阶段开放

- Stage 1 只开放 Assessment，不修改代码。
- Stage 2 只生成计划，不自动进入 Execution。
- Stage 3 只开放 batch-safe allowlist，不支持 rearchitecture。
- 未 attempt-scoped 的 Deployment 工件不支持自动重试。
- 未经单独批准，不开放跨仓库 Execution 并发。

### 3.4 已有技术边界

- Assessment 完全本地运行，不引入 Assessment MCP。
- Assessment 任务清单保持六个 fact skill 和七个顶层 security skill。
- 并发值是上限，不是正确性前提；必须支持 wave 和串行降级。
- Plugin 不依赖外部 `modernize` CLI。
- `plugin.json` 的用户入口、`.mcp.json` 和现有 SessionStart hook 默认不修改。

## 4. 现有功能影响评估

| 现有表面 | 当前行为 | Batch 所需变化 | 隔离策略 | 风险 |
|---|---|---|---|---|
| `agents/modernize.agent.md` | 所有请求进入 single-repository 路由 | 在现有意图路由前增加范围判定 | 最后接入；只增加明确 batch 分支；single golden tests | 2 |
| `agents/assessment-coordinator.agent.md` | 单仓 Assessment coordinator | Batch 不需要修改它 | 新建 `batch-assessment`，直接复用 assessment skill | 1 |
| `skills/assessment/` | 单仓本地 Assessment，已有 `batch-headless` | 增加 attempt-scoped scratch、可配置并发和结构化结果 | 所有新增参数可选，默认路径和行为不变 | 3 |
| `agents/planning-coordinator.agent.md` | 可直接询问用户并生成单仓计划 | Batch 需要无交互预检、`NeedsInput` 和唯一计划名 | 新建 `batch-planning` adapter；不复用 coordinator 的问答循环 | 4 |
| `skills/create-modernization-plan/` | `ask_user` 可用时交互；不可用时可能使用默认值 | Batch 不得静默使用需要确认的默认值 | 显式 invocation mode 或 batch-only preflight；默认 single 行为不变 | 4 |
| `agents/execution-coordinator.agent.md` | 把 worker 返回视为最终结果 | Batch 必须验证工件和 success criteria | 新建 `batch-execution`；不修改现有 coordinator 的完成语义 | 5 |
| Specialized workers | 可能询问、建分支、提交并写固定路径 | Batch 必须无交互、可验证、可防重 | 只允许 batch-safe profile；逐个认证，不全量复用 | 5 |
| SessionStart hook | Bootstrap 单仓 Assessment runtime | 目标仓需显式 bootstrap | 保持 hook 不变，由 `batch-assessment` 调用现有 bootstrap | 1 |
| Repo-local artifacts | 当前 single 报告、计划和执行工件 | Batch 需要 attempt metadata 和索引 | Batch 状态单独写入启动目录；不迁移 single 工件 | 2 |
| `plugin.json` / `.mcp.json` | 声明现有 agents、skills、hooks 和 MCP | 无结构变化要求 | 保持不变 | 1 |

## 5. Open Issue 前置 Gate

| Issue | 最晚关闭阶段 | Gate 结果 |
|---|---|---|
| BM-001 Takeover fencing | Stage 1B 恢复能力前；Stage 3 前强制关闭 | 未关闭时禁止 takeover 后启动新 attempt。 |
| BM-002 `include_paths` scope | Stage 1B 前 | 未关闭时拒绝带多个或非根 scope 的执行单元，不做 best effort。 |
| BM-003 Assessment concurrency | Stage 1B 前 | 未关闭时只允许串行调度，不依赖六/七路同时启动。 |
| BM-004 `NeedsInput` protocol | Stage 2 前 | 未关闭时不开放 Batch Planning/Execution。 |
| BM-005 Pause signaling | Stage 1B GA 前 | 未关闭时只支持 invocation 边界暂停，不宣称运行中正常暂停。 |
| BM-006 Workspace/Git safety | Stage 1A 路径预检前 | 未关闭时不 clone、不接受外部绝对路径。 |
| BM-007 Retry/result semantics | Stage 1B retry 前 | 未关闭时不提供终态仓库 retry。 |
| BM-008 Assessment result evidence | Stage 1B private preview 前 | 未关闭时不接受任何成功终态。 |
| BM-009 Attempt crash consistency | Stage 1B private preview 前 | 未关闭时不发布跨session可见的成功摘要。 |
| BM-010 Production agent E2E | Stage 1B private preview 前 | 未关闭时只视为组件实现，不视为产品可交付。 |

## 6. 分阶段实施计划

### Stage 0：回归基线与平台 Gate

**目标**

证明宿主能力和现有 single mode 行为，冻结 Batch 实现所依赖的契约。

**风险 / 工作量：2 - Guarded / M**

**任务**

- [x] IP-001 建立 single mode 路由 fixtures：无配置、显式当前仓库、显式 Assessment、明确单任务、多任务和执行已有计划。
- [x] IP-002 建立 single mode 工件基线：Assessment report、plan/tasks兼容位置、Execution summary 与现有确认点。
- [x] IP-003 自动验证同一 internal agent profile 可在一个顶层调用中重复调用至少两次且 context 不串仓库。
- [x] IP-004 验证 depth 4、父子工具继承和 depth 4 禁止继续派生。
- [x] IP-005 验证 1、2、6、7 路 Assessment fan-out、宿主 throttling 和部分 launch 失败行为。
- [x] IP-006 为每个 `BM-NNN` 记录决策或明确 capability defer；不直接修改设计基线。
- [x] IP-007 定义版本化 schema：resolved repos、execution unit、attempt request/result、state、event、question/answer。

**实施结果（2026-08-12）：Completed**

- Stage 0 contract tests：16通过，0失败。
- Copilot CLI 1.0.79真实探针：重复profile、depth 4 MCP、depth 5阻止、父级工具过滤、1/2/6/7路fan-out和单点失败全部取得有效证据。
- 相同2路fan-out在不同运行中既出现串行也出现重叠，证明调度并发不稳定；capacity必须是上限并支持串行降级，具体单次观测以证据文件为准。
- 可运行plugin回归：53通过，1个平台相关测试跳过，0失败。
- 既有telemetry集成测试未计入可运行回归：它要求当前仓库不存在的`mcp-server/dist/entrypoints/telemetrySender.js`构建产物。
- 证据：`tests/batch-mode/stage0/evidence/platform-probe.json`。

**退出 Gate**

- Single mode golden tests 全部通过。
- 重复 subagent、depth 和工具继承探针通过。
- 并发降级到 1 时 Assessment 结果契约不变。
- Stage 1A 所需的 BM-003、BM-006 已 `Decided` 或 `Closed`。

**回滚点**

此阶段不接入用户路由，只新增测试和协议草案；删除新增工件即可回滚。

### Stage 1A：确定性 Batch 控制层

**目标**

在不调用任何业务 agent、不修改任何应用仓库的情况下完成配置、预检、状态和结果协议。

**风险 / 工作量：2 - Guarded / L**

**新增组件**

```text
skills/batch-modernization/
├── SKILL.md
├── references/
│   ├── phase-contract.md
│   └── repos-json-compatibility.md
├── schemas/
│   ├── attempt-request.schema.json
│   ├── attempt-result.schema.json
│   ├── batch-state.schema.json
│   └── needs-input.schema.json
└── scripts/
    ├── resolve-repos.mjs
    ├── inspect-workspaces.mjs
    ├── validate-result.mjs
    └── batch-state.mjs
```

**任务**

- [x] IP-101 实现 v1/v2 `repos.json` 解析、大小写不敏感名称唯一性和未知字段保留。
- [x] IP-102 实现 URL/path/branch/apps 预检和完整错误定位。
- [x] IP-103 实现 `realpath` containment、symlink/junction/reparse-point规则和 URL脱敏。
- [x] IP-104 使用临时目录 clone，成功后原子 rename；失败清理不阻塞重试。
- [x] IP-105 引入稳定 `executionUnitId`，与 `repoId` 分离。
- [x] IP-106 实现 manifest/state/repo/event/summary 原子更新和 schema migration 拒绝策略。
- [x] IP-107 实现 lease acquire/release/CAS takeover，但在 BM-001 关闭前不允许 takeover 后调度。
- [x] IP-108 实现 result schema、路径边界和 phase evidence validator。
- [x] IP-109 使用临时 fixture 仓库完成跨平台 Node 单元测试和并发状态测试。

**实施结果（2026-08-12）：Completed**

- 新增顶层内部skill：`skills/batch-modernization/`；未新增agent，未接入`modernize`路由。
- v1/v2配置、execution-unit、路径/Git预检、原子clone、状态/lease/takeover、结果证据校验均由本地Node实现，不调用agent或MCP。
- Takeover lease强制只读；旧owner和takeover owner都不能在接管后写入或调度。
- Stage 1A skill tests：42通过，0失败。
- BM-006已关闭；BM-002已取得execution-unit隔离、canonical scope和同Git-root串行的实现证据，但因缺少真实phase-agent sibling读取边界证据而在交付评审中重开。

**退出 Gate**

- 所有控制层测试不需要 agent 或 MCP。
- 任意无效 result、越界路径和错误 owner token 均 fail closed。
- 两个进程竞争 lease 时仅一个成功。
- 配置、状态和日志中不出现 URL credential、query、fragment secret。
- 尚未修改 `modernize.agent.md`。

**回滚点**

控制层仍未接入入口。删除 `batch-modernization` skill 不影响 single mode。

### Stage 1B：私有预览 Batch Assessment（功能实现完成，交付 No-Go）

**目标**

顺序处理多个仓库并生成现有 HTML 与 compatibility report；不生成计划，不修改应用代码。

**风险 / 工作量：3 - Medium / L**

**新增组件**

- `agents/batch-coordinator.agent.md`
- `agents/batch-assessment.agent.md`

**最小现有文件修改**

- `skills/assessment/SKILL.md`：补齐 batch result 与 capacity contract。
- `skills/assessment/scripts/assessment-catalog.mjs`：增加可选 attempt scratch root 和 concurrency ceiling；缺省值保持现状。
- `skills/assessment/scripts/assess-cli.mjs`：透传可选 batch参数；现有命令保持兼容。
- `agents/modernize.agent.md`：仅在所有 Stage 1B Gate 通过后增加显式 batch预览路由。

**任务**

- [x] IP-201 `batch-assessment` 每次只接收一个 execution unit 和一个 attempt request。
- [x] IP-202 每个 attempt 使用独立 scratch；验证成功后只链接现有版本化报告。
- [x] IP-203 Scheduler 把 catalog concurrency 作为上限，支持 wave 和 `maxConcurrency=1`。
- [x] IP-204 每个目标仓库显式 bootstrap Assessment runtime，不修改 SessionStart hook。
- [x] IP-205 实现 missing/malformed task result → partial/ProtocolError 的确定性映射。
- [x] IP-206 首次预览只支持显式 batch意图；不因检测到配置而改变模糊 single请求。
- [x] IP-207 先支持无恢复的顺序运行；fencing通过后再开放 takeover/resume。
- [x] IP-208 验证 Java、.NET、JavaScript/TypeScript 混合仓库及 partial failure。

**实施结果（2026-08-17）：Functionally Completed / Delivery No-Go**

- 新增内部`batch-review`、`batch-coordinator`和`batch-assessment`；顶层`modernize`拥有结构化`ask_user`，nested agents不请求该工具，phase agent每次只消费一个不可变`request.json`。
- `batch-attempt.mjs`实现初始化、attempt启动、无owner-token结果发布、证据提交、ProtocolError映射、聚合摘要和lease释放。
- Assessment新增可选attempt scratch与1至7并发上限；省略参数时single路径、工件位置和6/7默认上限保持不变。
- `modernize`只对明确`repos.json`、multiple/all/selected repositories或batch assessment意图委托一次；配置存在本身不会触发batch。
- Java、.NET、TypeScript混合批次验证成功；partial结果继续聚合，TypeScript可完成Assessment并记录`planningSupported: false`。
- 同Git root的多个include-path execution unit保持请求、scratch、result和报告隔离，且任意时刻只允许一个active attempt。
- BM-003关闭；BM-002因缺少真实phase-agent sibling读取边界证据而重开。BM-001仍为Deferred，因此不开放takeover后调度、resume或retry。
- 插件`*.test.mjs`回归：143通过、0失败、1个Windows条件性跳过；Stage 1B harness为33通过、0失败；改动文件诊断为0。
- DQ-003 product probe、真实仓库 runner、artifact/report完整性 validator和Windows/Ubuntu workflow已实现。Windows Retry 10 已通过真实双仓正向链路：2/2 completed、严格串行、Spring 11 findings、Airsonic 34 findings、报告完整且tracked files unchanged。当前package的5个正向/路由探针通过，但natural child failure注入和两个ACP permission-event场景为`not_supported`，POSIX也未执行，因此DQ-003/BM-010仍未关闭。

**功能实现 Gate（已通过）**

- 两个仓库产生独立 invocation、scratch 和 report链接。
- `maxConcurrency=1` 与平台允许的较高上限生成等价结果集合。
- Assessment 调用链不存在 Assessment MCP。
- 全部现有 single Assessment测试和 golden tests通过。

**交付 Gate（未通过）**

- `BATCH_ASSESSMENT_DELIVERY_READINESS.md`中的P0 Workstream A-D尚未完成。
- BM-002、BM-008、BM-009、BM-010尚未全部关闭。
- Windows已有通过的真实`modernize -> batch-review -> batch-coordinator -> batch-assessment`正向E2E；但负向failure matrix及POSIX证据未完成，尚不满足跨平台产品链路Gate。
- 若开放takeover/resume，仍必须先关闭BM-001。

**发布与回滚**

- 首次发布只允许显式 batch请求进入预览路径。
- Batch失败不得 fallback为 `modernize` 或 coordinator自行评估。
- 回滚只需关闭/移除 batch路由；repo-local Assessment工件仍可由 single mode读取。

### Stage 2：Batch Planning

**目标**

对选中 Assessment成功子集逐仓生成独立、可验证且不覆盖旧文件的计划。

**风险 / 工作量：4 - High / L**

**新增组件**

- `agents/batch-planning.agent.md`
- Batch-only planning preflight/adapter

**任务**

- [ ] IP-301 完成版本化 question/answer schema、稳定 question ID、source attempt绑定和答案校验。
- [ ] IP-302 增加 `AwaitingInput` batch状态，并定义等待时释放/reacquire lease语义。
- [ ] IP-303 在调用 plan skill 前确定性检测多 solution、rulebook冲突、覆盖风险和双 tasks文件冲突。
- [ ] IP-304 每个 attempt 使用唯一 plan名称；默认不覆盖任何现有 plan。
- [ ] IP-305 Batch planning agent静态排除 `ask_user`，所有问题写入 `NeedsInput` result。
- [ ] IP-306 验证 `plan.md` 和唯一有效 tasks文件；禁止把 agent文本当成功。
- [ ] IP-307 保持现有 `planning-coordinator` 和 single mode问答路径不变。
- [ ] IP-308 Planning完成后停止，只展示成功子集和风险；不自动执行。

**退出 Gate**

- BM-004、BM-007 已关闭。
- Pending questions跨顶层 session可恢复，过期答案被拒绝。
- 多 solution不静默选择，现有 plan不被覆盖。
- Single Planning golden tests无变化。

**回滚点**

关闭 Batch Planning动作后，Batch Assessment仍可独立使用；已生成计划仍是正常repo-local计划。

### Stage 3：受限 Batch Execution

**目标**

只对已经认证的 batch-safe worker执行同一个明确任务或已有计划，并以工件证据判定结果。

**风险 / 工作量：5 - Critical / XL**

**新增组件**

- `agents/batch-execution.agent.md`
- Batch-safe worker profiles或batch-only adapters
- Execution evidence validators

**任务**

- [ ] IP-401 建立 task-type/language/depth allowlist；未知任务 fail closed。
- [ ] IP-402 为每个候选 worker审计交互、分支、提交、固定路径、helper深度和工具需求。
- [ ] IP-403 禁止直接复用“worker返回即完成”的现有 execution coordinator语义。
- [ ] IP-404 在批次 Review前确定 branch/dirty-workspace策略和用户批准范围。
- [ ] IP-405 每个 worker使用 attempt-scoped执行证据；repo-local最终工件保留兼容链接。
- [ ] IP-406 验证 task终态、summary、build/test或明确豁免，并与 success criteria对齐。
- [ ] IP-407 对同一Git root强制串行和side-effect fence；旧worker存活时不启动新attempt。
- [ ] IP-408 首版排除 rearchitecture；Deployment未attempt-scoped时不提供自动重试。
- [ ] IP-409 验证 `--allow-all` 不等于用户批准Execution。
- [ ] IP-410 使用可丢弃fixture仓库完成中断、失败、dirty workspace和重复attempt测试。

**退出 Gate**

- BM-001、BM-002、BM-004、BM-006、BM-007 全部关闭。
- 每个allowlist worker均有独立batch-safety认证测试。
- 强制中断时不会并发修改同一worktree。
- Result validator能拒绝伪成功、缺失summary、失败build/test和错误工件路径。
- Single Execution coordinator和workers回归测试全部通过。

**发布与回滚**

- 每种worker能力独立开放，不使用一个全局“Execution已支持”开关。
- 关闭某个allowlist项不会影响其他Batch动作或single mode。
- 不自动回滚应用改动；失败时保留分支、commit和证据，由用户决定后续处理。

### Stage 4：完整流水线与可选增强

**目标**

在前三阶段稳定后连接 Assessment → Planning → Execution，并按设计增加非核心能力。

**风险 / 工作量：4 - High / L**

**任务**

- [ ] IP-501 每阶段独立Review、批准和成功子集推进。
- [ ] IP-502 验证跨阶段 scope、HEAD、dirty状态和工件未漂移。
- [ ] IP-503 增加聚合HTML索引和app级结果，但不复制repo工件正文。
- [ ] IP-504 在资源测试通过后选择性开放跨仓Assessment并发。
- [ ] IP-505 单独设计depth-safe rearchitecture路由；不复用首版Execution路径。
- [ ] IP-506 `apps[].output` 仅在对应分发协议实现后开放。

**退出 Gate**

- 每个阶段可独立暂停、恢复、重试和关闭。
- 前一阶段成功不隐含后一阶段批准。
- 完整流水线失败时仍可从最后一个已验证阶段继续。

## 7. 文件级变更预算

### 7.1 以新增为主

| 路径 | 计划 |
|---|---|
| `agents/batch-coordinator.agent.md` | 新增批次控制面。 |
| `agents/batch-assessment.agent.md` | 新增单 execution-unit Assessment adapter。 |
| `agents/batch-planning.agent.md` | Stage 2 新增。 |
| `agents/batch-execution.agent.md` | Stage 3 新增。 |
| `skills/batch-modernization/` | 新增确定性控制skill、schemas和scripts。 |
| Batch-safe worker profiles | Stage 3按allowlist逐个新增或认证。 |

### 7.2 允许的窄修改

| 路径 | 允许修改 | 保护条件 |
|---|---|---|
| `agents/modernize.agent.md` | 增加single/batch范围路由 | 路由最后接入；single fixtures必须先存在。 |
| `skills/assessment/SKILL.md` | 明确batch capacity/result契约 | standalone/coordinator默认行为不变。 |
| `skills/assessment/scripts/assessment-catalog.mjs` | 可选scratch root和并发上限 | 省略参数时输出路径和计划结构兼容。 |
| `skills/assessment/scripts/assess-cli.mjs` | 透传batch-only可选参数 | 现有命令和输出字段保持兼容。 |
| Planning skills | 仅增加显式batch mode或可被adapter消费的preflight | 不改变single模式默认问答。 |

### 7.3 首版禁止修改

- `plugin.json` 的公共入口结构。
- `.mcp.json`。
- 现有 SessionStart hook语义。
- Single mode的报告、计划和tasks兼容位置。
- 现有 `execution-coordinator` 的single-repository行为。
- Rearchitecture coordinator/worker。

## 8. 风险登记表

| Risk ID | 风险 | 概率 | 影响 | 阶段 | 控制措施 | 放行条件 |
|---|---|---|---|---|---|---|
| IR-001 | Batch范围判定误伤single请求 | 中 | 高 | 1B | 显式预览路由、single golden tests、路由最后接入 | 所有single fixtures保持原路由。 |
| IR-002 | Takeover后旧worker继续产生副作用 | 高 | 严重 | 1B/3 | Side-effect fence、attempt capability、不传owner token | BM-001关闭。 |
| IR-003 | `include_paths`读取或修改越界 | 高 | 高 | 1B/3 | `executionUnitId`、canonical scope roots、确定性约束 | BM-002关闭。 |
| IR-004 | 宿主无法稳定支持六/七路fan-out | 中 | 高 | 1B | 并发作为上限、wave、串行fallback | BM-003关闭且limit=1测试通过。 |
| IR-005 | 无交互agent静默使用错误默认值 | 高 | 高 | 2/3 | Persisted `NeedsInput`、稳定question ID、fail closed | BM-004关闭。 |
| IR-006 | 路径逃逸或URL凭据泄漏 | 中 | 严重 | 1A | realpath/reparse检查、全字段脱敏、临时clone | BM-006关闭。 |
| IR-007 | Attempt之间覆盖固定工件 | 高 | 高 | 1B/3 | Attempt-scoped scratch、验证后发布链接 | 重叠attempt测试通过。 |
| IR-008 | Worker文本伪成功或证据不足 | 高 | 严重 | 3 | Phase-specific validator、ProtocolError | 每个allowlist worker有伪成功负测。 |
| IR-009 | 深层agent缺少工具或超depth | 中 | 高 | 0/3 | 真实depth探针、静态tool audit、预检Not supported | Stage 0探针通过。 |
| IR-010 | 工具权限被误当成Execution批准 | 中 | 严重 | 3/4 | 独立业务确认、持久化approval scope | `--allow-all`负测通过。 |
| IR-011 | 状态文件损坏或并发写入丢失 | 中 | 高 | 1A | Atomic replace、flush、lease CAS、event log | Crash/concurrency测试通过。 |
| IR-012 | 多仓AppCAT/build耗尽CPU、内存或网络 | 中 | 中 | 1B/3 | 跨仓顺序、可见capacity、超时与partial结果 | 五个中型fixture资源测试通过。 |
| IR-013 | Batch改动使single工件或问答契约漂移 | 中 | 高 | 全部 | 默认参数兼容、single regression suite | 每阶段合入前全量回归通过。 |
| IR-014 | 设计、issue台账和实现版本漂移 | 中 | 中 | 全部 | Schema version、决策日志、PR traceability | 每个任务关联IP/BM编号。 |

## 9. 验证策略

### 9.1 确定性单元测试

- `repos.json` v1/v2解析、未知字段、重复名称和app引用。
- Windows/POSIX路径、symlink/junction、URL脱敏和origin归一化。
- Execution-unit ID稳定性和清洗后路径碰撞。
- State transition、lease CAS、atomic replace和event append。
- Attempt request/result、`NeedsInput`和answer schema。
- Phase-specific artifact/evidence validation。
- Retry wave、NotApplicable、Excluded和aggregate result。

### 9.2 Agent契约测试

- Batch phase agent静态不包含 `ask_user`。
- Assessment调用链不包含Assessment MCP。
- 同一个phase profile重复调用不共享前一个仓库内容。
- 父agent工具覆盖直接子agent；depth 4不可继续派生。
- Subagent只收到一个execution unit，不收到完整`repos.json`。
- Agent声称成功但result缺失时必须为ProtocolError。

### 9.3 集成测试

- 两个URL fixture仓库和URL/path混合。
- Java、.NET、JavaScript/TypeScript混合Assessment。
- 一个clone失败、一个Assessment partial、其他仓库继续。
- 两个顶层session争用同一lease。
- 强制中断、显式takeover和旧worker仍存活场景。
- `NeedsInput`跨session回答、过期回答和取消。
- Dirty workspace、错误origin、错误branch和partial clone。
- Batch Execution只在可丢弃fixture仓库运行。

### 9.4 Single Mode回归测试

- 无`repos.json`时行为不变。
- 有配置但用户明确当前仓库时行为不变。
- Broad Assessment → Planning → Execution确认链不变。
- 明确单任务仍跳过Assessment/Planning。
- 现有报告、plan/tasks和worker summary路径不变。
- 当前Assessment runtime/hook/plugin structure测试持续通过。

## 10. 发布与回滚策略

### 10.1 发布门禁

- Batch动作按Assessment、Planning、Execution分别开放，不使用单一总开关。
- 首次只接受显式batch请求；配置自动发现入口在预览稳定后开放。
- Execution按worker capability allowlist逐项开放。
- 任一Stage Gate失败只阻止对应新能力，不回退为父agent执行真实工作。

### 10.2 状态与schema兼容

- 所有持久文件包含独立schema version。
- 新版本只能显式迁移已知旧版本；未知版本只读并停止调度。
- 回滚插件版本后，不删除或重写较新batch状态。
- Repo-local业务工件保持现有格式，batch summary只建立索引。

### 10.3 回滚原则

- 控制层回滚：关闭batch路由，single mode继续工作。
- Assessment回滚：保留已生成报告，停止调度新仓库。
- Planning回滚：保留独立plan，用户仍可在single mode中查看或执行。
- Execution回滚：不自动撤销commit、stash或文件修改；停止新调度并展示分支和证据。
- 不使用`git reset --hard`、自动discard或删除用户workspace作为产品回滚手段。

## 11. Go / No-Go 检查表

### Stage 1B Batch Assessment

- [ ] `BATCH_ASSESSMENT_DELIVERY_READINESS.md`中的P0 Workstream A-D全部通过。
- [ ] BM-002、BM-008、BM-009、BM-010关闭。
- [ ] 真实产品agent链路在Windows和POSIX各有一次可复核E2E证据。
- [ ] 每个成功摘要均可追溯到attempt-bound validation record。
- [x] Single mode回归全绿。
- [ ] Batch路由具有独立preview feature flag/route switch，且关闭行为通过安装包E2E。
- [x] 不依赖takeover时，UI不宣称支持强制中断恢复。

### Stage 2 Batch Planning

- [ ] BM-004、BM-007关闭。
- [ ] `NeedsInput`可跨session恢复。
- [ ] Plan默认不覆盖，双tasks冲突fail closed。
- [ ] Planning完成后不会未经批准进入Execution。

### Stage 3 Batch Execution

- [ ] 所有相关P0/P1 issue关闭。
- [ ] 每个worker通过batch-safety认证。
- [ ] Side-effect fencing和attempt-scoped evidence通过强制中断测试。
- [ ] Dirty workspace和Execution approval负测通过。
- [ ] 有明确的per-capability回滚开关。

## 12. 完成定义

一个阶段只有同时满足以下条件才算完成：

- 对应任务、schema、负向测试和文档全部合入。
- 该阶段的open issue达到要求状态并记录证据。
- 所有single mode回归通过。
- 用户可见状态只来自已验证的持久工件。
- 失败路径有可操作摘要，不要求用户先查日志。
- 回滚不会删除或覆盖用户已有工件和代码。
- 下一阶段未被当前阶段隐式启用。

## 13. 明确不在本计划首版范围

- Cloud Agent、Fleet或其他远程调度。
- 跨仓库Execution并发。
- Batch Rearchitecture。
- 自动解决跨仓库依赖顺序。
- 自动push或创建PR。
- 自动stash、discard或修复dirty workspace。
- 未实现协议的`apps[].output`分发。
- 为了Batch而改变single-repository公共工件格式。

## 14. Traceability

| 设计主题 | 实施阶段 | 主要任务 | 风险 / Issue |
|---|---|---|---|
| 单一`modernize`入口 | 1B | IP-206 | IR-001 |
| 配置、路径和apps | 1A | IP-101至IP-105 | IR-003、IR-006 |
| 状态、lease和恢复 | 1A/1B | IP-106、IP-107、IP-207 | BM-001、IR-002、IR-011 |
| Batch Assessment | 1B | IP-201至IP-208 | BM-002、BM-003 |
| `NeedsInput` | 2 | IP-301、IP-302、IP-305 | BM-004、IR-005 |
| Batch Planning | 2 | IP-303至IP-308 | IR-005、IR-013 |
| Batch Execution | 3 | IP-401至IP-410 | BM-001、BM-006、BM-007 |
| 完整流水线 | 4 | IP-501至IP-506 | IR-010、IR-012、IR-014 |

## 15. 决策记录

| 日期 | 决策 | 状态 |
|---|---|---|
| 2026-08-12 | 实施计划和风险评估独立于设计及问题台账维护 | Accepted |
| 2026-08-12 | 首个用户可见切片为显式门禁下的顺序Batch Assessment | Proposed |
| 2026-08-12 | Batch Planning与Batch Execution分开交付 | Proposed |
| 2026-08-12 | Batch Execution采用capability allowlist，不一次性复用全部worker | Proposed |
| 2026-08-17 | Stage 1B显式Batch Assessment完成控制层实现并接入`modernize` | Accepted |
| 2026-08-17 | Stage 1B交付评审为No-Go；按独立整改计划完成P0 Gate后重新评审 | Accepted |
| 2026-08-17 | Takeover/resume/retry、Batch Planning与Batch Execution继续保持关闭 | Accepted |