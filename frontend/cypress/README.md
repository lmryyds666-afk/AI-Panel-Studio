# Cyberpress E2E 测试执行说明

## 目录结构

```
frontend/
├── package.json                     # 依赖声明
├── cypress.config.ts                # Cypress 配置
├── cypress/
│   ├── e2e/
│   │   └── full-flow.cy.ts          # 全流程 E2E 测试（4 个场景）
│   ├── support/
│   │   ├── e2e.ts                   # 测试入口（引入自定义命令）
│   │   └── commands.ts              # 自定义命令（mockApi / mockWebSocket / waitForText）
│   └── fixtures/
│       ├── discussions.json         # RESTful API mock 数据
│       └── ws-events.json           # WebSocket 事件 mock 数据
```

## 测试覆盖

| 场景 | 测试用例数 | 说明 |
|:--|:--|:--|
| **全流程** | 8 | 首页→新建讨论→生成嘉宾→确认→演播厅→实时发言→共识分歧→结束总结 |
| **多讨论隔离** | 2 | 两场讨论 WebSocket 事件互不串扰 |
| **响应式布局** | 4 | 超宽屏/桌面/平板/手机四个断点 |
| **边界场景** | 3 | 空列表、已完成讨论回放、网络异常 |

## 环境准备

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 启动前后端服务（二选一）

**方案 A：依赖真实前后端**

```bash
# 终端 1：启动后端
cd backend && npm run dev

# 终端 2：启动前端
cd frontend && npm run dev
```

**方案 B：仅用 Cypress mock（前后端无需运行）**

E2E 测试已通过 `cy.intercept()` 和 `cy.mockWebSocket()` 完全 mock 了 API 和 WebSocket。
前端页面需要存在（Vite/React 开发服务器），但页面上的组件逻辑通过与 mock 数据交互来验证。

### 3. 运行测试

```bash
# 交互模式（可视化，用于调试）
npx cypress open

# 无头模式（CI/命令行）
npx cypress run

# 指定浏览器
npx cypress run --browser chrome
```

## 自定义命令说明

### `cy.mockApi(mocks)`

批量拦截 API 请求：

```ts
cy.mockApi({
  list: discussionListMock,      // GET /api/discussions
  create: createMock,            // POST /api/discussions
  generateGuests: guestsMock,    // POST /api/discussions/:id/generate-guests
  confirmGuests: confirmMock,    // POST /api/discussions/:id/confirm-guests
  endDiscussion: endMock,        // POST /api/discussions/:id/end
});
```

### `cy.mockWebSocket(discussionId, events, interval?)`

注入 mock WebSocket，按时间间隔推送事件：

```ts
cy.mockWebSocket('disc-123', [
  { event: 'new_speech', discussionId: 'disc-123', ... },
  { event: 'consensus_update', discussionId: 'disc-123', ... },
], 200); // 每 200ms 推送一条
```

**隔离机制**：`MockWebSocket` 构造函数从 URL 中提取 `discussion_id`，只向匹配的连接推送事件。不同 `discussionId` 的 WebSocket 连接收到不同的事件流。

### `cy.waitForText(text, options?)`

等待文本出现在页面中：

```ts
cy.waitForText('欢迎收看《前沿对话》', { timeout: 5000 });
```

## Mock 数据结构

所有 mock 数据集中在 `cypress/fixtures/` 目录：

- `discussions.json`：包含 7 个 API 响应（列表/创建/详情/生成嘉宾/确认/演播厅详情/结束）
- `ws-events.json`：包含 2 组 WebSocket 事件流（disc1: 15 个事件；disc2: 2 个事件）

## 注意事项

1. **测试顺序无关**：每个 `it()` 块独立，通过 `beforeEach` 重置 mock
2. **WebSocket 注入时机**：`cy.mockWebSocket()` 必须在 `cy.visit()` 之前调用
3. **`data-testid` 约定**：组件应包含 `data-testid` 属性（如 `data-testid="guest-panel"`），便于 E2E 测试定位
4. **mock 数据与 API 契约一致**：fixture 中的数据严格遵循 `docs/API规范.md` 定义的结构
