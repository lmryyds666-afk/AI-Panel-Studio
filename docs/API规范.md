# AI Panel Studio — API 与实时事件规范

> **版本**：v1.0  
> **协议**：RESTful（HTTP/1.1）+ WebSocket（实时事件）  
> **数据格式**：JSON（请求与响应均使用 `application/json`）  
> **编码**：UTF-8  
> **多讨论隔离**：所有接口与事件均携带 `discussion_id`

---

## 1. RESTful 接口清单

### 1.1 基础约定

| 项目 | 约定 |
|:--|:--|
| Base URL | `http://localhost:{PORT}/api` |
| 成功响应格式 | `{ "code": 0, "data": { ... }, "message": "ok" }` |
| 错误响应格式 | `{ "code": <错误码>, "data": null, "message": "<错误描述>" }` |
| 认证 | MVP 阶段无认证，后续可扩展 API Key |
| 超时 | 普通接口 10s；`generate-guests`（涉及 AI 调用）30s |

#### 统一错误码

| code | 含义 |
|:--|:--|
| `0` | 成功 |
| `400` | 请求参数错误 |
| `404` | 讨论不存在 |
| `409` | 状态冲突（例如对已结束的讨论发起操作） |
| `500` | 服务端异常（含 AI 调用失败） |

---

### 1.2 接口详情

#### 1.2.1 创建讨论

创建一个新的讨论，状态为 `SETUP`，等待后续生成嘉宾。

```
POST /api/discussions
```

**请求体**

```json
{
  "topic": "AI 是否会在 2030 年前取代 50% 的白领岗位？",
  "expertCount": 4
}
```

| 字段 | 类型 | 必填 | 约束 | 说明 |
|:--|:--|:--|:--|:--|
| `topic` | string | ✅ | 1–200 字符 | 讨论话题 |
| `expertCount` | integer | ❌ | 2–8，默认 `4` | 期望专家人数（不含主持人） |

**成功响应** `201 Created`

```json
{
  "code": 0,
  "data": {
    "id": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
    "topic": "AI 是否会在 2030 年前取代 50% 的白领岗位？",
    "status": "SETUP",
    "expertCount": 4,
    "createdAt": "2026-06-20T08:00:00.000Z",
    "updatedAt": "2026-06-20T08:00:00.000Z"
  },
  "message": "ok"
}
```

**错误示例**

```json
{
  "code": 400,
  "data": null,
  "message": "话题不能为空，且长度需在 1–200 字符之间"
}
```

---

#### 1.2.2 获取讨论列表

返回所有讨论的摘要列表，支持按状态筛选与分页。

```
GET /api/discussions?status={status}&page={page}&pageSize={pageSize}
```

| 查询参数 | 类型 | 必填 | 说明 |
|:--|:--|:--|:--|
| `status` | string | ❌ | 筛选条件：`SETUP` / `IN_PROGRESS` / `COMPLETED`；不传返回全部 |
| `page` | integer | ❌ | 页码，默认 `1`，最小 `1` |
| `pageSize` | integer | ❌ | 每页数量，默认 `20`，最大 `100` |

