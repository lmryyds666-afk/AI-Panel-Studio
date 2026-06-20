/**
 * WebSocket 实时服务模块 — 统一导出
 *
 * 使用方式：
 * ```ts
 * import { DiscussionWsServer, WsEventType } from './ws';
 * ```
 */
export { DiscussionWsServer } from './websocket-server';
export {
  WsEventType,
  type WsEventEnvelope,
  type WsPayload,
  type GuestStatusChangePayload,
  type NewSpeechPayload,
  type ConsensusUpdatePayload,
  type ConsensusRecordItem,
  type SummaryPushPayload,
  type DiscussionStateChangePayload,
} from './types';
