# Batch Assessment 交付质量评审与整改计划

> 评审日期：2026-08-17
>
> 评审范围：Stage 1B 显式、本地、顺序 Batch Assessment 私有预览
>
> 当前结论：**No-Go。实现切片已完成，但尚未达到可交付质量。**
>
> 关联文档：`BATCH_MODE_IMPLEMENTATION_PLAN.md`、`BATCH_MODE_OPEN_ISSUES.md`

## 1. 结论摘要

当前实现已经具备较完整的确定性控制层：配置解析、workspace 预检、execution-unit 身份、lease、attempt request/result、顺序提交、摘要以及 single-mode 回归均有自动化测试。当前 `*.test.mjs` Node 基线为 144 项：143 通过、0 失败、1 个 Windows 条件性跳过，编辑器诊断为 0。另一个需要预先构建 telemetry sender 的 `.test.js` 集成测试不属于该基线；在当前源码树直接自动发现运行时，它按预期因缺少构建产物失败。

这些证据足以说明 Stage 1B 的主要组件已经实现，但不足以证明真实用户工作流可交付。当前有四个阻断项：

1. Assessment success validator 可把未验证的空 JSON 报告判为完成。
2. attempt start/commit 跨多个持久文件更新，崩溃后不可幂等重放或确定性修复。
3. 产品链路的 Windows 正向 E2E 已通过，但负向 failure matrix 与 POSIX 证据仍不完整。
4. `include_paths` 的 sibling 不读取保证仍是 prompt 契约，不是可执行边界。

因此，文档中的“Stage 1B 已完成”只能解释为 implementation complete，不能解释为 delivery accepted。在本计划的全部 P0 Gate 通过前，不应发布或宣称 Batch Assessment 私有预览可用。

## 2. 当前质量矩阵

| 质量面 | 状态 | 已有证据 | 交付判断 |
|---|---|---|---|
| 配置、路径、Git 安全 | Ready | resolver/inspection/clone 跨平台负向测试 | 通过 |
| Lease 与单 owner 写入 | Ready with limits | 竞争、错误 token、只读 takeover 测试 | 仅支持无恢复运行 |
| Attempt 身份与隔离 | Ready | request/result schema、独立 scratch、单 active attempt | 通过 |
| 并发降级 | Ready | capacity 1/2/6/7 与 catalog task-set 等价性 | 通过 |
| Single-mode 回归 | Ready | Stage 0 golden anchors 与完整 Node 回归 | 通过 |
| Assessment 成功证据 | Not ready | 当前正例接受 `{}` 与 `artifactValidation: not_run` | **P0 阻断** |
| 崩溃一致性 | Not ready | 无 fault-injection、replay 或 reconcile 测试 | **P0 阻断** |
| 产品 agent 链路 | Incomplete | Windows 正向双仓链路与报告完整性通过；3 个负向探针不受当前宿主支持，POSIX 未执行 | **P0 阻断** |
| `include_paths` 作用域 | Unverified | 证明了路径身份与工件隔离，未证明 sibling 不被读取 | **P0 阻断** |
| 暂停/中断 UX | Incomplete | pause 状态存在，但 preview 同时声明 resume 不可用 | P1 |
| 安装包与 telemetry | Unverified | 默认回归不执行需要构建产物的 telemetry integration test | P1 |

## 3. 主要发现

### DQ-001：Assessment validator 存在假成功路径（P0）

`skills/batch-modernization/scripts/validate-result.mjs` 对成功 Assessment 只要求：

- `report` 是可解析 JSON object；
- HTML 文件非空；
- 路径位于 batch root 或 execution-unit workspace。

当前 validator 不要求 `evidence.artifactValidation` 为 `passed`，不校验 compatibility report 的 `version: 1.1.0`、`metadata.runId` 或字段结构，也不根据 request decisions 验证 full coverage facts/security terminal outputs。现有 `validate-result.test.mjs` 还把 `{}`、非空 HTML 和 `artifactValidation: not_run` 固化为成功正例。

**风险：** 任意空报告或属于旧 run 的报告都可能使仓库和 batch 显示 Completed。

### DQ-002：Attempt 提交不是崩溃一致的（P0）

