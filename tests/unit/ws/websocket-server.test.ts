/**
 * WebSocket 服务 — 单元测试
 *
 * TDD GREEN 阶段：验证 DiscussionWsServer 所有功能。
 *
 * 覆盖：
 *   1. 客户端连接与房间加入
 *   2. 5 类事件广播（格式验证 + 内容匹配）
 *   3. 多房间隔离（不同 discussionId 不会互相收到事件）
 *   4. 客户端断线处理
 *   5. 时间戳生成
 *   6. 房间客户端计数
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import http from 'http';
import type { AddressInfo } from 'net';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { DiscussionWsServer } from '../../../backend/ws/websocket-server';
import {
  WsEventType,
  type WsEventEnvelope,
  type GuestStatusChangePayload,
  type NewSpeechPayload,
  type ConsensusUpdatePayload,
  type SummaryPushPayload,
  type DiscussionStateChangePayload,
} from '../../../backend/ws/types';

// ─── 测试工具 ──────────────────────────────────────

/** 等待指定事件到达（单次），返回统一信封 */
function waitForEvent(
  socket: ClientSocket,
  event: string,
  timeout = 5000,
): Promise<WsEventEnvelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`等待事件 "${event}" 超时 (${timeout}ms)`)),
      timeout,
    );
    socket.once(event, (data: WsEventEnvelope) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** 连接一个客户端到指定讨论房间 */
function connectClient(port: number, discussionId: string): ClientSocket {
  const socket = ClientIO(`http://localhost:${port}`, {
    path: '/ws',
    query: { discussionId },
    transports: ['websocket'],
    forceNew: true,
  });
  return socket;
}

/** 断线后重连超时时间 */
const CONNECT_TIMEOUT = 3000;

// ════════════════════════════════════════════════════
// 测试套件
// ════════════════════════════════════════════════════

describe('DiscussionWsServer', () => {
  let httpServer: http.Server;
  let wsServer: DiscussionWsServer;
  let port: number;
  let clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = http.createServer();
    wsServer = new DiscussionWsServer(httpServer);

    // 启动监听并获取实际端口
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address() as AddressInfo;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // 清理所有客户端连接
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    await wsServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  afterEach(() => {
    // 测试后断开所有客户端
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    clients = [];
  });

  // ─── 1. 连接与房间管理 ──────────────────────────

  describe('连接与房间管理', () => {
    it('客户端应能成功连接到 WebSocket 服务', async () => {
      const socket = connectClient(port, 'test-disc-1');
      clients.push(socket);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('连接超时')), CONNECT_TIMEOUT);
        socket.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      expect(socket.connected).toBe(true);
    });

    it('连接后房间客户端计数应为 1', async () => {
      const socket = connectClient(port, 'test-disc-2');
      clients.push(socket);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('连接超时')), CONNECT_TIMEOUT);
        socket.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      expect(wsServer.getRoomClientCount('test-disc-2')).toBe(1);
    });

    it('同一房间多个客户端应收到相同广播', async () => {
      const client1 = connectClient(port, 'test-disc-multi');
      const client2 = connectClient(port, 'test-disc-multi');
      clients.push(client1, client2);

      await Promise.all([
        new Promise<void>((resolve) => client1.on('connect', resolve)),
        new Promise<void>((resolve) => client2.on('connect', resolve)),
      ]);

      expect(wsServer.getRoomClientCount('test-disc-multi')).toBe(2);

      // 广播事件
      const payload: GuestStatusChangePayload = {
        guestId: 'g-test',
        runStatus: 'SPEAKING',
        publicThought: '正在组织观点',
      };

      const [ev1, ev2] = await Promise.all([
        waitForEvent<GuestStatusChangePayload>(client1, WsEventType.GUEST_STATUS_CHANGE),
        waitForEvent<GuestStatusChangePayload>(client2, WsEventType.GUEST_STATUS_CHANGE),
        (async () => {
          wsServer.broadcastGuestStatusChange('test-disc-multi', payload);
        })(),
      ]);

      expect(ev1.payload.guestId).toBe('g-test');
      expect(ev2.payload.guestId).toBe('g-test');
      expect(ev1.payload.runStatus).toBe('SPEAKING');
      expect(ev2.payload.runStatus).toBe('SPEAKING');
    });

    it('客户端断线后房间计数应减少', async () => {
      const socket = connectClient(port, 'test-disc-disc');
      clients.push(socket);

      await new Promise<void>((resolve) => socket.on('connect', resolve));

      expect(wsServer.getRoomClientCount('test-disc-disc')).toBe(1);

      socket.disconnect();
      // 等待断线事件处理
      await new Promise((r) => setTimeout(r, 200));

      expect(wsServer.getRoomClientCount('test-disc-disc')).toBe(0);
    });
  });

  // ─── 2. 多房间隔离 ─────────────────────────────

  describe('多房间隔离', () => {
    it('客户端只收到自己房间的事件，不会收到其他房间的广播', async () => {
      const roomAClient = connectClient(port, 'room-a');
      const roomBClient = connectClient(port, 'room-b');
      clients.push(roomAClient, roomBClient);

      await Promise.all([
        new Promise<void>((resolve) => roomAClient.on('connect', resolve)),
        new Promise<void>((resolve) => roomBClient.on('connect', resolve)),
      ]);

      // 设置 B 房间的监听：B 不应该收到 A 的事件
      let bReceived = false;
      roomBClient.on(WsEventType.NEW_SPEECH, () => {
        bReceived = true;
      });

      // 向 A 房间广播
      const payload: NewSpeechPayload = {
        id: 's-only-a',
        guestId: 'g-a',
        guestName: 'A房间专家',
        guestTitle: '首席专家',
        guestColor: '#FF6B6B',
        content: '这是一个只有 A 房间能看到的消息',
        speechType: 'ANSWER',
        sequence: 1,
      };

      const aEventPromise = waitForEvent<NewSpeechPayload>(roomAClient, WsEventType.NEW_SPEECH);

      wsServer.broadcastNewSpeech('room-a', payload);

      const aEvent = await aEventPromise;

      expect(aEvent.payload.id).toBe('s-only-a');
      expect(aEvent.discussionId).toBe('room-a');

      // 给一点时间让跨房间事件传播（实际上不应该传播）
      await new Promise((r) => setTimeout(r, 300));

      expect(bReceived).toBe(false);
    });

    it('两个房间各自广播互不影响', async () => {
      const roomAClient = connectClient(port, 'room-a-2');
      const roomBClient = connectClient(port, 'room-b-2');
      clients.push(roomAClient, roomBClient);

      await Promise.all([
        new Promise<void>((resolve) => roomAClient.on('connect', resolve)),
        new Promise<void>((resolve) => roomBClient.on('connect', resolve)),
      ]);

      const aPayload: GuestStatusChangePayload = {
        guestId: 'g-room-a',
        runStatus: 'SPEAKING',
        publicThought: 'A 房间嘉宾正在发言',
      };

      const bPayload: GuestStatusChangePayload = {
        guestId: 'g-room-b',
        runStatus: 'PREPARING',
        publicThought: 'B 房间嘉宾正在准备',
      };

      const aPromise = waitForEvent<GuestStatusChangePayload>(roomAClient, WsEventType.GUEST_STATUS_CHANGE);
      const bPromise = waitForEvent<GuestStatusChangePayload>(roomBClient, WsEventType.GUEST_STATUS_CHANGE);

      wsServer.broadcastGuestStatusChange('room-a-2', aPayload);
      wsServer.broadcastGuestStatusChange('room-b-2', bPayload);

      const [aResult, bResult] = await Promise.all([aPromise, bPromise]);

      expect(aResult.payload.guestId).toBe('g-room-a');
      expect(bResult.payload.guestId).toBe('g-room-b');
      expect(aResult.discussionId).toBe('room-a-2');
      expect(bResult.discussionId).toBe('room-b-2');
    });
  });

  // ─── 3. guest_status_change 事件 ────────────────

  describe('guest_status_change 事件', () => {
    it('应发送完整的事件信封（event / discussionId / timestamp / payload）', async () => {
      const socket = connectClient(port, 'disc-guest-status');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: GuestStatusChangePayload = {
        guestId: 'g-001',
        runStatus: 'SPEAKING',
        publicThought: '正在从经济角度分析 AI 替代趋势',
      };

      const evPromise = waitForEvent<GuestStatusChangePayload>(socket, WsEventType.GUEST_STATUS_CHANGE);
      wsServer.broadcastGuestStatusChange('disc-guest-status', payload);

      const ev = await evPromise;

      expect(ev.event).toBe(WsEventType.GUEST_STATUS_CHANGE);
      expect(ev.discussionId).toBe('disc-guest-status');
      expect(ev.timestamp).toBeDefined();
      expect(ev.payload.guestId).toBe('g-001');
      expect(ev.payload.runStatus).toBe('SPEAKING');
      expect(ev.payload.publicThought).toBe('正在从经济角度分析 AI 替代趋势');
    });

    it('timestamp 应为合法 ISO 8601 格式', async () => {
      const socket = connectClient(port, 'disc-ts');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: GuestStatusChangePayload = {
        guestId: 'g-ts',
        runStatus: 'IDLE',
        publicThought: '',
      };

      const evPromise = waitForEvent<GuestStatusChangePayload>(socket, WsEventType.GUEST_STATUS_CHANGE);
      wsServer.broadcastGuestStatusChange('disc-ts', payload);
      const ev = await evPromise;

      const parsed = new Date(ev.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
      expect(ev.timestamp).toBe(parsed.toISOString());
    });

    it('runStatus 为 IDLE 时 publicThought 可为空字符串', async () => {
      const socket = connectClient(port, 'disc-idle');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: GuestStatusChangePayload = {
        guestId: 'g-idle',
        runStatus: 'IDLE',
        publicThought: '',
      };

      const evPromise = waitForEvent<GuestStatusChangePayload>(socket, WsEventType.GUEST_STATUS_CHANGE);
      wsServer.broadcastGuestStatusChange('disc-idle', payload);
      const ev = await evPromise;

      expect(ev.payload.runStatus).toBe('IDLE');
      expect(ev.payload.publicThought).toBe('');
    });

    it('PREPARING 状态应携带 publicThought', async () => {
      const socket = connectClient(port, 'disc-prep');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: GuestStatusChangePayload = {
        guestId: 'g-prep',
        runStatus: 'PREPARING',
        publicThought: '正在整理对自动化时间线的反对意见',
      };

      const evPromise = waitForEvent<GuestStatusChangePayload>(socket, WsEventType.GUEST_STATUS_CHANGE);
      wsServer.broadcastGuestStatusChange('disc-prep', payload);
      const ev = await evPromise;

      expect(ev.payload.runStatus).toBe('PREPARING');
      expect(ev.payload.publicThought).toBeTruthy();
    });
  });

  // ─── 4. new_speech 事件 ─────────────────────────

  describe('new_speech 事件', () => {
    it('应发送完整的发言数据（含 guest 信息、content、speechType、sequence）', async () => {
      const socket = connectClient(port, 'disc-speech');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: NewSpeechPayload = {
        id: 's-001',
        guestId: 'g-speaker',
        guestName: '李敏华',
        guestTitle: '某头部科技公司 AI Lab 高级研究员',
        guestColor: '#FF6B6B',
        content: '我认为到 2030 年，重复性脑力劳动确实会大比例自动化…',
        speechType: 'ANSWER',
        sequence: 15,
      };

      const evPromise = waitForEvent<NewSpeechPayload>(socket, WsEventType.NEW_SPEECH);
      wsServer.broadcastNewSpeech('disc-speech', payload);
      const ev = await evPromise;

      expect(ev.event).toBe(WsEventType.NEW_SPEECH);
      expect(ev.payload.id).toBe('s-001');
      expect(ev.payload.guestId).toBe('g-speaker');
      expect(ev.payload.guestName).toBe('李敏华');
      expect(ev.payload.guestTitle).toBe('某头部科技公司 AI Lab 高级研究员');
      expect(ev.payload.guestColor).toBe('#FF6B6B');
      expect(ev.payload.content).toContain('2030');
      expect(ev.payload.speechType).toBe('ANSWER');
      expect(ev.payload.sequence).toBe(15);
    });

    it('COUNTER 类型发言应正确传递', async () => {
      const socket = connectClient(port, 'disc-counter');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: NewSpeechPayload = {
        id: 's-counter',
        guestId: 'g-counter',
        guestName: '王德仁',
        guestTitle: '宏观经济学家',
        guestColor: '#45B7D1',
        content: '我不同意这个时间表。技术替代从来都比预测更保守。',
        speechType: 'COUNTER',
        sequence: 22,
      };

      const evPromise = waitForEvent<NewSpeechPayload>(socket, WsEventType.NEW_SPEECH);
      wsServer.broadcastNewSpeech('disc-counter', payload);
      const ev = await evPromise;

      expect(ev.payload.speechType).toBe('COUNTER');
      expect(ev.payload.sequence).toBe(22);
    });
  });

  // ─── 5. consensus_update 事件 ────────────────────

  describe('consensus_update 事件', () => {
    it('应发送完整的共识与分歧列表', async () => {
      const socket = connectClient(port, 'disc-consensus');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: ConsensusUpdatePayload = {
        consensus: [
          {
            id: 'cr-001',
            content: '各方认同：重复性工作将大比例自动化',
            relatedSpeechIds: ['s-001', 's-005'],
            createdAt: '2026-06-20T08:08:15.789Z',
          },
        ],
        divergence: [
          {
            id: 'cr-002',
            content: '争论焦点：涉及共情与判断力的岗位是否面临威胁',
            relatedSpeechIds: ['s-003', 's-007'],
            createdAt: '2026-06-20T08:07:30.456Z',
          },
        ],
      };

      const evPromise = waitForEvent<ConsensusUpdatePayload>(socket, WsEventType.CONSENSUS_UPDATE);
      wsServer.broadcastConsensusUpdate('disc-consensus', payload);
      const ev = await evPromise;

      expect(ev.event).toBe(WsEventType.CONSENSUS_UPDATE);
      expect(ev.payload.consensus).toHaveLength(1);
      expect(ev.payload.divergence).toHaveLength(1);
      expect(ev.payload.consensus[0].id).toBe('cr-001');
      expect(ev.payload.consensus[0].relatedSpeechIds).toContain('s-001');
      expect(ev.payload.divergence[0].id).toBe('cr-002');
    });

    it('空共识/分歧列表也应正常推送', async () => {
      const socket = connectClient(port, 'disc-empty-cr');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: ConsensusUpdatePayload = {
        consensus: [],
        divergence: [],
      };

      const evPromise = waitForEvent<ConsensusUpdatePayload>(socket, WsEventType.CONSENSUS_UPDATE);
      wsServer.broadcastConsensusUpdate('disc-empty-cr', payload);
      const ev = await evPromise;

      expect(ev.payload.consensus).toHaveLength(0);
      expect(ev.payload.divergence).toHaveLength(0);
    });
  });

  // ─── 6. summary_push 事件 ───────────────────────

  describe('summary_push 事件', () => {
    it('应发送讨论总结（含 totalSpeeches）', async () => {
      const socket = connectClient(port, 'disc-summary');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: SummaryPushPayload = {
        summary: '本次讨论围绕 AI 替代白领岗位展开。共识在于：重复性工作将大比例自动化…',
        totalSpeeches: 42,
      };

      const evPromise = waitForEvent<SummaryPushPayload>(socket, WsEventType.SUMMARY_PUSH);
      wsServer.broadcastSummaryPush('disc-summary', payload);
      const ev = await evPromise;

      expect(ev.event).toBe(WsEventType.SUMMARY_PUSH);
      expect(ev.payload.summary).toBeTruthy();
      expect(ev.payload.totalSpeeches).toBe(42);
    });
  });

  // ─── 7. discussion_state_change 事件 ─────────────

  describe('discussion_state_change 事件', () => {
    it('应发送状态变更（含 previousStatus）', async () => {
      const socket = connectClient(port, 'disc-state');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: DiscussionStateChangePayload = {
        status: 'IN_PROGRESS',
        previousStatus: 'SETUP',
      };

      const evPromise = waitForEvent<DiscussionStateChangePayload>(
        socket,
        WsEventType.DISCUSSION_STATE_CHANGE,
      );
      wsServer.broadcastDiscussionStateChange('disc-state', payload);
      const ev = await evPromise;

      expect(ev.event).toBe(WsEventType.DISCUSSION_STATE_CHANGE);
      expect(ev.payload.status).toBe('IN_PROGRESS');
      expect(ev.payload.previousStatus).toBe('SETUP');
    });

    it('COMPLETED 状态变更', async () => {
      const socket = connectClient(port, 'disc-completed');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const payload: DiscussionStateChangePayload = {
        status: 'COMPLETED',
        previousStatus: 'IN_PROGRESS',
      };

      const evPromise = waitForEvent<DiscussionStateChangePayload>(
        socket,
        WsEventType.DISCUSSION_STATE_CHANGE,
      );
      wsServer.broadcastDiscussionStateChange('disc-completed', payload);
      const ev = await evPromise;

      expect(ev.payload.status).toBe('COMPLETED');
      expect(ev.payload.previousStatus).toBe('IN_PROGRESS');
    });
  });

  // ─── 8. 诊断方法 ───────────────────────────────

  describe('诊断方法', () => {
    it('getActiveRooms 应返回当前有客户端的房间列表', async () => {
      const socket = connectClient(port, 'diag-room-1');
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', resolve));

      const rooms = wsServer.getActiveRooms();
      expect(rooms).toContain('diag-room-1');
    });

    it('getRoomClientCount 对不存在的房间应返回 0', () => {
      expect(wsServer.getRoomClientCount('non-existent-room')).toBe(0);
    });
  });
});
