/**
 * App — 路由组装
 *
 * 三大页面路由：
 *   /                      → HomePage（讨论列表）
 *   /setup/:discussionId   → GuestSetupPage（嘉宾配置）
 *   /studio/:discussionId   → StudioPage（演播厅）
 *
 * 每个页面拥有独立的 Context Provider 实现页面级状态隔离。
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { HomeProvider } from './context/HomeContext';
import { GuestSetupProvider } from './context/GuestSetupContext';
import { StudioProvider } from './context/StudioContext';
import HomePage from './pages/HomePage';
import GuestSetupPage from './pages/GuestSetupPage';
import StudioPage from './pages/StudioPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <HomeProvider>
            <HomePage />
          </HomeProvider>
        }
      />
      <Route
        path="/setup/:discussionId"
        element={
          <GuestSetupProvider>
            <GuestSetupPage />
          </GuestSetupProvider>
        }
      />
      <Route
        path="/studio/:discussionId"
        element={
          <StudioProvider>
            <StudioPage />
          </StudioProvider>
        }
      />
      {/* 未匹配路由 → 重定向到首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
