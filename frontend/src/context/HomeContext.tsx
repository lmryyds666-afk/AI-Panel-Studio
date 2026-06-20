/**
 * HomeContext — 首页状态管理
 *
 * 管理：讨论列表、筛选、分页、创建弹窗状态。
 * 通过 Context + useReducer 提供页面级 Store。
 */
import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { DiscussionSummary, DiscussionStatus, CreateDiscussionResult } from '../types';
import { API_BASE_URL } from '../constants';

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

interface HomeState {
  discussions: DiscussionSummary[];
  filter: DiscussionStatus | null;
  isLoading: boolean;
  isCreateModalOpen: boolean;
  page: number;
  total: number;
  error: string | null;
}

const initialState: HomeState = {
  discussions: [],
  filter: null,
  isLoading: false,
  isCreateModalOpen: false,
  page: 1,
  total: 0,
  error: null,
};

// ─── Actions ──────────────────────────────────────────

type HomeAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_DISCUSSIONS'; payload: { items: DiscussionSummary[]; total: number; page: number } }
  | { type: 'SET_FILTER'; payload: DiscussionStatus | null }
  | { type: 'TOGGLE_CREATE_MODAL'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_DISCUSSION'; payload: DiscussionSummary };

function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_DISCUSSIONS':
      return {
        ...state,
        discussions: action.payload.items,
        total: action.payload.total,
        page: action.payload.page,
        isLoading: false,
        error: null,
      };
    case 'SET_FILTER':
      return { ...state, filter: action.payload, page: 1 };
    case 'TOGGLE_CREATE_MODAL':
      return { ...state, isCreateModalOpen: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'ADD_DISCUSSION':
      return {
        ...state,
        discussions: [action.payload, ...state.discussions],
        total: state.total + 1,
      };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────

interface HomeContextValue {
  state: HomeState;
  dispatch: React.Dispatch<HomeAction>;
  loadDiscussions: () => Promise<void>;
  createDiscussion: (topic: string, expertCount: number) => Promise<CreateDiscussionResult>;
}

const HomeContext = createContext<HomeContextValue | null>(null);

export const useHomeContext = (): HomeContextValue => {
  const ctx = useContext(HomeContext);
  if (!ctx) throw new Error('useHomeContext must be used within HomeProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────

export const HomeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(homeReducer, initialState);

  const loadDiscussions = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const params = new URLSearchParams();
      if (state.filter) params.set('status', state.filter);
      params.set('page', String(state.page));
      params.set('pageSize', '20');

      const data = await fetchApi<{
        items: DiscussionSummary[];
        total: number;
        page: number;
      }>(`/discussions?${params.toString()}`);

      dispatch({
        type: 'SET_DISCUSSIONS',
        payload: { items: data.items, total: data.total, page: data.page },
      });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : '加载失败',
      });
    }
  }, [state.filter, state.page]);

  const createDiscussion = useCallback(
    async (topic: string, expertCount: number): Promise<CreateDiscussionResult> => {
      const data = await fetchApi<CreateDiscussionResult>('/discussions', {
        method: 'POST',
        body: JSON.stringify({ topic, expertCount }),
      });
      return data;
    },
    [],
  );

  // 首次加载 + filter 变更时重新加载
  useEffect(() => {
    loadDiscussions();
  }, [loadDiscussions]);

  return (
    <HomeContext.Provider value={{ state, dispatch, loadDiscussions, createDiscussion }}>
      {children}
    </HomeContext.Provider>
  );
};