**成功响应** `200 OK`

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
        "topic": "AI 是否会在 2030 年前取代 50% 的白领岗位？",
        "status": "IN_PROGRESS",
        "expertCount": 4,
        "guestCount": 5,
        "createdAt": "2026-06-20T08:00:00.000Z",
        "updatedAt": "2026-06-20T08:05:00.000Z"
      }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 20
  },
  "message": "ok"
}
```

| 字段 | 说明 |
|:--|:--|
| `guestCount` | 嘉宾总数（含主持人），例如 expertCount=4 → 5 人 |
| `total` | 符合条件的总数 |
| `items` | 按 `updatedAt` 降序排列 |

---

#### 1.2.3 生成嘉宾

调用大模型生成主持人 + 专家阵容，写入 Guest 表，讨论状态保持 `SETUP` 等待用户确认。

```
POST /api/discussions/{discussion_id}/generate-guests
```

**路径参数**

| 参数 | 类型 | 说明 |
|:--|:--|:--|
| `discussion_id` | string (UUID) | 讨论 ID |

**请求体** — 无（所需信息 `topic` 和 `expertCount` 已存在于 Discussion 记录中）。

**成功响应** `200 OK`

```json
{
  "code": 0,
  "data": {
    "discussionId": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
    "guests": [
      {
        "id": "g1b2c3d4-...",
        "name": "张维远",
        "role": "HOST",
        "occupation": "资深科技媒体人",
        "title": "《前沿对话》栏目主持人",
        "stance": "中立引导者，擅长在分歧中找到共同点",
        "color": "#4ECDC4",
        "sortOrder": 0
      },
      {
        "id": "g2c3d4e5-...",
        "name": "李敏华",
        "role": "EXPERT",
        "occupation": "AI 研究员",
        "title": "某头部科技公司 AI Lab 高级研究员",
        "stance": "认为 AI 将在 2030 年前显著替代重复性脑力劳动，但创造性工作仍然安全",
        "color": "#FF6B6B",
        "sortOrder": 1
      }
    ]
  },
  "message": "ok"
}
```

| 字段 | 说明 |
|:--|:--|
| `role` | `HOST`（主持人，仅 1 位）或 `EXPERT`（专家） |
| `color` | 6 位 HEX 色值（含 `#`），主持人与专家各有区分 |
| `sortOrder` | 主持人 = 0，专家从 1 开始递增 |
| `runStatus` | 生成时默认 `IDLE`，不在响应中返回（前端可直接视为 IDLE） |

**业务规则**
- 如果已有嘉宾记录，再次调用会**先删除旧记录再重新生成**（幂等覆盖）。
- AI 生成失败返回 `500`，`message` 中附带原因。
- 最多重试 2 次；仍然失败则返回错误，不写入任何 Guest。

**错误示例（状态冲突）**

```json
{
  "code": 409,
  "data": null,
  "message": "当前讨论状态为 COMPLETED，不允许生成嘉宾"
}
```

---

#### 1.2.4 确认嘉宾阵容（进入演播厅）

用户审阅嘉宾阵容后确认，将讨论状态从 `SETUP` 切换为 `IN_PROGRESS`，前端随之跳转演播厅。

```
POST /api/discussions/{discussion_id}/confirm-guests
```

**成功响应** `200 OK`

```json
{
  "code": 0,
  "data": {
    "id": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
    "status": "IN_PROGRESS",
    "updatedAt": "2026-06-20T08:02:00.000Z"
  },
  "message": "ok"
}
```

**业务规则**
- 仅在 `status = SETUP` 且 guests 记录数 ≥ 2（主持人 + 至少 1 位专家）时可调用。
- 调用后后端启动该讨论的 AI 讨论调度流程。

---

#### 1.2.5 获取讨论详情

获取单个讨论的完整信息（含嘉宾列表、transcript 摘要、共识/分歧数量）。

```
GET /api/discussions/{discussion_id}
```

**成功响应** `200 OK`

```json
{
  "code": 0,
  "data": {
    "id": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
    "topic": "AI 是否会在 2030 年前取代 50% 的白领岗位？",
    "status": "IN_PROGRESS",
    "expertCount": 4,
    "summary": null,
    "guests": [
      {
        "id": "g1b2c3d4-...",
        "name": "张维远",
        "role": "HOST",
        "occupation": "资深科技媒体人",
        "title": "《前沿对话》栏目主持人",
        "stance": "中立引导者，擅长在分歧中找到共同点",
        "color": "#4ECDC4",
        "runStatus": "SPEAKING",
        "sortOrder": 0
      }
    ],
    "speechCount": 23,
    "consensusCount": 3,
    "divergenceCount": 2,
    "createdAt": "2026-06-20T08:00:00.000Z",
    "updatedAt": "2026-06-20T08:05:00.000Z"
  },
  "message": "ok"
}
```

