/**
 * 讨论实时 WebSocket 服务
 *
 * 基于 Socket.IO 实现房间隔离的多讨论实时广播。
 *
 * 职责：
 *   1. 管理客户端连接与房间订阅
 *   2. 广播 5 类实时事件（guest_status_change / new_speech /
 *      consensus_update / summary_push / discussion_state_change）
 *   3. 多讨论房间隔离（客户端只收到所属 discussion 的事件）
 *
 * 架构：
 *   - 每个 discussion_id 对应一个 Socket.IO 房间
 *   - 客户端通过 handshake query 声明 discussionId
 *   - 服务端在 connection 事件中自动将 socket 加入对应房间
 *   - 外部（控制器/AI 调度引擎）通过 broadcast* 方法推送事件
 */

import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import {
  WsEventType,
  type GuestStatusChangePayload,
  type NewSpeechPayload,
  type ConsensusUpdatePayload,
  type SummaryPushPayload,
  type DiscussionStateChangePayload,
  type WsEventEnvelope,
  type WsPayload,
} from './types';

// ─── 配置常量 ────────────────────────────────────────

/** Socket.IO 路径前缀 */
const WS_PATH = '/ws';

/** 房间名前缀 */
const ROOM_PREFIX = 'discussion:';

/** 构建房间名 */
function roomName(discussionId: string): string {
  return `${ROOM_PREFIX}${discussionId}`;
}

/** 从房间名提取 discussionId */
function extractDiscussionId(room: string): string {
  return room.startsWith(ROOM_PREFIX) ? room.slice(ROOM_PREFIX.length) : '';
}

// ─── WebSocket 服务类 ────────────────────────────────

export class DiscussionWsServer {
  private io: Server;
  /** 当前每个房间的客户端数（diagnostic 用） */
  private roomClientCount = new Map<string, number>();

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      path: WS_PATH,
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      // Socket.IO 默认使用 WebSocket + HTTP long-polling 双通道
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  // ─── 连接管理 ────────────────────────────────────

  /**
   * 处理新客户端连接
   *
   * 从 handshake query 中提取 discussionId 并加入对应房间。
   * Socket.IO 房间机制天然保证消息隔离。
   */
  private handleConnection(socket: Socket): void {
    const discussionId = socket.handshake.query.discussionId as string | undefined;

    if (!discussionId) {
      // 未声明 discussionId 的客户端只接收全局通知（如健康检查）
      console.log(`[WS] 客户端 ${socket.id} 已连接（未加入任何讨论房间）`);
      this.setupDisconnectHandler(socket, null);
      return;
    }

    // 加入讨论房间
    const room = roomName(discussionId);
    socket.join(room);

    // 更新房间计数
    const count = (this.roomClientCount.get(discussionId) ?? 0) + 1;
    this.roomClientCount.set(discussionId, count);

    console.log(
      `[WS] 客户端 ${socket.id} 已加入房间 ${room}（当前房间 ${count} 人）`,
    );

    this.setupDisconnectHandler(socket, discussionId);
  }

  /** 注册断线处理 */
  private setupDisconnectHandler(socket: Socket, discussionId: string | null): void {
    socket.on('disconnect', () => {
      if (discussionId) {
        const count = (this.roomClientCount.get(discussionId) ?? 1) - 1;
        if (count <= 0) {
          this.roomClientCount.delete(discussionId);
        } else {
          this.roomClientCount.set(discussionId, count);
        }
        console.log(
          `[WS] 客户端 ${socket.id} 已离开房间 ${roomName(discussionId)}（剩余 ${Math.max(0, count)} 人）`,
        );
      } else {
        console.log(`[WS] 客户端 ${socket.id} 已断开（未加入讨论房间）`);
      }
    });
  }

  // ─── 事件广播方法 ────────────────────────────────

  /**
   * 广播「嘉宾状态变更」事件
   *
   * 推送时机：任意嘉宾 runStatus 发生变化（IDLE → PREPARING → SPEAKING → IDLE）
   */
  broadcastGuestStatusChange(
    discussionId: string,
    payload: GuestStatusChangePayload,
  ): void {
    this.emit(discussionId, WsEventType.GUEST_STATUS_CHANGE, payload);
  }

  /**
   * 广播「新发言」事件
   *
   * 推送时机：isVisible=true 的发言入库后
   */
  broadcastNewSpeech(discussionId: string, payload: NewSpeechPayload): void {
    this.emit(discussionId, WsEventType.NEW_SPEECH, payload);
  }

  /**
   * 广播「共识/分歧刷新」事件
   *
   * 推送时机：共识/分歧列表有新增时
   * 推送当前完整的共识与分歧列表（全量快照，避免多端不一致）
   */
  broadcastConsensusUpdate(
    discussionId: string,
    payload: ConsensusUpdatePayload,
  ): void {
    this.emit(discussionId, WsEventType.CONSENSUS_UPDATE, payload);
  }

  /**
   * 广播「讨论总结」事件
   *
   * 推送时机：讨论结束、主持人总结生成完毕后
   */
  broadcastSummaryPush(discussionId: string, payload: SummaryPushPayload): void {
    this.emit(discussionId, WsEventType.SUMMARY_PUSH, payload);
  }

  /**
   * 广播「讨论状态变更」事件
   *
   * 推送时机：讨论生命周期转换时（SETUP → IN_PROGRESS → COMPLETED）
   */
  broadcastDiscussionStateChange(
    discussionId: string,
    payload: DiscussionStateChangePayload,
  ): void {
    this.emit(discussionId, WsEventType.DISCUSSION_STATE_CHANGE, payload);
  }

  // ─── 内部方法 ────────────────────────────────────

  /**
   * 向指定讨论房间广播事件
   *
   * 所有事件统一使用信封格式：{ event, discussionId, timestamp, payload }
   */
  private emit<T extends WsPayload>(
    discussionId: string,
    event: WsEventType,
    payload: T,
  ): void {
    const envelope: WsEventEnvelope<T> = {
      event,
      discussionId,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.io.to(roomName(discussionId)).emit(event, envelope);
  }

  // ─── 诊断方法 ────────────────────────────────────

  /** 获取指定房间内的客户端数 */
  getRoomClientCount(discussionId: string): number {
    return this.roomClientCount.get(discussionId) ?? 0;
  }

  /** 获取所有活跃讨论房间 ID */
  getActiveRooms(): string[] {
    return [...this.roomClientCount.keys()];
  }

  /** 获取底层 Socket.IO Server（供高级用例使用） */
  getIo(): Server {
    return this.io;
  }

  /** 关闭服务 */
  async close(): Promise<void> {
    this.roomClientCount.clear();
    await this.io.close();
  }
}
