/**
 * AI Panel Studio — 前端全局类型定义
 *
 * 与后端 API 规范 + Prisma Schema 严格对齐。
 * 所有接口对应 REST 响应 + WebSocket 事件 payload。
 */

// ─── 枚举类型 ────────────────────────────────────────

export type DiscussionStatus = 'SETUP' | 'IN_PROGRESS' | 'COMPLETED';

export type GuestRole = 'HOST' | 'EXPERT';

export type RunStatus = 'IDLE' | 'PREPARING' | 'SPEAKING';

export type SpeechType =
  | 'OPENING'
  | 'FOLLOW_UP'
  | 'BRIDGING'
  | 'ANSWER'
  | 'SUPPLEMENT'
  | 'COUNTER'
  | 'SUMMARY';

export type InsightType = 'consensus' | 'divergence';

export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// ─── API 响应 ─────────────────────────────────────────

/** 统一 API 响应信封 */
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

/** 分页数据 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── 讨论 ────────────────────────────────────────────

/** 讨论摘要（列表用） */
export interface DiscussionSummary {
  id: string;
  topic: string;
  status: DiscussionStatus;
  expertCount: number;
  guestCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 讨论详情（单个查询 + 配置页用） */
export interface DiscussionDetail {
  id: string;
  topic: string;
  status: DiscussionStatus;
  expertCount: number;
  summary: string | null;
  guests: Guest[];
  speeches: Speech[];
  speechCount: number;
  consensusCount: number;
  divergenceCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── 嘉宾 ────────────────────────────────────────────

/** 嘉宾（配置页展示） */
export interface Guest {
  id: string;
  name: string;
  role: GuestRole;
  occupation: string;
  title: string;
  stance: string;
  color: string;
  sortOrder: number;
  runStatus?: RunStatus;
}

/** 嘉宾运行时状态（演播厅用） */
export interface GuestRuntime {
  id: string;
  name: string;
  role: GuestRole;
  color: string;
  runStatus: RunStatus;
  publicThought: string;
}

// ─── 发言 ────────────────────────────────────────────

/** 发言（Transcript 展示） */
export interface Speech {
  id: string;
  guestId: string;
  guestName: string;
  guestTitle: string;
  guestColor: string;
  content: string;
  speechType: SpeechType;
  sequence: number;
  createdAt?: string;
}

// ─── 共识/分歧 ───────────────────────────────────────

/** 共识或分歧记录 */
export interface InsightRecord {
  id: string;
  content: string;
  relatedSpeechIds: string[];
  createdAt: string;
}

// ─── WebSocket 事件 ──────────────────────────────────

export interface WsEventEnvelope {
  event: string;
  discussionId: string;
  timestamp: string;
  payload: unknown;
}

export interface GuestStatusChangePayload {
  guestId: string;
  runStatus: RunStatus;
  publicThought: string;
}

export interface NewSpeechPayload extends Speech {}

export interface ConsensusUpdatePayload {
  consensus: InsightRecord[];
  divergence: InsightRecord[];
}

export interface SummaryPushPayload {
  summary: string;
  totalSpeeches: number;
}

export interface DiscussionStateChangePayload {
  status: DiscussionStatus;
  previousStatus: DiscussionStatus;
}

// ─── 创建讨论 ────────────────────────────────────────

export interface CreateDiscussionInput {
  topic: string;
  expertCount?: number;
}

export interface CreateDiscussionResult {
  id: string;
  topic: string;
  status: DiscussionStatus;
  expertCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── 生成嘉宾 ────────────────────────────────────────

export interface GenerateGuestsResult {
  discussionId: string;
  guests: Guest[];
}

// ─── 确认嘉宾 ────────────────────────────────────────

export interface ConfirmGuestsResult {
  id: string;
  status: DiscussionStatus;
  updatedAt: string;
}

// ─── 结束讨论 ────────────────────────────────────────

export interface EndDiscussionResult {
  id: string;
  status: DiscussionStatus;
  summary: string | null;
  updatedAt: string;
}

// ─── Toast ──────────────────────────────────────────

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}
