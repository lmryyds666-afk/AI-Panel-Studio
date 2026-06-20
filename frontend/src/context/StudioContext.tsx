/**
 * StudioContext — 演播厅状态管理
 *
 * 核心 Store：管理嘉宾实时状态、发言列表、共识/分歧/总结 + WebSocket 事件映射。
 * 所有状态均为讨论级，不可跨讨论共享。
 */
import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { API_BASE_URL } from '../constants';
import type {
  DiscussionDetail,
  DiscussionStatus,
  GuestRuntime,
  Speech,
  InsightRecord,
  GuestStatusChangePayload,
  NewSpeechPayload,
  ConsensusUpdatePayload,
  SummaryPushPayload,
  DiscussionStateChangePayload,
} from '../types';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message);
  return json.data;
}

// ─── State ────────────────────────────────────────────

export interface StudioState {
  discussionId: string;
  topic: string;
  status: DiscussionStatus;
  guests: Map<string, GuestRuntime>;
  /** 有序嘉宾 ID 列表（保持 sortOrder） */
  guestOrder: string[];
  speeches: Speech[];
  consensus: InsightRecord[];
  divergence: InsightRecord[];
  summary: string | null;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  currentSpeakerId: string | null;
  isLoading: boolean;
  error: string | null;
  highlightedSpeechId: string | null;
}

const initialState: StudioState = {
  discussionId: '',
  topic: '',
  status: 'SETUP',
  guests: new Map(),
  guestOrder: [],
  speeches: [],
  consensus: [],
  divergence: [],
  summary: null,
  wsStatus: 'disconnected',
  currentSpeakerId: null,
  isLoading: true,
  error: null,
  highlightedSpeechId: null,
};

// ─── Actions ──────────────────────────────────────────

type StudioAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'INIT_FROM_DETAIL'; payload: DiscussionDetail }
  | { type: 'UPDATE_GUEST_STATUS'; payload: GuestStatusChangePayload }
  | { type: 'ADD_SPEECH'; payload: Speech }
  | { type: 'SET_CONSENSUS'; payload: { consensus: InsightRecord[]; divergence: InsightRecord[] } }
  | { type: 'SET_SUMMARY'; payload: SummaryPushPayload }
  | { type: 'SET_STATUS'; payload: DiscussionStatus }
  | { type: 'SET_WS_STATUS'; payload: 'connecting' | 'connected' | 'disconnected' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'HIGHLIGHT_SPEECH'; payload: string | null };

function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'INIT_FROM_DETAIL': {
      const { id, topic, status, guests, speeches, summary } = action.payload;
      const guestMap = new Map<string, GuestRuntime>();
      const order: string[] = [];

      // 排序后插入 Map
      const sorted = [...guests].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const g of sorted) {
        guestMap.set(g.id, {
          id: g.id,
          name: g.name,
          role: g.role,
          color: g.color,
          runStatus: g.runStatus ?? 'IDLE',
          publicThought: '',
        });
        order.push(g.id);
      }

      return {
        ...state,
        discussionId: id,
        topic,
        status,
        guests: guestMap,
        guestOrder: order,
        speeches: speeches ?? [],
        summary,
        isLoading: false,
        error: null,
      };
    }

    case 'UPDATE_GUEST_STATUS': {
      const { guestId, runStatus, publicThought } = action.payload;
      const guest = state.guests.get(guestId);
      if (!guest) return state;

      const newMap = new Map(state.guests);
      newMap.set(guestId, { ...guest, runStatus, publicThought });

      const currentSpeakerId = runStatus === 'SPEAKING' ? guestId
        : state.currentSpeakerId === guestId ? null
        : state.currentSpeakerId;

      return { ...state, guests: newMap, currentSpeakerId };
    }

    case 'ADD_SPEECH': {
      // 防止重复（按 id 去重）
      if (state.speeches.some((s) => s.id === action.payload.id)) return state;
      const newSpeeches = [...state.speeches, action.payload].sort(
        (a, b) => a.sequence - b.sequence,
      );
      return { ...state, speeches: newSpeeches };
    }

    case 'SET_CONSENSUS':
      return { ...state, consensus: action.payload.consensus, divergence: action.payload.divergence };

    case 'SET_SUMMARY':
      return { ...state, summary: action.payload.summary };

    case 'SET_STATUS':
      return { ...state, status: action.payload };

    case 'SET_WS_STATUS':
      return { ...state, wsStatus: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'HIGHLIGHT_SPEECH':
      return { ...state, highlightedSpeechId: action.payload };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────

interface StudioContextValue {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
  loadStudioData: (id: string) => Promise<void>;
  endDiscussion: (id: string) => Promise<void>;
  highlightSpeech: (speechId: string | null) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export const useStudioContext = (): StudioContextValue => {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudioContext must be used within StudioProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(studioReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // WebSocket 事件回调
  const wsHandlers = {
    onGuestStatusChange: useCallback((payload: unknown) => {
      dispatch({ type: 'UPDATE_GUEST_STATUS', payload: payload as GuestStatusChangePayload });
    }, []),
    onNewSpeech: useCallback((payload: unknown) => {
      dispatch({ type: 'ADD_SPEECH', payload: payload as Speech });
    }, []),
    onConsensusUpdate: useCallback((payload: unknown) => {
      dispatch({ type: 'SET_CONSENSUS', payload: payload as ConsensusUpdatePayload });
    }, []),
    onSummaryPush: useCallback((payload: unknown) => {
      dispatch({ type: 'SET_SUMMARY', payload: payload as SummaryPushPayload });
    }, []),
    onStateChange: useCallback((payload: unknown) => {
      const { status } = payload as DiscussionStateChangePayload;
      dispatch({ type: 'SET_STATUS', payload: status });
    }, []),
  };

  // WebSocket 连接
  const { status: wsStatus, lastMessage } = useWebSocket(
    state.discussionId || null,
    wsHandlers,
  );

  // 同步 WS 状态
  useEffect(() => {
    dispatch({ type: 'SET_WS_STATUS', payload: wsStatus });
  }, [wsStatus]);

  // ─── API 操作 ──────────────────────────────────────

  const loadStudioData = useCallback(async (id: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const data = await fetchApi<DiscussionDetail>(`/discussions/${id}`);
      dispatch({ type: 'INIT_FROM_DETAIL', payload: data });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : '加载失败' });
    }
  }, []);

  const endDiscussion = useCallback(async (id: string) => {
    const data = await fetchApi<{ id: string; status: DiscussionStatus; summary: string | null }>(
      `/discussions/${id}/end`,
      { method: 'POST' },
    );
    dispatch({ type: 'SET_STATUS', payload: data.status });
    if (data.summary) {
      dispatch({ type: 'SET_SUMMARY', payload: { summary: data.summary, totalSpeeches: stateRef.current.speeches.length } });
    }
  }, []);

  const highlightSpeech = useCallback((speechId: string | null) => {
    dispatch({ type: 'HIGHLIGHT_SPEECH', payload: speechId });
  }, []);

  return (
    <StudioContext.Provider value={{ state, dispatch, loadStudioData, endDiscussion, highlightSpeech }}>
      {children}
    </StudioContext.Provider>
  );
};