> **说明**：该接口作为补充接口，供首页列表点击进入详情/演播厅时使用，不在此次 4 个核心接口中，但属于完整 API 契约的必要组成部分。

---

#### 1.2.6 结束讨论

主持人做出总结后（或用户手动触发结束），将讨论状态切换为 `COMPLETED`。

```
POST /api/discussions/{discussion_id}/end
```

**请求体** — 无。

**成功响应** `200 OK`

```json
{
  "code": 0,
  "data": {
    "id": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
    "status": "COMPLETED",
    "summary": "本次讨论围绕 AI 替代白领岗位的时间表展开。共识在于：重复性、规则化的工作将在 5 年内大比例自动化；分歧在于：涉及跨域判断与共情能力的岗位是否可被替代。主持人张维远指出，讨论揭示了一个关键盲点——我们过分聚焦于「岗位」替代，而忽略了「任务」粒度上的渐进式人机协作才是未来主流。",
    "updatedAt": "2026-06-20T08:15:00.000Z"
  },
  "message": "ok"
}
```

**业务规则**
- 仅在 `status = IN_PROGRESS` 时可调用。
- 后端触发主持人总结发言 → 写入 `summary` → 状态切换为 `COMPLETED`。
- 若 `summary` 尚未生成（仍在等待 AI 输出），立即返回 `status=COMPLETED` 但 `summary=null`，后续通过 WebSocket 推送总结。

---

### 1.3 接口汇总

| 方法 | 路径 | 说明 | 讨论状态要求 |
|:--|:--|:--|:--|
| `POST` | `/api/discussions` | 创建讨论 | — |
| `GET` | `/api/discussions` | 获取讨论列表 | — |
| `GET` | `/api/discussions/{id}` | 获取讨论详情 | — |
| `POST` | `/api/discussions/{id}/generate-guests` | AI 生成嘉宾阵容 | `SETUP` |
| `POST` | `/api/discussions/{id}/confirm-guests` | 确认嘉宾，进入演播厅 | `SETUP` |
| `POST` | `/api/discussions/{id}/end` | 结束讨论 | `IN_PROGRESS` |

---

## 2. WebSocket 实时事件定义

### 2.1 连接与订阅

```
ws://localhost:{PORT}/ws/discussions/{discussion_id}
```

- 客户端通过 URL 路径中的 `discussion_id` 声明加入哪场讨论的实时频道。
- 服务端只推送该 `discussion_id` 范围内的事件，**天然实现多讨论隔离**。
- 连接建立后无需额外订阅动作，直接开始接收事件。
- 断线重连由客户端实现（MVP 不做服务端消息补推）。

### 2.2 通用事件信封

所有 WebSocket 推送消息使用统一 JSON 信封：

```json
{
  "event": "<事件类型>",
  "discussionId": "d7a1c9e2-...",
  "timestamp": "2026-06-20T08:05:30.123Z",
  "payload": { ... }
}
```

| 字段 | 类型 | 说明 |
|:--|:--|:--|
| `event` | string | 事件类型标识 |
| `discussionId` | string (UUID) | 所属讨论（客户端可校验） |
| `timestamp` | string (ISO 8601) | 事件发生时间 |
| `payload` | object | 事件负载，随 `event` 类型变化 |

---

### 2.3 事件清单

#### 2.3.1 嘉宾状态更新 `guest_status_change`

当**任意嘉宾**的 `runStatus` 发生变化时推送（IDLE → PREPARING → SPEAKING → IDLE 的循环转换）。

```json
{
  "event": "guest_status_change",
  "discussionId": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
  "timestamp": "2026-06-20T08:05:30.123Z",
  "payload": {
    "guestId": "g2c3d4e5-...",
    "runStatus": "SPEAKING",
    "publicThought": "正在从劳动力市场弹性角度回应对手的自动化预测"
  }
}
```

