/**
 * GuestSetupContext — 嘉宾配置页状态管理
 *
 * 管理：讨论详情、嘉宾列表、AI 生成/确认加载态。
 */
import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { DiscussionDetail, Guest, GenerateGuestsResult, ConfirmGuestsResult } from '../types';
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

interface GuestSetupState {
  discussion: DiscussionDetail | null;
  guests: Guest[];
  isGenerating: boolean;
  isConfirming: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: GuestSetupState = {
  discussion: null,
  guests: [],
  isGenerating: false,
  isConfirming: false,
  isLoading: true,
  error: null,
};

type GuestSetupAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_DISCUSSION'; payload: DiscussionDetail }
  | { type: 'SET_GUESTS'; payload: Guest[] }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_CONFIRMING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

function setupReducer(state: GuestSetupState, action: GuestSetupAction): GuestSetupState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_DISCUSSION':
      return { ...state, discussion: action.payload, guests: action.payload.guests ?? [], isLoading: false, error: null };
    case 'SET_GUESTS':
      return { ...state, guests: action.payload, isGenerating: false };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload, error: null };
    case 'SET_CONFIRMING':
      return { ...state, isConfirming: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isGenerating: false, isConfirming: false, isLoading: false };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────

interface GuestSetupContextValue {
  state: GuestSetupState;
  dispatch: React.Dispatch<GuestSetupAction>;
  loadDiscussion: (id: string) => Promise<void>;
  generateGuests: (id: string) => Promise<Guest[]>;
  confirmGuests: (id: string) => Promise<ConfirmGuestsResult>;
}

const GuestSetupContext = createContext<GuestSetupContextValue | null>(null);

export const useGuestSetupContext = (): GuestSetupContextValue => {
  const ctx = useContext(GuestSetupContext);
  if (!ctx) throw new Error('useGuestSetupContext must be used within GuestSetupProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────

export const GuestSetupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(setupReducer, initialState);

  const loadDiscussion = useCallback(async (id: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const data = await fetchApi<DiscussionDetail>(`/discussions/${id}`);
      dispatch({ type: 'SET_DISCUSSION', payload: data });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : '加载失败' });
    }
  }, []);

  const generateGuests = useCallback(async (id: string): Promise<Guest[]> => {
    dispatch({ type: 'SET_GENERATING', payload: true });
    try {
      const data = await fetchApi<GenerateGuestsResult>(`/discussions/${id}/generate-guests`, {
        method: 'POST',
      });
      dispatch({ type: 'SET_GUESTS', payload: data.guests });
      return data.guests;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      dispatch({ type: 'SET_ERROR', payload: msg });
      throw err;
    }
  }, []);

  const confirmGuests = useCallback(async (id: string): Promise<ConfirmGuestsResult> => {
    dispatch({ type: 'SET_CONFIRMING', payload: true });
    try {
      const data = await fetchApi<ConfirmGuestsResult>(`/discussions/${id}/confirm-guests`, {
        method: 'POST',
      });
      dispatch({ type: 'SET_CONFIRMING', payload: false });
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '确认失败';
      dispatch({ type: 'SET_ERROR', payload: msg });
      dispatch({ type: 'SET_CONFIRMING', payload: false });
      throw err;
    }
  }, []);

  return (
    <GuestSetupContext.Provider value={{ state, dispatch, loadDiscussion, generateGuests, confirmGuests }}>
      {children}
    </GuestSetupContext.Provider>
  );
};
