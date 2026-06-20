/**
 * GuestSetupPage — 嘉宾配置页
 *
 * 路由：/setup/:discussionId
 *
 * 组合：TopicCard + GuestGrid(GuestProfileCard[]) + RegenerateButton + ConfirmButton。
 * E2E: data-testid="guest-setup-page"
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { useToast } from '../components/common/ErrorToast';
import { useGuestSetupContext } from '../context/GuestSetupContext';
import type { Guest } from '../types';

// ════════════════════════════════════════════════════════
// TopicCard — 话题摘要卡片
// ════════════════════════════════════════════════════════

const TopicCard: React.FC<{ topic: string; expertCount: number }> = ({ topic, expertCount }) => (
  <div data-testid="topic-card" className="glass-panel rounded-lg p-5">
    <div className="flex items-start gap-3">
      <span className="text-2xl">💬</span>
      <div className="flex-1">
        <h2 className="text-lg font-bold text-white mb-1">{topic}</h2>
        <div className="flex gap-4 text-sm text-slate-400">
          <span>预期专家：{expertCount} 人</span>
          <span>总嘉宾：{expertCount + 1} 人（含主持人）</span>
        </div>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════
// GuestProfileCard — 单张嘉宾信息展示卡
// ════════════════════════════════════════════════════════

const GuestProfileCard: React.FC<{ guest: Guest }> = ({ guest }) => {
  const isHost = guest.role === 'HOST';

  return (
    <div
      data-testid="guest-card"
      className="guest-card glass-panel rounded-lg overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* 顶部色条 */}
      <div className="h-1.5" style={{ backgroundColor: guest.color }} />

      <div className="p-4">
        {/* 姓名 + 角色标签 */}
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-white font-bold text-base">{guest.name}</h3>
          {isHost && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              主持人
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm text-slate-300 mb-1">{guest.title}</p>

        {/* 职业 */}
        <p className="text-xs text-slate-500 mb-2">{guest.occupation}</p>

        {/* 立场 */}
        <p className="text-xs text-slate-400 italic leading-relaxed border-t border-white/5 pt-2 mt-2">
          「{guest.stance}」
        </p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// GuestGrid — 响应式嘉宾卡片网格容器
// ════════════════════════════════════════════════════════

const GuestGrid: React.FC<{ guests: Guest[] }> = ({ guests }) => {
  // 排序：主持人置顶 + sortOrder
  const sorted = [...guests].sort((a, b) => {
    if (a.role === 'HOST' && b.role !== 'HOST') return -1;
    if (a.role !== 'HOST' && b.role === 'HOST') return 1;
    return a.sortOrder - b.sortOrder;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((guest) => (
        <GuestProfileCard key={guest.id} guest={guest} />
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// RegenerateButton — 重新生成按钮
// ════════════════════════════════════════════════════════

const RegenerateButton: React.FC<{
  discussionId: string;
  onSuccess: (guests: Guest[]) => void;
  disabled: boolean;
}> = ({ discussionId, onSuccess, disabled }) => {
  const { generateGuests } = useGuestSetupContext();
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRegenerate = useCallback(async () => {
    setShowConfirm(false);
    try {
      const guests = await generateGuests(discussionId);
      onSuccess(guests);
      toast('嘉宾阵容已重新生成', 'success');
    } catch {
      // 错误已在 context 中处理
    }
  }, [discussionId, generateGuests, onSuccess, toast]);

  return (
    <>
      <button
        data-testid="regenerate-button"
        onClick={() => setShowConfirm(true)}
        disabled={disabled}
        className="px-5 py-2.5 text-sm font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        🔄 重新生成
      </button>

      {/* 二次确认弹窗 */}
      {showConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-md">
          <div className="glass-modal rounded-xl p-6 max-w-sm mx-4">
            <p className="text-white font-medium mb-2">确认重新生成？</p>
            <p className="text-sm text-slate-400 mb-5">将丢弃当前阵容并通过 AI 重新生成嘉宾。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleRegenerate}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500/85 hover:bg-amber-500 rounded-lg transition-colors cursor-pointer"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ════════════════════════════════════════════════════════
// ConfirmButton — 确认并进入演播厅按钮
// ════════════════════════════════════════════════════════

const ConfirmButton: React.FC<{ discussionId: string; disabled: boolean }> = ({
  discussionId,
  disabled,
}) => {
  const { state, confirmGuests } = useGuestSetupContext();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleConfirm = useCallback(async () => {
    try {
      await confirmGuests(discussionId);
      toast('阵容已确认，即将进入演播厅', 'success');
      navigate(`/studio/${discussionId}`);
    } catch {
      // 错误已在 context 中处理
    }
  }, [discussionId, confirmGuests, navigate, toast]);

  return (
    <button
      data-testid="confirm-button"
      onClick={handleConfirm}
      disabled={disabled || state.isConfirming}
      className="px-6 py-3 text-sm font-bold text-white bg-emerald-500/85 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
    >
      {state.isConfirming ? '确认中...' : '✅ 确认并进入演播厅'}
    </button>
  );
};

// ════════════════════════════════════════════════════════
// GuestSetupPage — 页面组装
// ════════════════════════════════════════════════════════

const GuestSetupPage: React.FC = () => {
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useNavigate();
  const { state, loadDiscussion, generateGuests } = useGuestSetupContext();
  const { toast } = useToast();

  // 加载讨论详情
  useEffect(() => {
    if (discussionId) {
      loadDiscussion(discussionId);
    }
  }, [discussionId, loadDiscussion]);

  // 自动触发嘉宾生成（guests 为空且状态为 SETUP 时，仅执行一次）
  useEffect(() => {
    if (
      discussionId &&
      state.discussion &&
      state.discussion.status === 'SETUP' &&
      state.guests.length === 0 &&
      !state.isGenerating &&
      !state.isLoading &&
      !state.error  // 已失败则停止自动重试，防止无限循环
    ) {
      generateGuests(discussionId).catch(() => {
        toast('AI 嘉宾生成失败，请手动重试', 'error');
      });
    }
  }, [discussionId, state.discussion, state.guests.length, state.isGenerating, state.isLoading, state.error, generateGuests, toast]);

  // ─── 加载中 ────────────────────────────────────────

  if (state.isLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="嘉宾配置" onBack={() => navigate('/')} />
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <LoadingSkeleton variant="card" count={1} />
          <LoadingSkeleton variant="card" count={3} />
        </div>
      </div>
    );
  }

  // ─── 错误 ──────────────────────────────────────────

  if (state.error && !state.discussion) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">⚠ {state.error}</p>
          <button
            onClick={() => navigate('/')}
            className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // ─── 非 SETUP 状态 ─────────────────────────────────

  if (state.discussion && state.discussion.status !== 'SETUP') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-lg mb-2">
            ⚠ 当前讨论状态为「{state.discussion.status}」，不支持嘉宾配置
          </p>
          <button
            onClick={() => navigate(`/studio/${discussionId}`)}
            className="px-4 py-2 bg-indigo-500/85 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer mt-3"
          >
            进入演播厅
          </button>
        </div>
      </div>
    );
  }

  // ─── 正常状态 ──────────────────────────────────────

  const hasGuests = state.guests.length > 0;

  return (
    <div data-testid="guest-setup-page" className="min-h-screen">
      <PageHeader
        title="嘉宾配置"
        subtitle={state.discussion?.topic ?? ''}
        onBack={() => navigate('/')}
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* 话题摘要 */}
        {state.discussion && (
          <TopicCard topic={state.discussion.topic} expertCount={state.discussion.expertCount} />
        )}

        {/* AI 生成中 */}
        {state.isGenerating && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400">AI 正在为您设计嘉宾阵容...</p>
            <p className="text-xs text-slate-600">根据话题匹配最合适的专家与主持人</p>
          </div>
        )}

        {/* 嘉宾网格 */}
        {hasGuests && !state.isGenerating && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg">
                🎭 嘉宾阵容（{state.guests.length} 人）
              </h3>
            </div>
            <GuestGrid guests={state.guests} />
          </>
        )}

        {/* 操作按钮 */}
        {!state.isGenerating && state.guests.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t border-white/5">
            <RegenerateButton
              discussionId={discussionId!}
              onSuccess={(guests) => {
                // 已在 context 中更新
              }}
              disabled={state.isConfirming}
            />
            <ConfirmButton discussionId={discussionId!} disabled={false} />
          </div>
        )}

        {/* 无嘉宾且错误 */}
        {!state.isGenerating && state.guests.length === 0 && state.error && (
          <div className="text-center py-8">
            <p className="text-red-400 mb-3">⚠ {state.error}</p>
            <button
              data-testid="generate-button"
              onClick={() => discussionId && generateGuests(discussionId)}
              className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-500/85 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
            >
              生成嘉宾
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuestSetupPage;