**payload 字段**

| 字段 | 类型 | 说明 |
|:--|:--|:--|
| `guestId` | string (UUID) | 状态变更的嘉宾 ID |
| `runStatus` | string | `IDLE` / `PREPARING` / `SPEAKING` |
| `publicThought` | string | 当前关注点或公开思考摘要（**不暴露隐藏 CoT**），PREPARING / SPEAKING 时填充，IDLE 时为空 |

**前端行为**
- 专家状态小窗实时切换对应嘉宾的状态标签与动画效果。
- `publicThought` 显示在小窗的「思考摘要」区域，供观众感知讨论节奏。

---

#### 2.3.2 新发言 `new_speech`

当**任意嘉宾**发表可见发言时推送（`isVisible = true`）。

```json
{
  "event": "new_speech",
  "discussionId": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
  "timestamp": "2026-06-20T08:06:00.456Z",
  "payload": {
    "id": "s1a2b3c4-...",
    "guestId": "g2c3d4e5-...",
    "guestName": "李敏华",
    "guestTitle": "某头部科技公司 AI Lab 高级研究员",
    "guestColor": "#FF6B6B",
    "content": "我不同意。2016 年我们预测自动驾驶会在 2020 年普及，但至今 L5 仍未实现。技术替代的时间表从来都比预测更保守。",
    "speechType": "COUNTER",
    "sequence": 15
  }
}
```

**payload 字段**

| 字段 | 类型 | 说明 |
|:--|:--|:--|
| `id` | string (UUID) | 发言 ID |
| `guestId` | string (UUID) | 发言人 ID |
| `guestName` | string | 发言人姓名 |
| `guestTitle` | string | 发言人 Title（便于 Transcript 显示） |
| `guestColor` | string | 发言人专属颜色 HEX |
| `content` | string | 完整发言内容（1–2 句） |
| `speechType` | string | `OPENING` / `FOLLOW_UP` / `BRIDGING` / `ANSWER` / `SUPPLEMENT` / `COUNTER` / `SUMMARY` |
| `sequence` | integer | 全局递增序号，确保前端按序渲染 |

**前端行为**
- 追加到 Transcript 区域底部，自动滚动。
- 发言者色块使用 `guestColor`，显示 `guestName` + `guestTitle`。
- 内部事件（举手/抢答等，`isVisible=false`）**不**通过此事件推送。

---

#### 2.3.3 共识/分歧刷新 `consensus_update`

讨论过程中后端持续分析发言并提炼共识/分歧，每次有新的 `ConsensusRecord` 被创建时推送**当前完整的共识与分歧列表**（增量触发 + 前端全量替换，避免多端不一致）。

```json
{
  "event": "consensus_update",
  "discussionId": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
  "timestamp": "2026-06-20T08:08:15.789Z",
  "payload": {
    "consensus": [
      {
        "id": "cr1a2b3c-...",
        "content": "各方认同：到 2030 年，重复性、规则化的白领任务将被大比例自动化，但这不是「岗位消失」而是「任务重构」",
        "relatedSpeechIds": ["s1a2b3c4-...", "s5e6f7g8-..."],
        "createdAt": "2026-06-20T08:08:15.789Z"
      }
    ],
    "divergence": [
      {
        "id": "cr2b3c4d-...",
        "content": "争论焦点：涉及跨域判断与共情的岗位（如高级管理、心理咨询）是否在 2030 年前面临实质性威胁",
        "relatedSpeechIds": ["s3c4d5e6-...", "s7g8h9i0-..."],
        "createdAt": "2026-06-20T08:07:30.456Z"
      }
    ]
  }
}
```

**payload 字段**

