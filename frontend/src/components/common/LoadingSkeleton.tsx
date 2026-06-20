/**
 * LoadingSkeleton — 骨架屏组件
 *
 * 三种变体：
 *   - card：讨论卡片骨架（矩形 + 两行文字）
 *   - bubble：发言气泡骨架（圆形 + 矩形）
 *   - line：单行文字骨架
 */
import React from 'react';

interface LoadingSkeletonProps {
  /** 骨架屏变体 */
  variant?: 'card' | 'bubble' | 'line';
  /** 重复数量（默认 1） */
  count?: number;
  /** 附加的 CSS 类名 */
  className?: string;
}

const CardSkeleton: React.FC = () => (
  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 animate-pulse">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-3 h-3 rounded-full bg-slate-600" />
      <div className="h-4 bg-slate-600 rounded w-1/3" />
      <div className="h-6 bg-slate-600 rounded-full w-16 ml-auto" />
    </div>
    <div className="space-y-2">
      <div className="h-5 bg-slate-600 rounded w-full" />
      <div className="h-5 bg-slate-600 rounded w-2/3" />
    </div>
    <div className="flex gap-4 mt-3">
      <div className="h-3 bg-slate-700 rounded w-20" />
      <div className="h-3 bg-slate-700 rounded w-24" />
    </div>
  </div>
);

const BubbleSkeleton: React.FC = () => (
  <div className="flex gap-3 p-3 animate-pulse">
    <div className="w-2 rounded-full bg-slate-600 flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-slate-600" />
        <div className="h-3 bg-slate-600 rounded w-24" />
      </div>
      <div className="h-4 bg-slate-600 rounded w-full" />
      <div className="h-4 bg-slate-600 rounded w-4/5" />
    </div>
  </div>
);

const LineSkeleton: React.FC = () => (
  <div className="h-4 bg-slate-600 rounded animate-pulse w-full" />
);

const skeletons: Record<string, React.FC> = {
  card: CardSkeleton,
  bubble: BubbleSkeleton,
  line: LineSkeleton,
};

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'line',
  count = 1,
  className = '',
}) => {
  const SkeletonComponent = skeletons[variant] ?? LineSkeleton;

  return (
    <div className={className} data-testid="loading-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonComponent key={i} />
      ))}
    </div>
  );
};
