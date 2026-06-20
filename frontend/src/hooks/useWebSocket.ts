/**
 * WebSocket 连接管理 Hook（基于 Socket.IO）
 *
 * 连接到后端 DiscussionWsServer，接收实时事件推送。
 * 通过 discussionId 实现房间隔离。
 *
 * 连接 URL：http://localhost:3001  path: /ws  query: { discussionId }
 * 自动重连：Socket.IO 内置指数退避
 * 事件分发：解析 WsEventEnvelope → 按 event 字段分发给回调
 *
 * 使用示例：
 * const { status, lastMessage, send } = useWebSocket(discussionId, {
 *   onGuestStatusChange: (payload) => { ... },
 *   onNewSpeech: (payload) => { ... },
 *   onConsensusUpdate: (payload) => { ... },
 *   onSummaryPush: (payload) => { ... },
 *   onStateChange: (payload) => { ... },
 * });
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WsConnectionStatus, WsEventEnvelope } from '../types';

// ─── 配置 ────────────────────────────────────────────

/** Socket.IO 服务地址 */
const WS_SERVER_URL = 'http://localhost:3001';
const WS_PATH = '/ws';

// ─── 事件回调类型 ────────────────────────────────────

export interface WsEventHandlers {
  onGuestStatusChange?: (payload: unknown) => void;
  onNewSpeech?: (payload: unknown) => void;
  onConsensusUpdate?: (payload: unknown) => void;
  onSummaryPush?: (payload: unknown) => void;
  onStateChange?: (payload: unknown) => void;
  onError?: (error: string) => void;
}

// ─── Hook 返回类型 ───────────────────────────────────

export interface UseWebSocketResult {
  status: WsConnectionStatus;
  lastMessage: WsEventEnvelope | null;
  send: (data: unknown) => void;
}

// ─── 实现 ────────────────────────────────────────────

export function useWebSocket(
  discussionId: string | null,
  handlers: WsEventHandlers = {},
): UseWebSocketResult {
  const [status, setStatus] = useState<WsConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WsEventEnvelope | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // 使用 ref 保持 handler 引用最新，避免重连
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!discussionId) {
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');

    const socket = io(WS_SERVER_URL, {
      path: WS_PATH,
      query: { discussionId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.on('connect_error', (err) => {
      console.warn('[WS] 连接错误：', err.message);
      setStatus('disconnected');
      handlersRef.current.onError?.(err.message);
    });

    // 注册事件监听（排除 onError，它由 connect_error 触发）
    type WsDataHandlerKey = Exclude<keyof WsEventHandlers, 'onError'>;
    const registerEvent = (eventName: string, handlerKey: WsDataHandlerKey) => {
      socket.on(eventName, (envelope: WsEventEnvelope) => {
        setLastMessage(envelope);
        const handler = handlersRef.current[handlerKey];
        if (handler) {
          handler(envelope.payload);
        }
      });
    };

    registerEvent('guest_status_change', 'onGuestStatusChange');
    registerEvent('new_speech', 'onNewSpeech');
    registerEvent('consensus_update', 'onConsensusUpdate');
    registerEvent('summary_push', 'onSummaryPush');
    registerEvent('discussion_state_change', 'onStateChange');

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
    };
  }, [discussionId]);

  const send = useCallback((_data: unknown) => {
    // Socket.IO 客户端通常由服务端推送为主，send 预留
    if (socketRef.current?.connected) {
      socketRef.current.emit('message', JSON.stringify(_data));
    }
  }, []);

  return { status, lastMessage, send };
}