`startAttempt` 的顺序是 request -> state Running -> event；`commitAttempt` 的顺序是 state terminal -> repo validation -> event。任一跨文件边界发生进程退出都可能留下不可重放状态：

- state 已 Running，但 `attempt_started` event 未写且 child 未实际 dispatch；
- state 已 Completed，但 repo validation/event 未写；
- finalize 根据 terminal state 继续生成缺少工件的成功摘要；
- 再次 commit 因 state 不再是 Running 而被拒绝。

**风险：** 持久状态与验证真源分离，用户看到的终态可能无法证明结果有效。

### DQ-003：产品链路真实宿主 E2E 矩阵不完整（P0）

Stage 0 platform probe 证明了重复 subagent、depth、工具继承和 fan-out，但 fixture 明确是 non-production，未注册产品 agents/skills。Stage 1B 现已增加加载实际 plugin 和 production agents 的 ACP scenario runner、两仓 whole-repository fixture、真实仓库 runner、持久工件 validator、source canary 和 Windows/POSIX matrix workflow。validator 不信任 agent prose，并要求 invocation identity、request/result binding、严格顺序事件、repo validation、summary、report digest 和 canary 同时一致。真实仓库 runner 还要求 compatibility `report.json`、自包含 HTML 和 AppCAT JSON 同时完整，并检查全部 tracked 文件不变。

2026-08-17 的早期 Windows 记录使用 Copilot CLI `1.0.81-0`，在首个 tool call 前由 monthly quota 阻断。该历史 blocker 仍保存在 `tests/batch-mode/stage1b/evidence/real-repositories.win32-x64.json`，不能作为通过证据。

配额恢复后的 Retry 10 使用 `auto` 模型、AppCAT `7.7.0.10`、`spring-petclinic@88e37c1` 和 `airsonic-advanced@68d11bf` 的隔离副本，通过了完整 Windows 产品链路。会话 `1b329554-15f2-46f9-93d4-04ed5761a608` 以严格同 session、独立用户轮次、全文精确为 `Start batch` 的 fallback 完成确认；当前宿主未发出 structured elicitation。validator 证明两个全新 `batch-assessment` invocation 严格串行且均为 `completed`，source canary 与两个仓库的 tracked files 均未改变。Spring 报告包含 11 个 findings，Airsonic 报告包含 34 个 findings；两套 compatibility JSON、自包含 HTML 和 AppCAT JSON 均通过结构、内容、尺寸与 SHA-256 校验。原始本地 evidence 文件 SHA-256 为 `8915ad9a5fc32227a6d346bec3c86abbc028f59e764592cbeb222d6d44c922f4`，绑定 product package digest `c61be8b446be783b8079bda2ba9a866ae8f37fdc9fb0485c837db220ec7d96e3`。

当前 package digest `a4e54d676934b1f2ed5808024383c8fa9314618db8de148aad9df04492d8d1d6` 的 Windows product matrix 为 `incomplete`：explicit success、Cancel、Planning/Execution 拒绝和 ambiguous single route 共 5 个探针通过；natural child failure 因 fixture 在 phase dispatch 前被拒绝而为 `natural_phase_failure_injection_unavailable`；missing result 与 partial Assessment 因宿主未发出 ACP permission event 而为 `acp_permission_events_unavailable`。POSIX product probe 仍未执行。因此 DQ-003 和 BM-010 保持 Open。

**风险：** Windows 正向入口已证明可完成真实批次，但 child/permission failure 的产品级继续执行行为及 POSIX 行为仍未获得宿主证据。

### DQ-004：`include_paths` 仍缺少可执行读取边界（P0）

当前实现把 include path 变成独立 `workspacePath`/`scopeRoot`，并验证 canonical containment、request/result 隔离和同 Git root 串行。这能防止身份和工件碰撞，但 agent 的 `search`/`edit` 能力仍由宿主 workspace 授权，prompt 不能证明 excluded sibling 未被读取。

**最小交付决策：** 私有预览先在 `initialize-assessment` 确定性拒绝 `source: include-path` execution unit。只有在真实 phase-agent scope probe 证明 sibling 不可见或不可读后，才重新开放。

### DQ-005：中断与 pause 契约不完整（P1）

Coordinator 允许在 invocation 边界把 batch 标记 Paused 并释放 lease，但 Stage 1B 同时声明 resume 不可用。异常退出则留下只能只读 takeover 的 stale batch。