| 字段 | 类型 | 说明 |
|:--|:--|:--|
| `consensus` | array | 当前所有共识记录列表 |
| `divergence` | array | 当前所有分歧记录列表 |
| `consensus[n].id` | string (UUID) | 记录 ID |
| `consensus[n].content` | string | 共识内容描述 |
| `consensus[n].relatedSpeechIds` | array[string] | 关联发言 ID，前端可按需高亮溯源 |
| `divergence[n]` | — | 字段同上 |

**前端行为**
- 全量替换共识区与分歧区的内容，确保与后端一致。
- 新记录可通过短暂的渐入动画突出显示。

---

#### 2.3.4 总结推送 `summary_push`

当讨论状态变为 `COMPLETED` 且主持人总结生成完毕后推送。

```json
{
  "event": "summary_push",
  "discussionId": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
  "timestamp": "2026-06-20T08:15:00.000Z",
  "payload": {
    "summary": "本次讨论围绕 AI 替代白领岗位的时间表展开。共识在于：重复性、规则化的工作将在 5 年内大比例自动化；分歧在于：涉及跨域判断与共情能力的岗位是否可被替代。主持人张维远指出，讨论揭示了一个关键盲点——我们过分聚焦于「岗位」替代，而忽略了「任务」粒度上的渐进式人机协作才是未来主流。",
    "totalSpeeches": 42
  }
}
```

**payload 字段**

| 字段 | 类型 | 说明 |
|:--|:--|:--|
| `summary` | string | 主持人自然语言总结 |
| `totalSpeeches` | integer | 总发言数 |

**前端行为**
- 演播厅进入「结束」状态，Transcript 停止追加。
- 展示总结内容，主持人色块高亮。
- 可同时推送 `discussion_state_change` 通知状态切换。

---

#### 2.3.5 讨论状态变更 `discussion_state_change`（补充事件）

当讨论生命周期发生转换时推送。

```json
{
  "event": "discussion_state_change",
  "discussionId": "d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e",
  "timestamp": "2026-06-20T08:15:00.000Z",
  "payload": {
    "status": "COMPLETED",
    "previousStatus": "IN_PROGRESS"
  }
}
```

| `status` | 含义 |
|:--|:--|
| `SETUP` | 讨论已创建，嘉宾待生成/待确认 |
| `IN_PROGRESS` | 演播厅讨论进行中 |
| `COMPLETED` | 讨论已结束 |

---

### 2.4 事件汇总

| 事件名 | 推送时机 | 推送粒度 |
|:--|:--|:--|
| `guest_status_change` | 任意嘉宾 runStatus 变化 | 按嘉宾推送 |
| `new_speech` | isVisible=true 的新发言 | 逐条推送 |
| `consensus_update` | 共识/分歧列表有新增 | 全量快照 |
| `summary_push` | 主持人总结生成完毕 | 一次性推送 |
| `discussion_state_change` | 讨论生命周期转换 | 状态切换时推送 |

---

## 3. 多讨论隔离机制

```
                ┌─────────────────────────────┐
                │        WebSocket Server      │
                │                              │
                │   ws://host/ws/{disc_id_1}  ──► 只推送 discussion_1 事件
                │   ws://host/ws/{disc_id_2}  ──► 只推送 discussion_2 事件
                │   ws://host/ws/{disc_id_3}  ──► 只推送 discussion_3 事件
                └─────────────────────────────┘
```

| 层面 | 隔离方式 |
|:--|:--|
| **RESTful API** | `discussion_id` 作为路径参数，数据库查询带 `WHERE discussion_id = ?` |
| **WebSocket** | `discussion_id` 嵌入连接 URL，服务端仅向匹配的频道广播 |
| **数据库** | 所有子表（Guest/Speech/ConsensusRecord）通过 `discussionId` 外键 + 索引隔离 |
| **并发讨论** | 每场讨论在后端拥有独立的 AI 调度上下文（内存/状态机），互不干扰 |
