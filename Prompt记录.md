AI Panel Studio — 全流程 Prompt 记录归档

> 覆盖 SDD / DDD / TDD / E2E 四大开发阶段，每条 Prompt 保留原始下发文本 + 开发意图注解。
> 共计 7 段核心 Prompt，满足 ≥5 段归档硬性要求。

---

## 一、SDD 阶段：数据建模与 API/WebSocket 契约定义

### Prompt 1 — 数据库建模与 ER 图

<details>
<summary>📋 原始 Prompt（点击展开）</summary>

```
【SDD阶段｜单一任务：SQLite 数据建模与 API 契约定义】
项目：AI 圆桌讨论 Web App MVP

硬性约束：
1. 仅输出 Prisma schema + ER 图 + API/WebSocket 规范文档，不生成任何业务代码
2. 数据模型必须覆盖以下实体：
   - Discussion（讨论）：id、topic、status(SETUP/IN_PROGRESS/COMPLETED)、expertCount、summary、时间戳
   - Guest（嘉宾）：id、discussionId(FK)、name、role(HOST/EXPERT)、occupation、title、stance、color(HEX)、runStatus(IDLE/PREPARING/SPEAKING)、sortOrder
   - Speech（发言）：id、discussionId(FK)、guestId(FK)、content、speechType(OPENING/FOLLOW_UP/BRIDGING/ANSWER/SUPPLEMENT/COUNTER/SUMMARY)、sequence、isVisible
   - ConsensusRecord（共识记录）：id、discussionId(FK)、recordType(CONSENSUS/DIVERGENCE)、content、relatedSpeechIds(JSON字符串)
3. 所有实体以 discussion_id 为隔离标识，多讨论数据完全隔离
4. ER 图使用 Mermaid 语法绘制，标注一对一/一对多关系
5. API 规范文档定义 6 个 REST 端点 + 5 个 WebSocket 事件，含完整请求/响应示例
```

**开发意图**：在编写任何代码之前，先完成数据结构与接口契约的顶层设计。Prisma Schema 作为数据库唯一真源，API 规范文档作为前后端协作的契约基础。讨论生命周期状态机（SETUP→IN_PROGRESS→COMPLETED）在此阶段明确定义。

**实际产出**：
- `backend/prisma/schema.prisma`（4 实体完整定义）
- `docs/ER图.md`（Mermaid 实体关系图）
- `docs/API规范.md`（6 REST + 5 WS 完整契约）

---

## 二、DDD 阶段：前端页面设计与组件拆分

### Prompt 2 — 页面布局与组件树设计


```
【DDD阶段｜单一任务：前端页面布局与组件树设计】
前置依赖：API 规范文档、Prisma 数据模型

硬性约束：
1. 仅输出设计文档，不写前端代码
2. 三大页面设计：
   - 首页（/）：讨论列表 + 状态筛选（全部/SETUP/IN_PROGRESS/COMPLETED）+ 创建讨论弹窗
   - 嘉宾配置页（/setup/:id）：话题卡 + 嘉宾信息网格 + 重新生成/确认按钮
   - 演播厅（/studio/:id）：三栏布局（嘉宾面板 + 发言记录 + 共识/分歧面板）
3. 组件树拆分为 18 个独立组件，标注 Props 与 data-testid 属性
4. 响应式断点策略：≥1600 / 1024-1599 / 768-1023 / <768 四种布局
5. 颜色池定义：10 种高区分度 HEX 色值，主持人与专家颜色不重复
```



**开发意图**：在写前端代码前先完成页面结构与组件拆分，确保组件职责单一、数据流清晰。响应式断点策略在此阶段确定，避免后期因布局改动导致大面积返工。data-testid 属性从设计阶段就与 Cypress E2E 测试用例对齐。

**实际产出**：
- `docs/PRD页面设计.md`（18 组件树 + 响应式布局策略）
- 前端 `types/index.ts` + `constants/index.ts`（类型与颜色池）

---

## 三、TDD 阶段：后端接口与服务层

### Prompt 3 — REST API 路由 / 控制器 / 中间件

<details>
<summary>📋 原始 Prompt（点击展开）</summary>

```
【TDD阶段｜单一任务：REST API 路由、控制器与全局中间件开发】
前置依赖：Prisma Schema、API 规范文档

TDD 铁律：先写测试 → 确认失败 → 最小实现 → 确认通过 → 重构

硬性约束：
1. 6 个端点：POST /discussions、GET /discussions、GET /discussions/:id、
   POST /discussions/:id/generate-guests、POST /discussions/:id/confirm-guests、
   POST /discussions/:id/end
2. 统一响应格式 { code: 0, data: {...}, message: "ok" }
3. 全局中间件：
   - validate（Zod 校验 body/query/params）
   - error-handler（ZodError→400, AppError→N, Error→500）
   - logger（请求日志）
4. 讨论生命周期状态机严格校验（状态冲突返回 409）
5. 依赖注入：PrismaClient 通过闭包注入控制器
```