**风险：** 用户无法区分“可继续暂停”“已放弃”和“异常遗留”，也没有确定性的下一步。

### DQ-006：能力、安装包与 telemetry 尚未形成放行证据（P1）

Batch agents 的工具边界目前主要由 frontmatter 与 prompt 约束；默认 plugin structure test 不解析 agent frontmatter 或验证安装后的工具继承。Telemetry hook integration test 需要当前源码树缺少的 sender 构建产物，因此未进入默认回归。

## 4. 私有预览交付边界

首次达到可交付质量时，只开放以下能力：

- 用户显式请求 Batch Assessment；配置存在本身不触发 batch。
- 本地、顺序、Assessment-only。
- 只接受 whole-repository execution unit；`include_paths` 暂时 fail closed。
- 不支持 takeover 后调度、retry、跨 session resume、Planning 或 Execution。
- 正常运行需要单个未中断顶层 invocation；异常批次可查看并明确 abandon，但不能伪装为可恢复。
- 用户可见 Completed 只能来自确定性验证通过且 attempt-bound 的持久工件。

任何未列出的能力保持关闭，不能 fallback 到 `modernize` 或 coordinator 自行执行真实 Assessment。

## 5. 实现工作计划

### Workstream A：强化成功证据（P0 / M）

- [ ] DQ-101 为 compatibility `report.json` 增加版本化 JSON Schema，至少验证 `version`、`metadata.id`、`metadata.runId`、`metadata.status`、`categories[]`、`findings[]` 和 `security[]`。
- [ ] DQ-102 让 attempt request 持久化确定性 `runId`，或定义从 invocation identity 到 runId 的唯一映射；validator 必须验证 report 属于当前 attempt。
- [ ] DQ-103 成功状态强制 `evidence.artifactValidation: passed`；`failed`/ProtocolError 保持 `not_run` 或 `failed`。
- [ ] DQ-104 把 approved domains、coverage 和语言传入 validator policy；full coverage 必须验证六个归档 fact，security 必须验证七个 terminal task evidence。
- [ ] DQ-105 验证 HTML 是当前 Assessment report：至少检查 report-data marker、run identity 与非空 payload，而不是只检查文件大小。
- [ ] DQ-106 增加空 `{}`、旧 run、错误版本、`not_run`、缺 fact、PENDING security、伪 HTML 的负向测试。

**Exit Gate A**

- 所有 successful result 都能反向证明 request identity、run identity、任务完整性和报告格式。
- `validate-result.test.mjs` 不再存在“未验证证据也成功”的正例。
- 任一缺失或错配均稳定映射为 ProtocolError。

### Workstream B：崩溃一致性与幂等提交（P0 / M）

- [ ] DQ-201 定义 attempt journal/commit record，先原子持久化 validation record，再把 state 切到 terminal；summary 只消费已提交 record。
- [ ] DQ-202 让 `start`、`commit`、`finalize-assessment` 可幂等重放；相同 identity 重放返回既有结果，identity 冲突 fail closed。
- [ ] DQ-203 增加 `reconcile` 命令，只修复可由 immutable request/result/commit record 证明的状态，不猜测 child 是否运行。
- [ ] DQ-204 在 request、state、repo validation、event、summary 和 lease release 每个边界加入 fault-injection 测试。
- [ ] DQ-205 finalize 必须拒绝任何缺少已提交 validation record 的 terminal execution unit。

**Exit Gate B**

- 每个注入崩溃点重放后只能得到一个 attempt start、一个 validation commit 和一个终态。
- 不会出现 Completed unit 缺少已验证 artifact index。
- 事件缺失可以重建；事件重复被确定性去重或拒绝。

### Workstream C：作用域与操作边界（P0 / S，完整支持为 L）

- [ ] DQ-301 私有预览初始化时拒绝 `source: include-path`，错误需指向 executionUnitId 并说明 whole-repository 限制。
- [ ] DQ-302 增加 include-path No-Go 单元和 CLI 集成测试；root repository 行为保持不变。
- [ ] DQ-303 审计 batch agents 的最小工具集合，并通过真实宿主 probe 验证父子工具继承；不能移除 child 必需能力时记录原因。
- [ ] DQ-304 若后续重新开放 include paths，必须使用宿主级隔离或 scoped tool wrapper，并以 excluded-sibling canary 证明无读取/写入。

