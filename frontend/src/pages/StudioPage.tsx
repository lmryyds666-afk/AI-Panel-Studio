/**
 * StudioPage — 演播厅主页面
 *
 * 路由：/studio/:discussionId
 *
 * 三栏独立滚动布局：
 *   左侧：GuestPanel（嘉宾状态卡片）
 *   中间：TranscriptPanel（发言记录）
 *   右侧：ConsensusPanel（共识/分歧）
 *
 * 响应式策略：
 *   ≥1600：三栏并排（240 + flex + 280）
 *   1024-1599：三栏并排（220 + flex + 260）
 *   768-1023：折叠布局（嘉宾横条 + Transcript/共识上下）
 *   <768：Tab 切换单列
 *
 * E2E: data-testid="studio-page"
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { useToast } from '../components/common/ErrorToast';
import { useStudioContext } from '../context/StudioContext';
import { RUN_STATUS_LABEL_MAP, SPEECH_TYPE_LABEL_MAP, SPEECH_TYPE_COLOR_MAP } from '../constants';
import type { GuestRuntime, Speech, InsightRecord } from '../types';

// ════════════════════════════════════════════════════════
// StudioHeader — 演播厅顶部栏
// ════════════════════════════════════════════════════════

const StudioHeader: React.FC = () => {
  const { state, endDiscussion } = useStudioContext();
  const { toast } = useToast();
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useNavigate();

  const isLive = state.status === 'IN_PROGRESS';
  const isCompleted = state.status === 'COMPLETED';

  const handleEnd = useCallback(async () => {
    setShowEndConfirm(false);
    if (!discussionId) return;
    setIsEnding(true);
    try {
      await endDiscussion(discussionId);
      toast('讨论已结束', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '结束失败', 'error');
    } finally {
      setIsEnding(false);
    }
  }, [discussionId, endDiscussion, toast]);

  return (
    <>
      <header
        data-testid="studio-header"
        className="glass-panel border-b border-white/10 px-6 py-3 sticky top-0 z-30"
      >
        <div className="flex items-center gap-4">
          {/* 返回首页按钮 */}
          <button
            onClick={() => navigate('/')}
            className="px-4 py-1.5 text-sm font-medium text-indigo-400 border border-indigo-500/50 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer flex-shrink-0"
          >
            ← 返回首页
          </button>

          {/* 状态指示灯 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isLive && (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="text-red-400 text-sm font-semibold animate-breathe">直播中</span>
              </>
            )}
            {isCompleted && (
              <span className="text-blue-400 text-sm font-semibold">讨论已结束</span>
            )}
            {!isLive && !isCompleted && (
              <span className="text-gray-400 text-sm">准备中</span>
            )}
          </div>

          {/* 标题 */}
          <h2 className="text-slate-100 text-lg font-bold truncate flex-1">{state.topic}</h2>

          {/* 结束讨论按钮（仅 IN_PROGRESS 状态显示） */}
          {isLive && (
            <button
              onClick={() => setShowEndConfirm(true)}
              disabled={isEnding}
              className="px-4 py-1.5 text-sm font-medium text-red-400 border border-red-500/50 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
            >
              {isEnding ? '正在结束...' : '结束讨论'}
            </button>
          )}
        </div>
      </header>

      {/* 结束确认弹窗 */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md">
          <div className="glass-modal rounded-xl p-6 max-w-sm mx-4">
            <p className="text-white font-medium mb-2">确定结束当前讨论？</p>
            <p className="text-sm text-slate-400 mb-5">讨论将进入 COMPLETED 状态，不可恢复。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleEnd}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-500/85 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer"
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
// GuestStatusCard — 单张嘉宾实时状态小卡
// ════════════════════════════════════════════════════════