</details>

**开发意图**：REST API 底座是整个后端的基础设施。采用 TDD 方式逐层构建（中间件测试→路由测试→控制器实现），确保每个端点的主流程、参数校验、错误处理在实现前已有测试覆盖。依赖注入模式使控制器可独立于 Express 进行单元测试。

**实际产出**：
- `backend/middleware/validate.ts` + `error-handler.ts` + `logger.ts`
- `backend/schemas/discussion.schema.ts`（6 端点 Zod Schema）
- `backend/controllers/discussions.ts` + `backend/routes/discussions.ts`
- `tests/unit/middleware/` (21 用例) + `tests/unit/routes/` (27 用例)

---

### Prompt 4 — AI 发言调度引擎

<details>
<summary>📋 原始 Prompt（点击展开）</summary>

```
【TDD阶段｜单一任务：AI 圆桌发言调度服务开发】
前置依赖：REST API、WebSocket 服务、Prisma 模型

硬性约束：
1. 仅输出 SpeechScheduler 服务代码与单元测试
2. 核心调度规则：
   - 拒绝机械轮流发言，由 AI 根据讨论逻辑选择下一位发言者
   - 主持人控场：OPENING 开场 / FOLLOW_UP 追问 / BRIDGING 串联 / SUMMARY 总结
   - 专家行为：ANSWER 回应 / SUPPLEMENT 补充 / COUNTER 反驳
   - 每次发言 1-2 短句，50-150 字
3. 内存上下文隔离：Map<discussionId, DiscussionContext> 维护独立上下文
4. 嘉宾状态机：IDLE → PREPARING → SPEAKING → IDLE（全程通过 WebSocket 广播）
5. AI 输出强制 JSON Schema 校验（Zod），禁止自由文本
6. 单元测试覆盖：开场、多讨论隔离、多种发言行为、状态转换、连续发言禁止规则
```

</details>

**开发意图**：发言调度是演播厅的核心 AI 业务层。设计关键点在于：(1) 上下文隔离确保多讨论互不干扰；(2) 状态机驱动 UI 动画（嘉宾卡片呼吸灯/脉冲/辉光效果）；(3) AI 决策而非机械轮询使讨论自然流畅；(4) Zod 校验作为最后防线防止非法数据入库。

**实际产出**：
- `backend/services/speech-scheduler.ts`（~530 行）
- `tests/unit/services/speech-scheduler.test.ts`（25 用例）

---

### Prompt 5 — 实时共识/分歧提炼服务

<details>
<summary>📋 原始 Prompt（点击展开）</summary>

```
【TDD阶段｜单一任务：实时共识分歧提炼服务开发】
前置依赖：REST API、WebSocket 服务、AI 发言调度引擎、Prisma 模型

硬性约束：
1. 仅输出共识提炼 service 代码与单元测试
2. 业务规则：
   - 监听 new_speech 事件，每条新发言异步调用 DeepSeek 提取共识/分歧
   - 区分「达成共识点」「存在分歧点」两类结果
   - 所有数据绑定 discussion_id，多场讨论完全隔离
   - 提炼结果存入 ConsensusRecord 表，触发 consensus_update WS 事件推送
3. 增加接口限流（滑动窗口）+ 失败重试（指数退避），防止高频发言导致 API 超限
4. 强制大模型输出固定 JSON 结构，消除自由文本幻觉
5. 单元测试覆盖：多讨论隔离、增量提炼、限流抑制、异常重试、非法 JSON 拒绝
```

</details>

**开发意图**：共识提炼是"锦上添花"的 AI 分析层，设计核心在于健壮性——即使提炼失败也不影响主讨论流程。限流（15s 窗口 max 2 次）+ 重试（3 次指数退避）确保 DeepSeek API 压力可控；全量快照广播策略保证多端数据一致。

**实际产出**：
- `backend/services/consensusExtractor.ts`（~380 行）
- `tests/unit/services/consensus-extractor.test.ts`（15 用例）

---

## 四、E2E 阶段：全流程自动化测试

### Prompt 6 — Cypress 端到端测试

<details>
<summary>📋 原始 Prompt（点击展开）</summary>