**Exit Gate C**

- 首次预览对无法证明的 scope fail closed。
- BM-002 只有在 canary 测试证明 sibling 不可读/不可写后才能再次关闭。

### Workstream D：产品链路 E2E 与安装包 Gate（P0 / L）

- [x] DQ-401 新建 Stage 1B product probe，加载实际 plugin 目录和产品 `modernize` agent，而不是独立 toy agents。
- [x] DQ-402 覆盖显式 batch 路由、模糊 single 路由、Review/Start 确认和禁止 Batch Planning/Execution。
- [x] DQ-403 使用两个临时 whole-repository fixture 顺序运行；记录两个独立 invocation、scratch、result、report 和 aggregate summary。
- [ ] DQ-404 注入 child failure、missing result、partial Assessment 和用户拒绝 Start；验证无 fallback、后续 unit 行为和摘要。
- [x] DQ-405 增加 source-write canary，证明 Assessment 不修改 build manifest/application source。
- [x] DQ-406 对打包后的 plugin 运行 smoke test，验证 agents、skills、schemas、scripts、hooks 和 runtime bootstrap 均存在。
- [ ] DQ-407 在 Windows 与一个 POSIX CI runner 执行 product probe；记录 Copilot CLI/version、fixture digest 和证据路径。

**当前状态（2026-08-17）**

- DQ-402、DQ-403 和 DQ-405 已由当前 package 的 Windows explicit-success、Cancel、unsupported-route、ambiguous-single 探针以及 Retry 10 真实双仓运行覆盖；严格 exact-follow-up approval 在 structured elicitation 不可用时通过。
- DQ-404 的 Cancel 已通过；自然 child failure、missing-result 和 partial-Assessment 仍因 fixture dispatch/ACP permission-event 能力不可用而为 `not_supported`，不能勾选完成。
- DQ-407 已增加手动 Windows/Ubuntu matrix workflow；Windows 正向证据存在但完整 matrix 未通过，POSIX 尚未执行，双平台 Gate 未通过。
- 当前证据：`tests/batch-mode/stage1b/evidence/product-probe.win32-x64.json`；verdict `incomplete`；package SHA-256 `a4e54d676934b1f2ed5808024383c8fa9314618db8de148aad9df04492d8d1d6`。package identity 对 CRLF/LF 做规范化，Windows/POSIX 比较不会因 checkout 换行产生假差异。

**Exit Gate D**

- 同一安装包在 Windows/POSIX 至少各有一次通过证据。
- 真实 `modernize -> batch-coordinator -> batch-assessment` 链路完成两仓批次。
- failure 场景产生可验证的 Completed with issues/ProtocolError，而不是 agent 文本成功。

### Workstream E：可运维性、发布与回滚（P1 / M）

- [ ] DQ-501 在未实现 clean resume 前，把 Pause UX 改为 Finish current unit then abandon；状态和用户文案不暗示可恢复。
- [ ] DQ-502 提供只读 `inspect` 和显式 `abandon`；abandon 不删除 repo-local report、request、result 或日志。
- [ ] DQ-503 为 batch/repo/executionUnit/invocation 设计 telemetry correlation；hook 缺失或发送失败仍不得阻断 batch。
- [ ] DQ-504 把 telemetry sender build 与 hook smoke 纳入 packaging CI，或明确将 telemetry 从 preview release contract 中移除。
- [ ] DQ-505 增加独立 preview feature flag/route switch；关闭后 single mode 无行为变化。
- [ ] DQ-506 更新用户文档：支持范围、已知限制、结果目录、失败处理和回滚步骤。

**Exit Gate E**

- 用户可以确定性区分 Completed、Completed with issues、Abandoned 和 stale/unrecoverable。
- 关闭 preview route 后，single mode golden tests 保持全绿。
- 安装包 smoke、telemetry 决策和回滚步骤有持久证据。

## 6. 执行顺序与依赖

```text
Workstream A (证据) ─┐
                     ├─> Workstream D (产品 E2E) ─> Workstream E (发布)
Workstream B (一致性)┤
Workstream C (scope) ┘
```

