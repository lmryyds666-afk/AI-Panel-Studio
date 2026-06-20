/**
 * WebSocket 实时事件类型定义
 *
 * 与 docs/API规范.md §2 WebSocket 事件定义严格对齐。
 * 所有事件使用统一信封格式广播。
 */

// ─── 事件类型枚举 ────────────────────────────────────

/** WebSocket 推送事件类型 */
export const WsEventType = {
  GUEST_STATUS_CHANGE: 'guest_status_change',
  NEW_SPEECH: 'new_speech',
  CONSENSUS_UPDATE: 'consensus_update',
  SUMMARY_PUSH: 'summary_push',
  DISCUSSION_STATE_CHANGE: 'discussion_state_change',
} as const;

export type WsEventType = (typeof WsEventType)[keyof typeof WsEventType];

// ─── 事件负载类型 ────────────────────────────────────

/** guest_status_change 负载 */
export interface GuestStatusChangePayload {
  guestId: string;
  runStatus: 'IDLE' | 'PREPARING' | 'SPEAKING';
  publicThought: string;
}

/** new_speech 负载 */
export interface NewSpeechPayload {
  id: string;
  guestId: string;
  guestName: string;
  guestTitle: string;
  guestColor: string;
  content: string;
  speechType: 'OPENING' | 'FOLLOW_UP' | 'BRIDGING' | 'ANSWER' | 'SUPPLEMENT' | 'COUNTER' | 'SUMMARY';
  sequence: number;
}

/** consensus_update 负载 */
export interface ConsensusUpdatePayload {
  consensus: ConsensusRecordItem[];
  divergence: ConsensusRecordItem[];
}

export interface ConsensusRecordItem {
  id: string;
  content: string;
  relatedSpeechIds: string[];
  createdAt: string;
}

/** summary_push 负载 */
export interface SummaryPushPayload {
  summary: string;
  totalSpeeches: number;
}

/** discussion_state_change 负载 */
export interface DiscussionStateChangePayload {
  status: 'SETUP' | 'IN_PROGRESS' | 'COMPLETED';
  previousStatus: 'SETUP' | 'IN_PROGRESS' | 'COMPLETED';
}

/** 所有事件负载联合类型 */
export type WsPayload =
  | GuestStatusChangePayload
  | NewSpeechPayload
  | ConsensusUpdatePayload
  | SummaryPushPayload
  | DiscussionStateChangePayload;

// ─── 通用事件信封 ────────────────────────────────────

/**
 * WebSocket 推送消息统一信封
 *
 * 所有推送到客户端的事件均使用此格式。
 */
export interface WsEventEnvelope<T extends WsPayload = WsPayload> {
  event: WsEventType;
  discussionId: string;
  timestamp: string;
  payload: T;
}