```
【E2E 阶段｜单一任务：Cypress 端到端自动化测试开发】
前置依赖：REST API 完成、WebSocket 服务完成、前端页面完成

硬性约束：
1. 仅输出 Cypress 测试代码与 fixtures 数据
2. 4 个测试场景覆盖全流程：
   - 场景 1：首页创建讨论 → 跳转配置页
   - 场景 2：嘉宾配置页自动生成 → 确认嘉宾
   - 场景 3：演播厅 WebSocket 实时发言 → 共识更新 → 结束讨论
   - 场景 4：错误场景（非法参数、状态冲突、404）
3. 所有选择器使用 data-testid 属性（设计阶段已预留）
4. Mock API 响应与 WebSocket 事件（fixtures 目录）
5. 自定义命令：mockApi / mockWebSocket / waitForText
```

</details>

**开发意图**：E2E 测试是全流程的自动化回归网。选择 data-testid 作为选择器而非 CSS 类名或 XPath，确保 UI 重构不破坏测试。Mock 数据隔离前后端依赖，Cypress 可独立于后端运行。

**实际产出**：
- `frontend/cypress/e2e/full-flow.cy.ts`（4 场景 17 用例）
- `frontend/cypress/support/commands.ts` + `fixtures/`（7 组 API + 2 组 WS Mock）

---

## 五、前端视觉美化

### Prompt 7 — 全局玻璃拟态视觉改造

<details>
<summary>📋 原始 Prompt（点击展开）</summary>

```
【DDD阶段｜单一任务：全局前端页面视觉美化改造】
前置依赖：现有完整 React 三页面代码

硬性约束：
1. 仅修改前端样式、新增页脚、返回首页按钮，禁止改动后端接口/WebSocket/AI 业务逻辑
2. 全局页面底层设置长白山天池自然风光图作为半透明磨砂背景
3. 所有卡片、面板、弹窗增加半透深色磨砂玻璃遮罩（backdrop-filter: blur()）
4. 全局页脚固定展示「AI Panel Studio | 李梦冉 | 13833818010」
5. 演播厅/配置页右上角固定悬浮紫色「返回首页」按钮
6. 弱化纯黑死板底色，降低深色饱和度，柔和渐变阴影，调整按钮标签色彩柔和度
7. 保持全页面响应式适配，窄屏移动端页脚/按钮正常适配不溢出
```

</details>

**开发意图**：视觉层独立于业务逻辑层，修改不触及任何功能代码。三层玻璃拟态系统（`.glass-panel` / `.glass-panel-light` / `.glass-modal`）作为全局 CSS 工具类统一管理，避免在每个组件重复定义。颜色柔化映射表确保品牌一致性。

**实际产出**：
- `frontend/src/index.css`（完全重写，玻璃拟态系统 + 8 个保留动画）
- `frontend/src/components/common/Footer.tsx` + `FloatingHomeButton.tsx`
- `frontend/src/App.tsx`（背景层 + 页脚 + 按钮集成）
- `frontend/src/pages/` 三页面 + 3 个公共组件全面玻璃化

---

## 六、交付文档归档

### Prompt 8 — README 与开发工作流文档

<details>
<summary>📋 原始 Prompt（点击展开）</summary>

```
【交付文档任务｜单一任务：项目完整 README 编写 + AI 协同分层开发工作流说明文档】
前置依赖：全项目前后端代码、AI 调度/共识模块、WebSocket、前端美化全部开发完毕

README 硬性约束：
1. 项目简介、开发技术栈、本地完整部署步骤、核心功能模块介绍、演示操作流程、
   环境变量配置说明、项目作者信息
2. 步骤适配 SQLite 本地开发，新手可一键复现完整演示流程

开发工作流说明硬性约束：
1. 篇幅严格控制在 1～1.5 页
2. 三大板块：分层开发完整流程（时间线顺序）、AI 协同开发 3 组典型问题+解决方案、
   模块化开发设计思路
3. 文末标注项目作者信息
```

</details>

**开发意图**：README 是项目对外门面——让任何开发者无需额外说明即可从零启动。开发工作流说明文档是实习交付的核心复盘材料——既展示过程证据，也沉淀可复用的 AI 协同方法论。典型问题章节的三段式结构（现象→根因→方案）直接来自真实踩坑记录。

**实际产出**：
- `README.md`（351 行，9 板块）
- `docs/开发工作流说明.md`（150 行，3 板块）

---

> **归档统计**：8 段核心 Prompt，覆盖 SDD / DDD / TDD / E2E / 前端美化 / 交付文档 6 个开发阶段。
>
> **AI Panel Studio** | 李梦冉 | 13833818010