- A、B、C 可以并行，但 D 必须在三者通过后开始正式放行测试。
- E 的文档和 feature flag 可提前准备，发布 Gate 必须等待 D。
- BM-001 takeover fencing、BM-004 NeedsInput 和 BM-007 retry 不属于本次最小交付；相关能力继续关闭。

## 7. 测试矩阵

| 层级 | 必须覆盖 | 放行要求 |
|---|---|---|
| Schema/unit | report/evidence/identity/secret/path/status | 全部正负例通过 |
| Crash integration | start/commit/finalize 每个持久边界 | 可幂等重放，无假 Completed |
| Control-plane integration | resolve -> inspect -> initialize -> attempt -> summary | whole-repo mixed portfolio 通过 |
| Product host E2E | 真实 agents、确认、两仓、partial/failure | Windows/POSIX 通过 |
| Packaging | 安装包内容、bootstrap、hooks | 缺文件立即失败 |
| Regression | 完整 `*.test.mjs`、single golden | 0 failure；skip 有批准理由 |

## 8. 最终 Go / No-Go Gate

只有以下项目全部满足，Stage 1B 才能从 No-Go 改为 Go：

- [ ] BM-002、BM-008、BM-009、BM-010 全部 Closed。
- [ ] Exit Gate A、B、C、D 全部通过。
- [ ] 两个平台的 product probe 证据已提交且 fixture digest 可复核。
- [ ] 成功摘要中的每个 artifact 都能追溯到 attempt-bound validation record。
- [ ] Preview route 可独立关闭，single mode 完整回归为 0 failure。
- [ ] 用户文档明确说明无 takeover/retry/resume/Planning/Execution。
- [ ] Release owner 完成一次基于持久工件而非 agent 文本的人工验收。

P1 Workstream E 中未完成的条目必须逐项获得书面豁免；P0 不允许豁免。

## 9. 当前证据记录

截至 2026-08-17：

- `*.test.mjs` Node 回归：144 tests，143 passed，0 failed，1 skipped。
- 包含 `.test.js` 的全自动发现回归未在本轮重跑；已知 telemetry integration test 仍依赖预先构建的 `mcp-server/dist/entrypoints/telemetrySender.js`。
- 编辑器诊断：0。
- Stage 0 product-independent platform evidence：Passed，Copilot CLI 1.0.79，生成于 2026-08-12。
- Stage 1B production-agent E2E harness：33 tests，33 passed；actual plugin、ACP approval/permission capture、两次直接 phase invocation、artifact binding、sequential ordering、canary、failure fixtures、跨平台 package identity、verdict state machine 和真实 Assessment 报告完整性 validator 均通过。
- Stage 1B Windows product-host evidence：Incomplete。当前 package 的 5 个路由/正向探针通过，3 个 failure-matrix 探针因宿主能力或 fixture 注入不可用而为 `not_supported`。
- 真实仓库 Assessment 报告：Retry 10 passed；2/2 completed，严格串行，Spring 11 findings、Airsonic 34 findings，两套 compatibility/HTML/AppCAT 工件完整且 tracked files unchanged。
- Stage 1B POSIX product-host evidence：Not run。
- Packaging/telemetry integration：Not in default regression。
- Delivery verdict：**No-Go**。

## 10. 2026-08-17 交接与明日续作

1. [x] 已将 `product-probe.win32-x64.json` 的 unsupported probes 与 failure-matrix coverage 对齐为 `not_run`，并增加持久 evidence 一致性测试。
2. [ ] 在支持 ACP permission events 的宿主重跑 missing-result 与 partial-Assessment；为 natural child failure 选择能进入 phase dispatch 后再自然失败的 fixture。
3. [ ] 通过手动 `Stage 1B Product Probe` workflow 生成 POSIX evidence，并要求 Windows/POSIX package digest 一致。
4. [ ] 将 Retry 10 的可移植脱敏记录写入仓库 evidence；当前原始文件保留在 `%USERPROFILE%\Source\batch-test\real-e2e-20260817-01\real-repository-e2e-retry-10.json`，文件 SHA-256 见上文。
5. [ ] DQ-001、DQ-002、DQ-004 与 BM-002/BM-008/BM-009/BM-010 全部关闭前，不改变 No-Go 结论。