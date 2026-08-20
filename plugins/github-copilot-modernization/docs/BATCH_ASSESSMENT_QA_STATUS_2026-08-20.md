# 批量评估 QA 状态记录（2026-08-20）

## 结论

- 基准文档：`BATCH_ASSESSMENT_MANUAL_QA.md`
- 当前结论：**自动化回归和 Windows 产品矩阵通过；但 Airsonic 的 AppCAT 结果在全新 JDTLS workspace 首次扫描时稳定少报，运行时未识别该语义不完整，且仍有未在本次环境重新执行的手工/POSIX 项，因此暂不签署完整 Release QA**。
- 当前产品包：`github-copilot-modernization` 1.22.0
- 产品包 SHA-256：`89f7c3cb010d88711bca02c5944f499de9e21ae7c5f09c6f49d3a976bef64825`

## 测试环境

| 项目 | 本次环境 |
|---|---|
| 操作系统 | Windows 11 amd64 |
| 分支 | `batch` |
| Node.js | 22.21.1 |
| Git | 2.55.0.windows.3 |
| Copilot CLI | 1.0.81-0；文档使用的 9 个 CLI 参数均受支持 |
| Java | Microsoft OpenJDK 17.0.16 |
| Maven | 3.9.12 |
| AppCAT | 7.7.0.10 |
| 模型 | `gpt-5-mini` |

## 已执行测试

| 测试 | 结果 | 说明 |
|---|---|---|
| Stage 1B 聚焦测试 | 通过 | 42 项：41 通过、0 失败、1 跳过；文件符号链接因 Windows `EPERM` 跳过 |
| 文档第 20 节 MJS 完整回归 | 通过 | 174 项：172 通过、0 失败、2 跳过 |
| 产品包校验 | 通过 | 必需文件完整，摘要与已保存证据一致 |
| 文档 PowerShell 测试夹具 | 通过 | 创建 2 个路径有效、跟踪文件干净的 Git 仓库，并完成清理 |
| 跨平台保存证据断言 | 通过 | Windows/Linux 各 7 个必需场景均为 `passed`，且绑定同一当前摘要 |
| Windows 保存证据 `--resume` | 通过 | 当前 CLI、模型、平台和摘要满足复用条件；在临时副本上验证，未改仓库证据 |
| Windows 产品主机全新矩阵 | 通过 | 7 个必需场景均通过；两个权限诊断按规则为 `not_supported`。默认配置 Batch 首次被组织策略阻塞，`--resume` 受控重试通过 |
| 双真实 Java 仓库全新验收 | 通过 | 2 个仓库均完成，严格串行；发现数为 11/28，报告完整，跟踪文件未改 |
| Batch/Single AppCAT 一致性专项 | 未通过 | Airsonic 全新 JDTLS workspace 首扫稳定为 35 条规则/1275 个 incidents，同一路径第二次扫描稳定为 42/1309；Batch 与 Single 的报告语义不一致 |
| 聚合报告浏览器检查 | 通过 | 桌面无溢出；移动端表格位于横向滚动容器，页面无横向溢出且单元格无重叠；两个报告链接均可打开 |
| 遥测 Hook `sendTelemetry.test.js` | 前置条件缺失 | 缺少被 `.gitignore` 排除的 `mcp-server/dist/entrypoints/telemetrySender.js`，且插件目录没有对应构建入口 |

## QA 条目状态

