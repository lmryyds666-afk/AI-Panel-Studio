#  AI Panel Studio — AI 圆桌讨论演播厅

> 输入话题 + 专家人数 → AI 自动生成主持人与专家阵容 → 进入演播厅观看 AI 实时驱动的高质量圆桌讨论。

**AI Panel Studio** 是一份远程实习作业成果——一款基于 DeepSeek 大模型的 AI 圆桌讨论 Web App，支持多讨论并行隔离，实时展示发言 Transcript、嘉宾状态动画、共识/分歧智能提炼。

---

## 一、 项目简介

### 解决什么问题？

传统 AI 对话存在视角单一、缺乏互动辩论、过程不可见的问题。AI Panel Studio 模拟真实圆桌讨论场景：

- **多角色碰撞**：1 位主持人 + N 位专家，各持不同立场，自然对话交锋
- **实时可视化**：演播厅三栏布局，嘉宾状态动画 + 逐条发言记录 + 共识/分歧实时提炼
- **多讨论并行**：支持同时创建多场讨论，数据完全隔离
- **全流程闭环**：创建 → AI 生成嘉宾 → 确认阵容 → 自动讨论 → 总结归档

### 核心价值

| 角色 | 价值 |
|:--|:--|
| 知识工作者 | 从多视角深度探讨复杂话题，发现认知盲点 |
| 产品/决策者 | 模拟各方立场碰撞，辅助决策前的情景推演 |
| 教育工作者 | 课堂演示批判性思维、多方辩论的逻辑结构 |
| 内容创作者 | 为文章/视频提供结构化的多视角素材 |

---

## 二、 开发技术栈

| 层级 | 技术 | 说明 |
|:--|:--|:--|
| **后端框架** | Express 5 + TypeScript | RESTful API 服务 |
| **数据库** | SQLite + Prisma 7 | 零配置本地数据库，Prisma adapter 模式 |
| **实时通信** | Socket.IO | WebSocket 房间隔离，5 类实时事件推送 |
| **AI 引擎** | DeepSeek V4 Pro | 兼容 OpenAI SDK，驱动嘉宾生成 + 发言调度 + 共识提炼 |
| **数据校验** | Zod v4 | AI 输出结构化校验，抑制大模型幻觉 |
| **前端框架** | React 19 + TypeScript | Hooks + Context + useReducer 状态管理 |
| **构建工具** | Vite 6 | ESM 原生开发，HMR 热更新 |
| **样式方案** | Tailwind CSS v4 | 玻璃拟态（Glass Morphism） + 响应式 |
| **路由** | React Router v7 | 声明式路由，3 条路由 |
| **测试** | Jest (122 用例) + Cypress (17 用例) | TDD 全流程覆盖 |

### 项目架构

```
AI-Panel-Studio/
├── backend/                     # Express API + WebSocket 服务
│   ├── server.ts                # 入口：createServer() 组装全部依赖
│   ├── lib/prisma.ts            # PrismaClient 工厂（Prisma 7 adapter）
│   ├── prisma/
│   │   ├── schema.prisma        # 4 实体：Discussion / Guest / Speech / ConsensusRecord
│   │   ├── seed.ts              # 5 组高质量预设讨论种子数据
│   │   └── migrations/          # SQLite 迁移文件
│   ├── middleware/               # Zod 校验 / 错误处理 / 日志
│   ├── schemas/                  # 端点 Zod Schema
│   ├── controllers/              # 6 个 REST 端点控制器
│   ├── routes/                   # Express Router 挂载
│   ├── services/
│   │   ├── guest-generation.service.ts  # AI 嘉宾生成
│   │   ├── speech-scheduler.ts          # AI 发言调度引擎
│   │   └── consensusExtractor.ts        # 共识/分歧提炼
│   └── ws/
│       ├── websocket-server.ts  # Socket.IO 房间管理 + 广播
│       └── types.ts             # WS 事件负载类型
├── frontend/                    # React SPA
│   ├── src/
│   │   ├── pages/               # HomePage / GuestSetupPage / StudioPage
│   │   ├── components/common/   # PageHeader / ErrorToast / LoadingSkeleton / Footer
│   │   ├── context/             # 3 个页面级 Context + useReducer
│   │   ├── hooks/               # useApi / useWebSocket
│   │   ├── types/               # 全量 TypeScript 类型
│   │   └── constants/           # 颜色池 / 状态映射
│   └── public/images/           # 长白山天池背景
├── tests/                       # 后端单元/集成测试（122 用例）
├── docs/                        # 设计文档
├── jest.config.ts               # 根 Jest 配置
└── package.json                 # 根 monorepo scripts
```

---

## 三、本地完整部署步骤

### 前置环境

| 工具 | 最低版本 | 检查命令 |
|:--|:--|:--|
| Node.js | ≥ 18 | `node -v` |
| npm | ≥ 9 | `npm -v` |
| Git | 任意 | `git -v` |

