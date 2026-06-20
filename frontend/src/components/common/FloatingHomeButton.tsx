/**
 * 右上角浮空返回首页按钮
 *
 * 仅非首页路由时显示，圆角紫色玻璃拟态按钮。
 * 点击后通过 React Router 跳转至讨论列表首页。
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const FloatingHomeButton: React.FC = () => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/')}
      className="floating-home-btn"
      aria-label="返回首页"
    >
      ← 返回首页
    </button>
  );
};

export default FloatingHomeButton;