| ID | 本次状态 | 证据与边界 |
|---|---|---|
| QA-01 | 通过 | 全新 Windows 产品探针的默认配置 Single 路由通过；默认配置 Batch 在先显示模式选择和 Review 后才被宿主策略阻塞 |
| QA-02 | 通过 | 全新产品探针的 Single 选择通过；确定性证据验证不创建 Batch 执行产物 |
| QA-03 | 通过 | Review 与 `Start batch` 分离的产品证据及协议测试均通过 |
| QA-04 | 通过 | 全新产品探针的 Cancel 场景通过，仅保留 Review 产物 |
| QA-05 | 通过 | 全新显式双仓 Batch 通过；证据校验确认独立调用和严格串行 |
| QA-06 | 通过 | 报告树、摘要、计数、建议、Planning 支持和摘要校验通过；本次聚合页面的桌面/移动布局及两个报告链接均通过浏览器检查 |
| QA-07 | 自动化通过 | 六项显式 Single 配置在 Review、请求、报告和聚合扩展中的传播测试通过；本次未单独重跑该手工提示 |
| QA-08 | 通过 | 全新 Windows 产品场景通过；运行中也观察到 `alpha-service=failed` 后仅 `beta-service=running` |
| QA-09 | 自动化通过 | 混合语言单元在创建状态前拒绝的 Review 与初始化测试通过；本次未单独执行产品主机会话 |
| QA-10 | 自动化通过 | `include_paths` 在创建 Batch 状态前拒绝的测试通过；本次未单独执行产品主机会话 |
| QA-11 | 通过 | 全新 Windows 产品探针的 Batch Planning 和 Execution 拒绝场景均通过 |
| QA-12 | 部分通过 | 本次全新 Windows 矩阵通过，已保存的同摘要 Windows/Linux 证据断言通过；POSIX 无法重新运行 |
| QA-13 | 部分通过 | Spring Petclinic/Airsonic Advanced 的工作流、严格串行调度、产物结构和仓库不变性通过；Airsonic Batch 冷 workspace 报告为 28 个归一化发现，后续 Single 暖 workspace 报告为 34 个，语义一致性未通过 |

## 当前环境下不可测试项

| 项目 | 原因 |
|---|---|
| 全新 POSIX 产品主机证据 | 两个 WSL 发行版均缺少原生 Node；发现的 `copilot` 是不能在 Linux 执行的 Windows shim，且 Linux CLI 需要单独认证 |
| 历史 QA-13 原始产物复算 | 历史证据 JSON 保留且断言通过，但其临时配置、仓库级报告和聚合快照已经清理，不能重新计算文件摘要 |
| 遥测 Hook 集成测试 | 所需构建产物不存在，当前插件目录也不包含生成它的 `package.json` 或 `esbuild.js` |

## 审阅发现

1. **产品主机 blocker 分类不完整。** 本次默认配置 Batch 在 coordinator 调用处收到 `400 Access to this feature is blocked by organization policy`。这是外部宿主策略限制，但 `classifyProductHostBlocker` 和 ACP 文本识别未覆盖该模式，最终被记录为产品 `failed`，可能造成错误归因。
2. **“全部插件测试”的命令范围不完整。** 第 20 节只收集 `*.test.mjs`，会遗漏仓库中唯一的 `*.test.js`：`agents/hook/scripts/sendTelemetry.test.js`。该测试当前又因缺少预构建 sender 无法启动，文档应明确排除范围或补充构建步骤。
3. **一个跳过项的报告原因不够明确。** `checkJavaAppcat reads a fake executable version` 使用布尔条件在 Windows 跳过，Node 输出只有 `# SKIP`；建议改为带文本的跳过原因，以满足第 20 节“每个 skip 有明确原因”的审计要求。
4. **AppCAT 成功条件不足以证明报告语义完整。** `assess-runtime.mjs` 只以进程退出码和报告存在性判断 AppCAT 成功，Batch 的 `validate-result.mjs` 也只验证 AppCAT 产物为对象。冷 workspace 少报时 AppCAT 仍退出 0 并生成合法 JSON，因此当前产品会发布不完整但结构有效的报告。

## Batch/Single 差异专项分析

### 观察结果

- 原始运行中，Airsonic Batch 首次扫描为 35 条匹配规则/1275 个 incidents，经归一化后为 28 个发现；随后两次 Single 扫描均为 42/1309，经归一化后为 34 个发现。
- 34 个新增 incidents 涉及 10 条依赖相关规则；其中 32 个直接定位到 `airsonic-main/pom.xml`，另 2 个数据库依赖 incident 的 location 为空。
- Batch、Single 和受控实验均使用 AppCAT 7.7.0.10、JDK 17.0.16、Maven 3.9.12、`issue-only` 和同一组三个 Azure targets。

