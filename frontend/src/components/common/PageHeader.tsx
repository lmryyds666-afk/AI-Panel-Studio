/**
 * PageHeader — 页面顶部统一标题栏
 *
 * 复用：首页、嘉宾配置页。
 * Props: title, subtitle?, onBack?
 */
import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, onBack }) => {
  return (
    <header
      data-testid="page-header"
      className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 px-6 py-4"
    >
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-sm cursor-pointer"
            aria-label="返回"
          >
            <span className="text-lg leading-none">←</span>
            <span className="hidden sm:inline">返回</span>
          </button>
        )}

        <div className="flex-1">
          <h1 className="text-xl font-bold text-white tracking-wide">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </header>
  );
};
