/**
 * AI Panel Studio — 前端入口
 *
 * React 19 createRoot 挂载，注入全局 Provider。
 * 注意：开发模式下移除了 StrictMode 以避免 WebSocket 双连接问题。
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './components/common/ErrorToast';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('找不到 #root 挂载节点，请检查 index.html');
}

createRoot(rootElement).render(
  <BrowserRouter>
    <ToastProvider>
      <App />
    </ToastProvider>
  </BrowserRouter>,
);
