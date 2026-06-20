/**
 * ErrorToast — 全局浮动 Toast 通知
 *
 * 通过 ToastContext 驱动，顶部居中显示，3 秒自动消失。
 * 类型：success（绿色） / error（红色）。
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ToastMessage } from '../../types';

// ─── Context ──────────────────────────────────────────

interface ToastContextValue {
  /** 添加 Toast */
  toast: (message: string, type?: 'success' | 'error') => void;
  /** 清除所有 Toast */
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  clear: () => {},
});

/** 访问 Toast 控制器的 hook */
export const useToast = (): ToastContextValue => useContext(ToastContext);

// ─── Provider ─────────────────────────────────────────

let toastIdCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clear = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const toast = useCallback(
    (message: string, type: 'success' | 'error' = 'error') => {
      const id = `toast-${++toastIdCounter}-${Date.now()}`;
      const newToast: ToastMessage = { id, message, type };

      setToasts((prev) => [...prev, newToast]);

      // 3 秒后自动移除
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 3000);

      timersRef.current.set(id, timer);
    },
    [],
  );

  // 卸载时清理所有定时器
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, clear }}>
      {children}

      {/* Toast 容器：顶部居中 */}
      {toasts.length > 0 && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
          data-testid="toast-container"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              data-testid="error-toast"
              className={`animate-slide-in-down px-5 py-3 rounded-lg shadow-lg text-sm font-medium pointer-events-auto max-w-md ${
                t.type === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};