const GuestStatusCard: React.FC<{ guest: GuestRuntime }> = ({ guest }) => {
  const { runStatus } = guest;

  const statusDotClass: Record<string, string> = {
    IDLE: 'bg-gray-500',
    PREPARING: 'bg-yellow-400 animate-pulse-dot',
    SPEAKING: 'bg-green-400 animate-breathe-pulse',
  };

  const cardGlowClass =
    runStatus === 'SPEAKING'
      ? 'ring-1 ring-green-500/40 shadow-lg shadow-green-500/20'
      : '';

  const statusLabel = RUN_STATUS_LABEL_MAP[runStatus] ?? runStatus;

  return (
    <div
      data-testid="guest-card"
      className={`guest-card glass-panel-light rounded-lg overflow-hidden transition-all duration-300 ${cardGlowClass}`}
      style={runStatus === 'SPEAKING' ? { ['--glow-color' as string]: guest.color } : undefined}
    >
      {/* 左侧色条 */}
      <div className="flex">
        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: guest.color }} />

        <div className="flex-1 p-3 min-w-0">
          {/* 姓名 + 角色 */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-white text-sm font-semibold truncate">{guest.name}</span>
            {guest.role === 'HOST' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 flex-shrink-0">
                主持
              </span>
            )}
          </div>

          {/* 状态指示灯 */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span data-testid="guest-status" className={`guest-status inline-block w-2 h-2 rounded-full ${statusDotClass[runStatus] ?? 'bg-gray-500'}`} />
            <span className="text-xs text-slate-400">{statusLabel}</span>
          </div>

          {/* publicThought 区域 */}
          <div className="min-h-[2rem]">
            {runStatus === 'IDLE' && (
              <p className="text-xs text-slate-600 italic">待机中...</p>
            )}
            {(runStatus === 'PREPARING' || runStatus === 'SPEAKING') && (
              <p className="text-xs text-slate-300 leading-relaxed">
                {guest.publicThought || '思考中...'}
                <span className="inline-block w-1.5 h-3.5 bg-slate-400 ml-0.5 animate-blink-caret align-middle" />
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// GuestPanel — 左侧：嘉宾状态面板（独立滚动）
// ════════════════════════════════════════════════════════

const GuestPanel: React.FC = () => {
  const { state } = useStudioContext();

  const guests = state.guestOrder
    .map((id) => state.guests.get(id))
    .filter((g): g is GuestRuntime => !!g);

  const host = guests.find((g) => g.role === 'HOST');
  const experts = guests.filter((g) => g.role === 'EXPERT');

  return (
    <aside
      data-testid="guest-panel"
      className="guest-panel glass-panel-light border-r border-white/5 overflow-y-auto studio-scrollbar p-3"
    >
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
        🎭 嘉宾
      </h3>

      {guests.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-8">等待嘉宾入场...</p>
      )}

      {/* 主持人 */}
      {host && (
        <div className="mb-3">
          <GuestStatusCard guest={host} />
          {experts.length > 0 && (
            <div className="mt-3 mb-2 border-t border-white/5 pt-2">
              <span className="text-[10px] text-slate-500 px-1">专家</span>
            </div>
          )}
        </div>
      )}

      {/* 专家列表 */}
      <div className="space-y-2">
        {experts.map((expert) => (
          <GuestStatusCard key={expert.id} guest={expert} />
        ))}
      </div>
    </aside>
  );
};

// ════════════════════════════════════════════════════════
// SpeechBubble — 单条发言气泡
// ════════════════════════════════════════════════════════

const SpeechBubble: React.FC<{ speech: Speech; isHighlighted?: boolean }> = ({
  speech,
  isHighlighted = false,
}) => {
  const typeLabel = SPEECH_TYPE_LABEL_MAP[speech.speechType];
  const typeColor = SPEECH_TYPE_COLOR_MAP[speech.speechType];

  return (
    <div
      data-testid="speech-bubble"
      className={`flex gap-4 px-5 py-3.5 mb-3 bg-slate-900/85 hover:bg-slate-800/75 rounded-xl transition-colors shadow-md ${
        isHighlighted ? 'animate-highlight-flash' : ''
      }`}
    >
      {/* 发言者色条 */}
      <div
        className="w-1.5 rounded-full flex-shrink-0 self-stretch"
        style={{ backgroundColor: speech.guestColor }}
      />

      <div className="flex-1 min-w-0">
        {/* 发言者信息 + 类型标签 */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-white text-sm font-semibold">{speech.guestName}</span>
          <span className="text-xs text-slate-500">{speech.guestTitle}</span>
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: speech.guestColor }}
          />
          {typeLabel && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}>
              {typeLabel}
            </span>
          )}
          <span className="text-[10px] text-slate-600 ml-auto">#{speech.sequence}</span>
        </div>

        {/* 发言内容 */}
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
          {speech.content}
        </p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// TranscriptPanel — 中间：发言记录面板（独立滚动）
// ════════════════════════════════════════════════════════

const TranscriptPanel: React.FC = () => {
  const { state } = useStudioContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const isCompleted = state.status === 'COMPLETED';

  // 新发言自动滚底
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [state.speeches.length, autoScroll]);

  // 检测手动上滚 → 关闭自动滚底
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setAutoScroll(distanceFromBottom < 50);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 面板标题 */}
      <div className="flex items-center justify-between px-4 py-2 glass-panel-light border-b border-white/5 flex-shrink-0">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          📝 发言记录
        </h3>
        <span className="text-xs text-slate-600">{state.speeches.length} 条</span>
      </div>

      {/* 滚动容器 */}
      <div
        ref={containerRef}
        data-testid="transcript-panel"
        className="transcript-panel flex-1 overflow-y-auto studio-scrollbar"
        onScroll={handleScroll}
      >
        {state.speeches.length === 0 && (
          <div className="flex items-center justify-center py-16 text-slate-600 text-sm">
            {state.status === 'IN_PROGRESS' ? '等待发言...' : '暂无发言记录'}
          </div>
        )}

        {state.speeches.map((speech) => (
          <SpeechBubble
            key={speech.id}
            speech={speech}
            isHighlighted={speech.id === state.highlightedSpeechId}
          />
        ))}

        {/* 讨论结束分隔线 */}
        {isCompleted && state.speeches.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-6 text-slate-500 text-sm">
            <div className="flex-1 border-t border-white/5" />
            <span className="flex-shrink-0">── 讨论结束 ──</span>
            <div className="flex-1 border-t border-white/5" />
          </div>
        )}

        {/* 总结展示 */}
        {state.summary && (
          <div className="mx-4 my-3 p-4 bg-indigo-400/8 border border-indigo-400/20 rounded-lg">
            <p className="text-xs text-indigo-400 font-semibold mb-2">📋 主持人总结</p>
            <p className="text-sm text-slate-300 leading-relaxed">{state.summary}</p>
          </div>
        )}
      </div>

      {/* 回到底部按钮 */}
      {!autoScroll && state.speeches.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-medium text-white bg-indigo-500/85 hover:bg-indigo-500 rounded-full shadow-lg backdrop-blur-sm cursor-pointer transition-colors"
          style={{ position: 'fixed', bottom: '1rem' }}
        >
          ↓ 回到底部
        </button>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// InsightCard — 单条共识/分歧内容卡（复用）
// ════════════════════════════════════════════════════════

const InsightCard: React.FC<{
  type: 'consensus' | 'divergence';
  content: string;
  relatedSpeechIds: string[];
  createdAt: string;
  onSpeechClick?: (speechId: string) => void;
}> = ({ type, content, relatedSpeechIds, createdAt, onSpeechClick }) => {
  const isConsensus = type === 'consensus';
  const borderColor = isConsensus ? 'border-l-green-500' : 'border-l-orange-500';
  const bgColor = isConsensus ? 'bg-green-500/5' : 'bg-orange-500/5';
  const icon = isConsensus ? '✅' : '⚡';

  return (
    <div
      data-testid="insight-card"
      className={`border-l-2 ${borderColor} ${bgColor} px-3 py-2 rounded-r animate-fade-in-up`}
    >
      <p className="text-xs text-slate-300 leading-relaxed mb-2">{content}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-slate-600">
          {new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {relatedSpeechIds.length > 0 && (
          <span className="text-[10px] text-slate-500">关联发言：</span>
        )}
        {relatedSpeechIds.map((sid) => (
          <button
            key={sid}
            onClick={() => onSpeechClick?.(sid)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-indigo-400 hover:bg-white/20 hover:text-indigo-300 transition-colors cursor-pointer"
            title={`跳转到发言 #${sid.slice(0, 8)}`}
          >
            #{sid.slice(0, 8)}
          </button>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// ConsensusSection / DivergenceSection — 独立滚动区块
// ════════════════════════════════════════════════════════

const ConsensusSection: React.FC<{
  title: string;
  icon: string;
  type: 'consensus' | 'divergence';
  items: InsightRecord[];
  onSpeechClick: (speechId: string) => void;
  emptyText: string;
}> = ({ title, icon, type, items, onSpeechClick, emptyText }) => (
  <div
    data-testid={type === 'consensus' ? 'consensus-section' : 'divergence-section'}
    className="flex-1 flex flex-col min-h-0"
  >
    <div className="flex items-center gap-2 px-4 py-2 glass-panel-light border-b border-white/5 flex-shrink-0">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {icon} {title} ({items.length})
      </h4>
    </div>

    <div className="flex-1 overflow-y-auto studio-scrollbar px-3 py-2 space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-6">{emptyText}</p>
      )}
      {items.map((item) => (
        <InsightCard
          key={item.id}
          type={type}
          content={item.content}
          relatedSpeechIds={item.relatedSpeechIds}
          createdAt={item.createdAt}
          onSpeechClick={onSpeechClick}
        />
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════
// ConsensusPanel — 右侧：共识/分歧面板
// ════════════════════════════════════════════════════════

const ConsensusPanel: React.FC = () => {
  const { state, highlightSpeech } = useStudioContext();

  const handleSpeechClick = useCallback(
    (speechId: string) => {
      // 设置高亮 speech
      highlightSpeech(speechId);
      // 3 秒后清除高亮
      setTimeout(() => highlightSpeech(null), 3000);
    },
    [highlightSpeech],
  );

  const isEmpty = state.consensus.length === 0 && state.divergence.length === 0;

  return (
    <aside
      data-testid="consensus-panel"
      className="consensus-panel glass-panel-light border-l border-white/5 flex flex-col min-h-0"
    >
      <div className="px-4 py-2 glass-panel-light border-b border-white/5 flex-shrink-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          💡 共识与分歧
        </h3>
      </div>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-slate-500 text-center">
            讨论刚开始，尚无共识/分歧
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <ConsensusSection
            title="共识"
            icon="✅"
            type="consensus"
            items={state.consensus}
            onSpeechClick={handleSpeechClick}
            emptyText="暂无共识"
          />
          <div className="border-t border-white/5" />
          <ConsensusSection
            title="分歧"
            icon="⚡"
            type="divergence"
            items={state.divergence}
            onSpeechClick={handleSpeechClick}
            emptyText="暂无分歧"
          />
        </div>
      )}
    </aside>
  );
};

// ════════════════════════════════════════════════════════
// StudioPage — 演播厅主页面组装
// ════════════════════════════════════════════════════════

const StudioPage: React.FC = () => {
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useNavigate();
  const { state, loadStudioData } = useStudioContext();
  const [mobileTab, setMobileTab] = useState<'guests' | 'transcript' | 'consensus'>('transcript');

  // 加载数据
  useEffect(() => {
    if (discussionId) {
      loadStudioData(discussionId);
    }
  }, [discussionId, loadStudioData]);

  // ─── 加载中 ────────────────────────────────────────

  if (state.isLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="演播厅" onBack={() => navigate('/')} />
        <div className="p-6 space-y-4">
          <LoadingSkeleton variant="line" count={1} />
          <div className="flex gap-4">
            <div className="w-60 space-y-2">
              <LoadingSkeleton variant="card" count={3} />
            </div>
            <div className="flex-1 space-y-2">
              <LoadingSkeleton variant="bubble" count={5} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── 错误 ──────────────────────────────────────────

  if (state.error) {
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

  // ─── 正常渲染 ──────────────────────────────────────

  return (
    <div data-testid="studio-page" className="min-h-screen flex flex-col">
      <StudioHeader />

      {/* ============ 桌面/超宽：三栏布局 ============ */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* 超宽 ≥1600：240px + 1fr + 280px */}
        <div className="hidden 2xl:flex flex-1 min-h-0">
          <div className="w-[240px] flex-shrink-0">
            <GuestPanel />
          </div>
          <TranscriptPanel />
          <div className="w-[280px] flex-shrink-0">
            <ConsensusPanel />
          </div>
        </div>

        {/* 桌面 1024-1599：220px + 1fr + 260px */}
        <div className="flex 2xl:hidden flex-1 min-h-0">
          <div className="w-[220px] flex-shrink-0">
            <GuestPanel />
          </div>
          <TranscriptPanel />
          <div className="w-[260px] flex-shrink-0">
            <ConsensusPanel />
          </div>
        </div>
      </div>

      {/* ============ 平板 768-1023：折叠布局 ============ */}
      <div className="hidden sm:flex md:hidden flex-1 flex-col min-h-0">
        {/* 嘉宾横条 */}
        <div className="flex-shrink-0 max-h-48 overflow-y-auto studio-scrollbar border-b border-white/5">
          <GuestPanel />
        </div>
        {/* Transcript + 共识上下分布 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-[2] min-h-0">
            <TranscriptPanel />
          </div>
          <div className="flex-[1] min-h-0 border-t border-white/5">
            <ConsensusPanel />
          </div>
        </div>
      </div>

      {/* ============ 手机 <768：Tab 切换 ============ */}
      <div className="sm:hidden flex-1 flex flex-col min-h-0">
        {/* Tab 栏 */}
        <div className="flex border-b border-white/5 flex-shrink-0">
          {([
            { key: 'guests', label: '嘉宾' },
            { key: 'transcript', label: '发言' },
            { key: 'consensus', label: '共识' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                mobileTab === tab.key
                  ? 'text-indigo-300 border-b-2 border-indigo-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 min-h-0">
          {mobileTab === 'guests' && <GuestPanel />}
          {mobileTab === 'transcript' && <TranscriptPanel />}
          {mobileTab === 'consensus' && <ConsensusPanel />}
        </div>
      </div>
    </div>
  );
};

export default StudioPage;
