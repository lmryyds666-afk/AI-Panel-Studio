/**
 * App — 路由组装 + 全局视觉框架
 *
 * 三大页面路由：
 *   /                      → HomePage（讨论列表）
 *   /setup/:discussionId   → GuestSetupPage（嘉宾配置）
 *   /studio/:discussionId   → StudioPage（演播厅）
 *
 * 全局视觉层：
 *   1. 固定全屏天池自然风光背景
 *   2. 半透明色调遮罩
 *   3. 前景页面内容（z-10）
 *   4. 全局页脚
 *   5. 非首页右上角浮动返回首页按钮
 *
 * 每个页面拥有独立的 Context Provider 实现页面级状态隔离。
 */
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HomeProvider } from './context/HomeContext';
import { GuestSetupProvider } from './context/GuestSetupContext';
import { StudioProvider } from './context/StudioContext';
import HomePage from './pages/HomePage';
import GuestSetupPage from './pages/GuestSetupPage';
import StudioPage from './pages/StudioPage';
import { Footer } from './components/common/Footer';
import { FloatingHomeButton } from './components/common/FloatingHomeButton';

const App: React.FC = () => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isStudioPage = location.pathname.startsWith('/studio/');

  return (
    <>
      {/* 固定自然风光背景层 */}
      <div className="fixed inset-0 bg-nature" aria-hidden="true" />
      {/* 半透明磨砂色调遮罩 */}
      <div className="fixed inset-0 bg-glass-overlay" aria-hidden="true" />

      {/* 前景所有页面 + 页脚 */}
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1">
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <Footer />
      </div>

      {/* 浮动返回首页按钮：首页和演播厅页面隐藏（演播厅已集成到导航栏） */}
      {!isHomePage && !isStudioPage && <FloatingHomeButton />}
    </>
  );
};

export default App;