### 1. 克隆项目

```bash
git clone https://github.com/lmryyds666-afk/AI-Panel-Studio.git
cd AI-Panel-Studio
```

### 2. 安装依赖

```bash
# 根目录（测试运行依赖）
npm install

# 后端
cd backend
npm install
cd ..

# 前端
cd frontend
npm install
cd ..
```

### 3. 配置环境变量

```bash
# 复制示例配置
# （后端 backend/.env 需手动创建，参考下方「环境变量配置说明」）
```

在 `backend/.env` 中填入：

```env
# DeepSeek API Key（必需——没有此密钥嘉宾生成/发言调度/共识提炼均不可用）
DEEPSEEK_API_KEY=你的DeepSeek_API_Key

# 数据库路径（默认即可）
DATABASE_URL="file:./dev.db"

# 服务端口（默认 3001，避免与前端 5173 冲突）
PORT=3001
```

> 💡 **获取 API Key**：访问 [platform.deepseek.com](https://platform.deepseek.com) 注册并创建 API Key。

### 4. 初始化数据库

```bash
cd backend

# 生成 Prisma Client
npx prisma generate

# 同步 Schema 到 SQLite（创建数据库文件 + 表结构）
npx prisma db push

# 导入种子数据（5 组预设讨论，含嘉宾/发言/共识）
npx prisma db seed

cd ..
```

> ✅ 种子数据包含 5 组不同话题与状态的讨论，可直接用于演示。

### 5. 启动后端

```bash
cd backend
npm run dev
```

看到以下输出表示后端启动成功：

```
[AI Panel Studio] 后端服务已启动 → http://localhost:3001
[AI Panel Studio] 健康检查 → http://localhost:3001/health
[AI Panel Studio] WebSocket → ws://localhost:3001/ws
```

### 6. 启动前端（新终端窗口）

```bash
cd frontend
npm run dev
```

看到以下输出表示前端启动成功：

```
  VITE v6.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 7. 打开浏览器

访问 **http://localhost:5173** → 进入 AI Panel Studio 首页。

---

## 四、 核心功能模块

### 1. REST API 底座

6 个 RESTful 端点，统一 `{ code, data, message }` 响应格式：

| 方法 | 路径 | 说明 | 状态约束 |
|:--|:--|:--|:--|
| `POST` | `/api/discussions` | 创建讨论 | — |
| `GET` | `/api/discussions` | 列表（分页 + 状态筛选） | — |
| `GET` | `/api/discussions/:id` | 详情（嘉宾 + 发言 + 共识计数） | — |
| `POST` | `/api/discussions/:id/generate-guests` | AI 生成嘉宾 | SETUP |
| `POST` | `/api/discussions/:id/confirm-guests` | 确认嘉宾 → 自动调度 | SETUP |
| `POST` | `/api/discussions/:id/end` | 结束讨论 → AI 总结 | IN_PROGRESS |

基于 Zod 参数校验 + 统一错误处理中间件，讨论状态严格校验（状态冲突返回 409）。

### 2. 实时 WebSocket 服务

基于 Socket.IO 房间机制，5 类事件实时推送：

| 事件 | 推送时机 | 负载 |
|:--|:--|:--|
| `guest_status_change` | 嘉宾运行状态变化 | guestId / runStatus / publicThought |
| `new_speech` | 新发言入库 | 发言全文 + 发言者信息 + 类型 |
| `consensus_update` | 共识/分歧有新增 | 共识 + 分歧全量快照 |
| `summary_push` | 讨论结束 | 主持人总结 + 发言总数 |
| `discussion_state_change` | 生命周期转换 | status / previousStatus |

客户端通过 URL 路径 `/ws` + query `discussionId` 天然房间隔离。

### 3. AI 发言调度引擎（SpeechScheduler）

核心调度规则：
- **拒绝机械轮流发言**，由 AI 根据讨论逻辑选择下一位发言者
- **主持人控场**：OPENING 开场 / FOLLOW_UP 追问 / BRIDGING 串联 / SUMMARY 总结
- **专家三种行为**：ANSWER 回应 / SUPPLEMENT 补充 / COUNTER 反驳
- **鼓励观点碰撞**：优先选择立场对立的专家进行反驳
- **每次发言 1-2 短句**，50-150 字，自然讨论节奏（3-8 秒间隔）
- **多讨论内存隔离**：`Map<discussionId, DiscussionContext>` 维护独立上下文

### 4. 实时共识/分歧提炼（ConsensusExtractor）

- **增量触发**：每条新发言异步调用 DeepSeek 分析
- **限流保护**：滑动窗口（15s）+ 调用上限，防止 API 超频
- **重试机制**：指数退避（最多 3 次），抽取失败不影响主流程
- **全量快照广播**：`consensus_update` 推送完整共识 + 分歧列表
- **强结构化校验**：Zod 约束 AI 输出格式，消除自由文本幻觉

### 5. 前端玻璃拟态页面

长白山天池自然风光背景 + 三层玻璃拟态（Glass Morphism）：
- **首页**：讨论列表 + 状态筛选 + 创建弹窗
- **嘉宾配置页**：话题卡 + 嘉宾网格 + 自动 AI 生成
- **演播厅**：三栏独立滚动布局，响应式适配（≥1600 / 1024-1599 / 768-1023 / <768）
- **全局页脚 + 返回首页按钮**

---

## 五、 演示操作流程

### 从头体验完整流程（约 2 分钟）

#### Step 1：创建讨论

1. 打开 http://localhost:5173
2. 点击「+ 新建讨论」
3. 输入话题（如：`AI 是否会在 2030 年前取代 50% 的白领岗位？`）
4. 拖动滑块选择专家人数（2-8 人）
5. 点击「创建」

#### Step 2：生成嘉宾

1. 页面自动跳转到嘉宾配置页
2. AI 自动生成 1 位主持人 + N 位专家（各持不同立场 + 专属颜色）
3. 不满意可点击「🔄 重新生成」
4. 点击「✅ 确认并进入演播厅」

#### Step 3：观看 AI 圆桌讨论

1. 进入演播厅三栏界面
2. **左侧**：嘉宾状态卡片（IDLE 灰色 → PREPARING 黄色脉冲 → SPEAKING 绿色跳动辉光）
3. **中间**：发言记录逐条出现（OPENING 开场 → ANSWER 回应 → COUNTER 反驳 → FOLLOW_UP 追问）
4. **右侧**：共识 ✅ 与分歧 ⚡ 实时提炼
5. 讨论自动进行 12 轮后自动结束

#### Step 4：查看总结

1. 讨论结束后，Transcript 显示「── 讨论结束 ──」分隔线
2. 主持人 AI 总结展示在底部
3. 共识/分歧面板展示最终结论

#### 使用种子数据直接体验

```bash
cd backend
npx prisma db seed
```

种子数据包含 2 个已完成讨论的完整历程（含发言和共识），打开首页即可点击进入查看。

---

## 六、 环境变量配置说明

所有环境变量配置在后端 `.env` 文件中（`backend/.env`）：

| 变量名 | 必填 | 默认值 | 说明 |
|:--|:--|:--|:--|
| `DEEPSEEK_API_KEY` | ✅ | — | DeepSeek API 密钥，用于嘉宾生成/发言调度/共识提炼 |
| `DATABASE_URL` | ❌ | `file:./dev.db` | SQLite 数据库文件路径 |
| `PORT` | ❌ | `3001`（`.env`）/ `3000`（代码回退） | 后端服务端口 |
| `DEEPSEEK_MODEL` | ❌ | `deepseek-chat` | DeepSeek 模型名称 |

> ⚠️ **安全提醒**：切勿将 `.env` 文件提交到 Git 仓库。`.gitignore` 已包含 `.env`。

---

## 七、测试

### 运行全部测试

```bash
# 项目根目录
npm test                 # 串行运行 122 个测试用例
```

### 测试分布

| 模块 | 用例数 | 覆盖范围 |
|:--|:--|:--|
| 中间件 | 21 | validate / error-handler / logger |
| 路由 + 控制器 | 27 | 6 REST 端点 + 错误场景 |
| 嘉宾生成 | 15 | Prompt 构建 / JSON 提取 / 校验 / DB 写入 |
| 发言调度 | 25 | 开场 / 隔离 / 多行为 / 状态转换 / WS 广播 / 校验 |
| 共识提炼 | 15 | 提炼 / 隔离 / 限流 / 重试 / JSON 校验 / 增量 |
| WebSocket 服务 | 19 | 连接 / 房间隔离 / 5 事件广播 / 信封格式 |
| **合计** | **122** | — |

---

## 八、 项目作者

| | |
|:--|:--|
| **项目名称** | AI Panel Studio |
| **作者** | 李梦冉 |
| **联系方式** | 13833818010 |
| **GitHub** | [github.com/lmryyds666-afk/AI-Panel-Studio](https://github.com/lmryyds666-afk/AI-Panel-Studio) |

## 九、其他（数据库数据可视化）

Prisma 自带的**网页版数据库可视化工具**，专门用来查看、修改本地 SQLite（dev.db）里所有数据表数据

```
npx prisma studio
```

<img width="1877" height="965" alt="image" src="https://github.com/user-attachments/assets/ab933d33-f26c-40b5-a06a-412a3aca7e47" />
<img width="1889" height="968" alt="image" src="https://github.com/user-attachments/assets/48d27ffb-2226-4396-9561-065e34e3c9f2" />
<img width="1900" height="971" alt="image" src="https://github.com/user-attachments/assets/cd4d9c77-05c1-4b47-9b6b-f28935136af9" />


## 📄 License

MIT
