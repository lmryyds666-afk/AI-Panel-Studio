/**
 * HomePage — 首页：讨论列表 + 筛选 + 创建弹窗
 *
 * 路由：/
 *
 * 组合 PageHeader + DiscussionFilter + DiscussionList + CreateDiscussionModal。
 * E2E: data-testid="home-page"
 */
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { useToast } from '../components/common/ErrorToast';
import { useHomeContext } from '../context/HomeContext';
import { STATUS_FILTER_OPTIONS, EXPERT_COUNT_MIN, EXPERT_COUNT_MAX, EXPERT_COUNT_DEFAULT } from '../constants';
import type { DiscussionSummary, DiscussionStatus } from '../types';

// ════════════════════════════════════════════════════════
// DiscussionFilter — 状态筛选标签条
// ════════════════════════════════════════════════════════

const DiscussionFilter: React.FC = () => {
  const { state, dispatch } = useHomeContext();

  return (
    <div data-testid="discussion-filter" className="flex gap-2 px-6 py-3 flex-wrap">
      {STATUS_FILTER_OPTIONS.map((opt) => {
        const isActive = state.filter === opt.value;
        return (
          <button
            key={opt.label}
            onClick={() => dispatch({ type: 'SET_FILTER', payload: opt.value })}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
              isActive
                ? 'bg-indigo-500/85 text-white shadow-lg shadow-indigo-500/15'
                : 'glass-panel-light text-slate-300 hover:bg-white/10'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// DiscussionCard — 单张讨论摘要卡片
// ════════════════════════════════════════════════════════

const DiscussionCard: React.FC<{
  discussion: DiscussionSummary;
  onClick: (id: string, status: DiscussionStatus) => void;
}> = ({ discussion, onClick }) => {
  const { id, topic, status, expertCount, guestCount, createdAt } = discussion;

  const statusLabel: Record<string, string> = {
    SETUP: '待配置',
    IN_PROGRESS: '进行中',
    COMPLETED: '已结束',
  };

  const statusDotColor: Record<string, string> = {
    SETUP: 'bg-gray-400',
    IN_PROGRESS: 'bg-green-400 animate-breathe',
    COMPLETED: 'bg-blue-400',
  };

  const statusBadgeColor: Record<string, string> = {
    SETUP: 'bg-gray-600 text-gray-300',
    IN_PROGRESS: 'bg-green-600/30 text-green-400 border border-green-500/50',
    COMPLETED: 'bg-blue-600/30 text-blue-400 border border-blue-500/50',
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      data-testid="discussion-card"
      onClick={() => onClick(id, status)}
      className="glass-panel rounded-lg p-4 hover:bg-white/5 transition-all cursor-pointer group"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColor[status]}`} />
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeColor[status]}`}>
          {statusLabel[status]}
        </span>
        <span className="text-xs text-slate-400/60 ml-auto">{formatDate(createdAt)}</span>
      </div>

      <h3 className="text-white font-medium text-base line-clamp-2 leading-snug mb-2 group-hover:text-indigo-300 transition-colors">
        {topic}
      </h3>

      <div className="flex gap-4 text-xs text-slate-400/60">
        <span>嘉宾 {guestCount > 0 ? guestCount : `${expertCount + 1}（预期）`}</span>
        <span>专家 {expertCount} 人</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// DiscussionList — 讨论卡片列表（独立滚动）
// ════════════════════════════════════════════════════════

const DiscussionList: React.FC = () => {
  const { state } = useHomeContext();
  const navigate = useNavigate();

  const handleJoin = useCallback(
    (id: string, status: DiscussionStatus) => {
      if (status === 'SETUP') {
        navigate(`/setup/${id}`);
      } else {
        navigate(`/studio/${id}`);
      }
    },
    [navigate],
  );

  if (state.isLoading) {
    return (
      <div data-testid="discussion-list" className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        <LoadingSkeleton variant="card" count={3} />
      </div>
    );
  }

  if (state.error) {
    return (
      <div data-testid="discussion-list" className="flex-1 overflow-y-auto px-6 py-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">⚠ {state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (state.discussions.length === 0) {
    return (
      <div data-testid="discussion-list" className="flex-1 overflow-y-auto px-6 py-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-lg mb-2">📋 暂无讨论</p>
          <p className="text-slate-600 text-sm">点击上方「新建讨论」按钮发起第一场圆桌</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="discussion-list" className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      {state.discussions.map((disc) => (
        <DiscussionCard key={disc.id} discussion={disc} onClick={handleJoin} />
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// CreateDiscussionModal — 创建讨论弹窗
// ════════════════════════════════════════════════════════

const CreateDiscussionModal: React.FC = () => {
  const { state, dispatch, createDiscussion } = useHomeContext();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [topic, setTopic] = useState('');
  const [expertCount, setExpertCount] = useState(EXPERT_COUNT_DEFAULT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = topic.trim().length >= 1 && topic.trim().length <= 200;

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    dispatch({ type: 'TOGGLE_CREATE_MODAL', payload: false });
    setTopic('');
    setExpertCount(EXPERT_COUNT_DEFAULT);
  }, [isSubmitting, dispatch]);

  const handleCreate = useCallback(async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await createDiscussion(topic.trim(), expertCount);
      toast('讨论创建成功', 'success');
      dispatch({ type: 'TOGGLE_CREATE_MODAL', payload: false });
      navigate(`/setup/${result.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : '创建失败，请稍后重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [topic, expertCount, isValid, isSubmitting, createDiscussion, dispatch, navigate, toast]);

  if (!state.isCreateModalOpen) return null;

  return (
    <div
      data-testid="create-discussion-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="glass-modal rounded-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">创建新讨论</h2>
          <p className="text-sm text-slate-400 mt-1">输入话题并选择专家人数</p>
        </div>

        {/* 表单 */}
        <div className="px-6 py-4 space-y-4">
          {/* 话题 */}
          <div>
            <label htmlFor="topic-input" className="block text-sm font-medium text-slate-300 mb-1">
              话题
            </label>
            <input
              id="topic-input"
              name="topic"
              data-testid="topic-input"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：AI 是否会在 2030 年前取代 50% 的白领岗位？"
              maxLength={200}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-400/30 transition-colors"
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1 text-right">{topic.length}/200</p>
          </div>

          {/* 专家人数 */}
          <div>
            <label htmlFor="expert-count-input" className="block text-sm font-medium text-slate-300 mb-1">
              专家人数：{expertCount}
            </label>
            <input
              id="expert-count-input"
              name="expertCount"
              data-testid="expert-count-input"
              type="range"
              min={EXPERT_COUNT_MIN}
              max={EXPERT_COUNT_MAX}
              value={expertCount}
              onChange={(e) => setExpertCount(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>{EXPERT_COUNT_MIN} 人</span>
              <span>{EXPERT_COUNT_MAX} 人</span>
            </div>
          </div>
        </div>

        {/* 按钮 */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!isValid || isSubmitting}
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-500/85 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// HomePage — 页面组装
// ════════════════════════════════════════════════════════

const HomePage: React.FC = () => {
  const { state, dispatch } = useHomeContext();

  return (
    <div data-testid="home-page" className="min-h-screen flex flex-col">
      <PageHeader title="AI Panel Studio" subtitle="AI 圆桌讨论演播厅 · 李梦冉" />

      <div className="flex items-center justify-between px-6 pt-4">
        <DiscussionFilter />
        <button
          className="px-5 py-2 text-sm font-medium text-white bg-indigo-500/85 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer flex-shrink-0 ml-4 shadow-lg shadow-indigo-500/15"
          onClick={() => dispatch({ type: 'TOGGLE_CREATE_MODAL', payload: true })}
        >
          + 新建讨论
        </button>
      </div>

      <DiscussionList />

      <CreateDiscussionModal />
    </div>
  );
};

export default HomePage;