### 受控实验

| 场景 | JDTLS workspace | 前置扫描 | AppCAT 结果 |
|---|---|---|---|
| A1：Airsonic 单独首次扫描 | 全新 | 无 | 35 条规则/1275 个 incidents |
| A2：A1 同一路径再次扫描 | 已预热 | A1 | 42/1309 |
| B1：Spring Petclinic 首次扫描 | 全新 | 无 | 11/40 |
| B2：B1 返回后立即扫描另一份 Airsonic | 全新且与 B1 隔离 | B1 | 35/1275 |
| B3：B2 同一路径再次扫描 | 已预热 | B2 | 42/1309 |

A、B 两组 Airsonic 的首轮结果完全一致，第二轮结果也完全一致。先扫描 Spring Petclinic 没有使后续 Airsonic 比单独冷启动更差；全局 Maven 缓存被前序扫描预热后，新的 Airsonic workspace 首扫仍为 35/1275，说明关键状态位于每路径独立的 JDTLS workspace，而不是全局依赖缓存。

### LSP lock 假设

本次证据不支持“前一任务的 LSP lock 尚未释放，导致 Batch 后一任务分析不完整”：

1. Stage 1B coordinator 明确按 execution unit 严格串行调度；本次 Review 也记录 `repositoryScheduling: sequential` 和 `maxConcurrency: 1`。`maxConcurrency` 约束单仓内部 task wave，不会并发执行两个仓库的 AppCAT。
2. AppCAT 通过同步子进程执行，上一进程退出后才开始下一仓库。原始 Batch 中两个仓库之间约有 91 秒间隔。
3. 每个仓库路径使用不同哈希目录的 JDTLS workspace。受控实验在 Spring 到 Airsonic 的切换点检测到 0 个 `.lock`、0 个 AppCAT/JDTLS 进程；仅有一个 Gradle daemon，未持有 JDTLS workspace lock。
4. 原始和实验日志均没有 `workspace already in use`、`Cannot lock`、lock timeout 等错误。
5. “Spring 后立即 Airsonic”和“Airsonic 单独运行”的冷启动结果相同；只有复用 Airsonic 自己的 workspace 才恢复 42/1309。

### 判定

- **直接根因：** 更符合 AppCAT/JDTLS 对 Maven 项目模型的冷 workspace 初始化或持久化时序问题，不是 Batch 跨仓 lock 冲突。
- **每仓概率：** 没有证据表明 Batch 使单个仓库的失败概率高于 Single；受控 A/B 实验显示两种执行上下文结果相同。
- **整批表观频率：** Batch 一次处理更多全新 workspace，因此只要单仓冷启动异常概率为 `p`，N 个仓库中至少出现一次的概率会变为 `1-(1-p)^N`。这是暴露次数增加，不是 Batch 调度改变了 `p`。
- **比较顺序偏差：** 若总是先运行 Batch、再在相同路径运行 Single，Batch 会命中冷 workspace，Single 会复用已预热 workspace，从而系统性呈现“Batch 少于 Single”。应交换顺序或为两种模式使用各自全新路径。
- **产品责任：** 触发问题位于 AppCAT/JDTLS，但不能视为与本项目完全无关。共享 Assessment runtime 没有语义稳定性或冷启动重试门槛，使退出 0 的不完整报告被 Batch 和 Single 同样接受；Batch 只是更容易一次暴露多个冷 workspace。

## 说明

- “通过”表示本次执行了对应产品场景或直接验收检查。
- “自动化通过”表示核心协议有确定性测试覆盖，但未完整重复文档中的人工交互步骤。
- 已保存证据只按“历史证据复核”记录，不冒充本次重新执行。