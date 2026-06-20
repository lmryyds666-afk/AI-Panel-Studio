/**
 * 通用 API 请求 Hooks
 *
 * 基于原生 fetch 封装，自动处理 { code, data, message } 响应格式。
 * - useGet<T>    — 自动发 GET，返回 { data, isLoading, error, refetch }
 * - usePost<T,B> — 返回 { execute(body): Promise<T>, isLoading, error }
 * - useLazyGet<T> — 返回 { execute(url): Promise<T>, isLoading, error }
 *
 * code ≠ 0 时自动 throw Error(message)，由调用方 catch 处理。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ApiResponse } from '../types';

const BASE_URL = '/api';

/**
 * 内部 fetch 封装：拼接 URL、添加 JSON 头、解析响应。
 * 成功时返回 data 字段；失败时 throw Error(message)。
 */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

  const res = await fetch(fullUrl, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // 非 2xx 状态码直接抛出 HTTP 错误
  if (!res.ok) {
    let body: ApiResponse<null> | null = null;
    try {
      body = await res.json();
    } catch {
      // 无法解析 JSON 时使用状态文本
    }
    const message = body?.message ?? `HTTP ${res.status}: ${res.statusText}`;
    const error = new Error(message) as Error & { code: number };
    error.code = body?.code ?? res.status;
    throw error;
  }

  const json: ApiResponse<T> = await res.json();

  if (json.code !== 0) {
    const error = new Error(json.message) as Error & { code: number };
    error.code = json.code;
    throw error;
  }

  return json.data;
}

// ─── useGet ───────────────────────────────────────────

interface UseGetResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * 自动触发 GET 请求的 hook。
 * 组件挂载时自动请求，url 变更时重新请求。
 *
 * @param url - API 路径（如 '/discussions'）
 * @param immediate - 是否立即请求，默认 true
 */
export function useGet<T>(url: string, immediate = true): UseGetResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  useEffect(() => {
    if (!immediate && trigger === 0) return;

    let cancelled = false;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    apiFetch<T>(url, { signal: abortRef.current.signal })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled && err.name !== 'AbortError') {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [url, trigger, immediate]);

  return { data, isLoading, error, refetch };
}

// ─── usePost ──────────────────────────────────────────

interface UsePostResult<T, B> {
  execute: (body: B) => Promise<T>;
  isLoading: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * 手动触发 POST 请求的 hook。
 *
 * @param url - API 路径
 *
 * 使用示例：
 *   const { execute, isLoading } = usePost<CreateResult, CreateInput>('/discussions');
 *   const result = await execute({ topic: '...', expertCount: 4 });
 */
export function usePost<T, B = unknown>(url: string): UsePostResult<T, B> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (body: B): Promise<T> => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await apiFetch<T>(url, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setIsLoading(false);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : '未知错误';
        setError(message);
        setIsLoading(false);
        throw err;
      }
    },
    [url],
  );

  const resetError = useCallback(() => setError(null), []);

  return { execute, isLoading, error, resetError };
}

// ─── useLazyGet ───────────────────────────────────────

interface UseLazyGetResult<T> {
  execute: (url: string) => Promise<T>;
  isLoading: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * 手动触发 GET 请求的 hook（用于点击后才加载的场景）。
 *
 * 使用示例：
 *   const { execute, isLoading } = useLazyGet<Detail>();
 *   const detail = await execute(`/discussions/${id}`);
 */
export function useLazyGet<T>(): UseLazyGetResult<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (url: string): Promise<T> => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch<T>(url);
      setIsLoading(false);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(message);
      setIsLoading(false);
      throw err;
    }
  }, []);

  const resetError = useCallback(() => setError(null), []);

  return { execute, isLoading, error, resetError };
}
