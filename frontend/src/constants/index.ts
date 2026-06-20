/**
 * AI Panel Studio — 前端常量
 */

import type { DiscussionStatus, SpeechType } from '../types';

// ─── API ─────────────────────────────────────────────

export const API_BASE_URL = '/api';

export const WS_BASE_URL = `ws://${window.location.hostname}:3001/ws/discussions`;

// ─── 颜色池（与后端一致，10 种高区分度色值）─────────

export const COLOR_POOL: string[] = [
  '#FF6B6B',
  '#45B7D1',
  '#F7DC6F',
  '#BB8FCE',
  '#4ECDC4',
  '#FF8C42',
  '#2ECC71',
  '#E74C3C',
  '#3498DB',
  '#F39C12',
];

// ─── 讨论状态 ────────────────────────────────────────

export const STATUS_LABEL_MAP: Record<DiscussionStatus, string> = {
  SETUP: '待配置',
  IN_PROGRESS: '进行中',
  COMPLETED: '已结束',
};

export const STATUS_COLOR_MAP: Record<DiscussionStatus, string> = {
  SETUP: 'bg-gray-500',
  IN_PROGRESS: 'bg-green-500',
  COMPLETED: 'bg-blue-500',
};

export const STATUS_DOT_COLOR_MAP: Record<DiscussionStatus, string> = {
  SETUP: 'bg-gray-400',
  IN_PROGRESS: 'bg-green-400 animate-pulse',
  COMPLETED: 'bg-blue-400',
};

export const STATUS_FILTER_OPTIONS: { label: string; value: DiscussionStatus | null }[] = [
  { label: '全部', value: null },
  { label: '待配置', value: 'SETUP' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已结束', value: 'COMPLETED' },
];

// ─── 嘉宾运行状态 ────────────────────────────────────

export const RUN_STATUS_LABEL_MAP: Record<string, string> = {
  IDLE: '待机中',
  PREPARING: '准备中',
  SPEAKING: '发言中',
};

// ─── 发言类型 ────────────────────────────────────────

export const SPEECH_TYPE_LABEL_MAP: Record<SpeechType, string> = {
  OPENING: '开场',
  FOLLOW_UP: '追问',
  BRIDGING: '过渡',
  ANSWER: '回答',
  SUPPLEMENT: '补充',
  COUNTER: '反驳',
  SUMMARY: '总结',
};

export const SPEECH_TYPE_COLOR_MAP: Record<SpeechType, string> = {
  OPENING: 'bg-amber-400/20 text-amber-300',
  FOLLOW_UP: 'bg-sky-400/20 text-sky-300',
  BRIDGING: 'bg-purple-400/20 text-purple-300',
  ANSWER: 'bg-blue-400/20 text-blue-300',
  SUPPLEMENT: 'bg-emerald-400/20 text-emerald-300',
  COUNTER: 'bg-red-400/20 text-red-300',
  SUMMARY: 'bg-violet-400/20 text-violet-300',
};

// ─── 分页 ────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 20;

export const EXPERT_COUNT_MIN = 2;
export const EXPERT_COUNT_MAX = 8;
export const EXPERT_COUNT_DEFAULT = 4;
