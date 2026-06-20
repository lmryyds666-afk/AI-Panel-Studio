# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「AI Panel Studio」是一份远程实习作业——AI 圆桌讨论 Web App MVP。用户输入话题+专家人数，系统调用 DeepSeek 大模型生成主持人与专家阵容，进入演播厅观看 AI 实时驱动的圆桌讨论。

技术栈：TypeScript 全栈、Express 后端、Prisma 7 + SQLite、纯前端（框架待定）、DeepSeek V4 Pro API。

## 开发范式与阶段

项目按 SDD → DDD → TDD → E2E 四阶段推进，每个阶段专注单一模块，禁止一次性生成完整项目。当前已完成：

- **SDD**：SQLite 数据建模（ER图 + Prisma schema）+ API/WebSocket 契约文档
- **DDD**：前端页面布局、组件树、交互设计（仅设计文档，未写前端代码）
- **TDD**：嘉宾生成服务 + REST API 路由/控制器/中间件 + 单元/集成测试（63 用例）
- **E2E**：Cypress 全流程测试脚本（17 用例，前端尚未实现，暂无法运行）

**TDD 铁律**：先写测试 → 确认失败 → 最小实现 → 确认通过 → 重构。不允许先写实现后补测试。

## 常用命令

### 后端

```bash
cd backend

# 启动开发服务器（默认 http://localhost:3001）
npm run dev

# 数据库操作
npm run db:generate          # 生成 Prisma Client
npm run db:migrate           # 创建迁移
npx prisma db push           # 同步 schema 到数据库（不生成迁移文件）

# 运行后端自身的测试（backend/jest.config.ts）
npm test
npm run test:runInBand       # 串行执行（避免 SQLite 锁冲突）
npm run test:watch
```

### 前端

```bash
cd frontend

# 安装依赖（Cypress）
npm install

# E2E 测试（需要前端 dev server 运行中）
npx cypress open              # 交互模式
npx cypress run               # 无头模式
```

### 从项目根目录运行全部测试

```bash
# 串行执行（推荐：避免多套件争抢 SQLite 锁）
npm test

# 并行执行（仅当测试不使用同一 SQLite 文件时）
npm run test:parallel

# 运行单个测试文件
npx jest --config jest.config.ts --testPathPatterns="tests/unit/middleware"
```

## 项目架构

```
AI-Panel-Studio/
├── backend/                     # Express API 服务
│   ├── server.ts                # 入口：createApp() 工厂 + 监听启动
│   ├── lib/prisma.ts            # PrismaClient 工厂（Prisma 7 adapter 模式）
│   ├── prisma/
│   │   └── schema.prisma        # 4 实体：Discussion / Guest / Speech / ConsensusRecord
│   ├── prisma.config.ts         # Prisma 7 迁移配置（datasource url 在此配置）
│   ├── middleware/
│   │   ├── validate.ts          # Zod 校验中间件（body/query/params）
│   │   ├── error-handler.ts     # 统一错误处理（ZodError→400, AppError→N, Error→500）
│   │   └── logger.ts            # 请求日志
│   ├── schemas/
│   │   └── discussion.schema.ts # 6 个端点的 Zod Schema
│   ├── controllers/
│   │   └── discussions.ts       # 6 个控制器（闭包注入 PrismaClient）
│   ├── routes/
│   │   └── discussions.ts       # Express Router，挂载校验+控制器
│   ├── services/
│   │   └── guest-generation.service.ts  # 嘉宾生成：prompt构建→AI调用→JSON解析→Zod校验→写库
│   └── types/
│       └── errors.ts            # AppError（带 statusCode 的 Error 子类）
├── frontend/                    # 前端（目前仅有 Cypress E2E 测试 + 设计文档）
│   └── cypress/
│       ├── e2e/full-flow.cy.ts  # 4 场景 17 用例
│       ├── support/commands.ts  # mockApi / mockWebSocket / waitForText
│       └── fixtures/            # Mock 数据（7 组 API 响应 + 2 组 WS 事件）
├── tests/                       # 测试代码（由根目录 jest.config.ts 管理）
│   └── unit/
│       ├── middleware/           # 21 用例：validate / error-handler / logger
│       ├── routes/              # 27 用例：6 REST 端点 + 错误场景
│       └── services/            # 15 用例：嘉宾生成
├── docs/                        # 设计文档（md + mermaid 图）
│   ├── 项目要求.md
│   ├── ER图.md                  # Mermaid ER 图 + 关系表
│   ├── API规范.md               # 6 REST + 5 WebSocket 事件完整契约
│   ├── PRD页面设计.md           # 18 组件树 + 响应式布局策略
│   └── Prompt记录.md            # 核心 Prompt 记录
├── jest.config.ts               # 根 Jest 配置（tests/ + backend/，ts-jest）
└── tsconfig.json                # 根 TypeScript 配置
```

## 关键技术细节

### Prisma 7 变更

- **不可在 schema 中写 `url`**：数据库连接通过 `prisma.config.ts` 的 `datasource.url` 配置
- **必须使用 adapter**：`new PrismaClient({ adapter: new PrismaLibSql({ url }) })`，见 `backend/lib/prisma.ts`
- `PrismaLibSql` 名称（注意大小写：`LibSql` 而非 `LibSQL`）

### 测试配置

项目有两套 Jest 配置：
- **根目录 `jest.config.ts`**：负责 `tests/` 和 `backend/` 下所有测试，使用 `ts-jest` 转译，`isolatedModules: true`
- **后端 `backend/jest.config.ts`**：后端自身也可独立运行测试

**SQLite 锁问题**：多个套件同时连接 `test.db` 会超时。使用 `--runInBand` 串行执行。

**测试数据库同步**：测试依赖 `test.db`，若 schema 变更需重新推送：
```bash
cd backend
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="允许执行" DATABASE_URL="file:./test.db" npx prisma db push --force-reset
```

### Express 5.x 注意事项

`req.query` 是只读 getter，不可直接赋值。`validate` 中间件使用 `Object.defineProperty` 覆盖。

### API 统一响应格式

```ts
// 成功
{ code: 0, data: { ... }, message: "ok" }
// 失败
{ code: 400|404|409|500, data: null, message: "错误描述" }
```

### 多讨论隔离

所有 REST 端点路径参数含 `discussion_id`（UUID），数据库查询强制 `WHERE discussionId`，WebSocket 通过 URL 路径 `/ws/discussions/{id}` 天然隔离。

### AI 调用

DeepSeek API 兼容 OpenAI SDK：
- `baseURL: 'https://api.deepseek.com'`
- `model: 'deepseek-chat'`
- API Key 通过环境变量 `DEEPSEEK_API_KEY` 配置（`backend/.env`），绝不能暴露到前端
- `generate-guests` 端点超时 30s，失败后不写入任何 Guest

### 颜色池

10 种高区分度 HEX 色值，确保主持人与专家颜色不重复：
```
#FF6B6B, #45B7D1, #F7DC6F, #BB8FCE, #4ECDC4,
#FF8C42, #2ECC71, #E74C3C, #3498DB, #F39C12
```

### 讨论生命周期

```
SETUP → (生成嘉宾) → SETUP → (确认嘉宾) → IN_PROGRESS → (结束) → COMPLETED
```

各端点严格校验当前状态，状态冲突返回 409。
