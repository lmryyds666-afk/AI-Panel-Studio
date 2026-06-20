/**
 * 共识分歧提炼服务
 *
 * 职责：
 *   1. 监听 new_speech 事件，异步分析每条新发言
 *   2. 调用 DeepSeek 大模型提炼当前讨论的共识点与分歧点
 *   3. 结果写入 ConsensusRecord 表（全量替换策略）
 *   4. 通过 WebSocket 广播 consensus_update 事件
 *
 * 核心机制：
 *   - 发言积累：至少 N 条发言后才触发提炼
 *   - 间隔控制：每 M 条发言触发一次（避免过度调用）
 *   - 限流：滑动窗口计数器，防止高频发言导致 API 超限
 *   - 重试：指数退避重试机制（3 次）
 *   - 多讨论隔离：每个 discussionId 独立维护状态
 *   - 强制 JSON 输出：Zod 校验 AI 响应结构
 *
 * 依赖注入：
 *   - PrismaClient  → 数据库读写
 *   - AICaller       → DeepSeek 大模型调用
 *   - DiscussionWsServer（可选）→ WebSocket 实时广播
 */

import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { DiscussionWsServer } from '../ws/websocket-server';
import type {
  ConsensusUpdatePayload,
  ConsensusRecordItem,
  NewSpeechPayload,
} from '../ws/types';

// ─── 类型定义 ────────────────────────────────────────

/** AI 调用签名 */
export type AICaller = (prompt: string) => Promise<string>;

/** 提炼器配置 */
export interface ExtractorConfig {
  /** 最少发言条数才能触发首次提炼，默认 3 */
  minSpeechesBeforeExtraction?: number;
  /** 每 N 条新发言触发一次提炼，默认 2 */
  speechInterval?: number;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 基础重试延迟（ms），默认 1000 */
  retryDelayMs?: number;
  /** 限流窗口（ms），默认 15000 */
  rateLimitWindowMs?: number;
  /** 每个窗口内最大 API 调用次数，默认 2 */
  maxCallsPerWindow?: number;
}

/** 单场讨论的提炼状态 */
interface ExtractionState {
  /** 已处理的最后一条发言序号 */
  lastSpeechSeq: number;
  /** 上次提炼时的发言总数 */
  lastExtractionSpeechCount: number;
  /** API 调用时间戳列表（用于限流） */
  callTimestamps: number[];
}

// ─── Zod Schema：AI 响应结构校验 ─────────────────────

const extractItemSchema = z.object({
  content: z
    .string()
    .min(10, '共识/分歧内容至少 10 字符')
    .max(300, '共识/分歧内容不得超过 300 字符'),
  relatedSpeechIds: z
    .array(z.string())
    .min(1, '至少关联 1 条发言'),
});

const extractionResultSchema = z.object({
  consensus: z
    .array(extractItemSchema)
    .max(20, '共识点不得超过 20 条'),
  divergence: z
    .array(extractItemSchema)
    .max(20, '分歧点不得超过 20 条'),
});

type ExtractionResult = z.infer<typeof extractionResultSchema>;

// ─── JSON 提取工具 ──────────────────────────────────

/** 从 AI 原始输出中提取 JSON 字符串 */
function extractJSON(raw: string): string {
  // 1. 尝试匹配 markdown 代码块
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const cleaned = cleanJSON(codeBlockMatch[1].trim());
    if (isValidJSON(cleaned)) return cleaned;
  }

  // 2. 找到第一个完整 JSON 对象
  const firstBrace = raw.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('AI 输出中未找到 JSON 对象');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = firstBrace; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === '"') { inString = false; }
    } else {
      if (ch === '"') { inString = true; }
      else if (ch === '{') { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
  }

  if (end === -1) {
    throw new Error('AI 输出中 JSON 对象不完整（括号未闭合）');
  }

  const json = raw.slice(firstBrace, end + 1);
  const cleaned = cleanJSON(json);
  if (!isValidJSON(cleaned)) {
    throw new Error(`提取的 JSON 无法解析，内容前 300 字符：${cleaned.slice(0, 300)}`);
  }
  return cleaned;
}

function cleanJSON(raw: string): string {
  return raw
    .replace(/\/\/.*$/gm, '')
    .replace(/,\s*(\}|\])/g, '$1');
}

function isValidJSON(s: string): boolean {
  try { JSON.parse(s); return true; }
  catch { return false; }
}

// ════════════════════════════════════════════════════════
// ConsensusExtractor 核心类
// ════════════════════════════════════════════════════════

export class ConsensusExtractor {
  /** 每场讨论的独立提炼状态 */
  private states = new Map<string, ExtractionState>();
  private config: Required<ExtractorConfig>;

  constructor(
    private prisma: PrismaClient,
    private callAI: AICaller,
    private wsServer?: DiscussionWsServer,
    config?: ExtractorConfig,
  ) {
    this.config = {
      minSpeechesBeforeExtraction: config?.minSpeechesBeforeExtraction ?? 3,
      speechInterval: config?.speechInterval ?? 2,
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      rateLimitWindowMs: config?.rateLimitWindowMs ?? 15000,
      maxCallsPerWindow: config?.maxCallsPerWindow ?? 2,
    };
  }

  // ─── 公开方法 ────────────────────────────────────

  /**
   * 分析一条新发言
   *
   * 流程：
   *   1. 更新内部状态（发言计数）
   *   2. 检查是否达到提炼阈值（minSpeeches + interval）
   *   3. 检查限流
   *   4. 带重试调用 AI → 解析 → 持久化 → 广播
   *
   * 此方法不抛出异常——即使提炼失败也不影响主流程。
   *
   * @param discussionId   - 讨论 ID
   * @param speech         - 新发言负载
   * @param guestContexts  - 嘉宾上下文（id/name/role/title/stance）
   * @param topic          - 讨论话题（可选，优先从 DB 读取）
   */
  async analyzeNewSpeech(
    discussionId: string,
    speech: NewSpeechPayload,
    guestContexts: Array<{
      id: string;
      name: string;
      role: string;
      title: string;
      stance: string;
    }>,
    topic?: string,
  ): Promise<void> {
    // 1. 获取或初始化状态
    let state = this.states.get(discussionId);
    if (!state) {
      state = { lastSpeechSeq: 0, lastExtractionSpeechCount: 0, callTimestamps: [] };
      this.states.set(discussionId, state);
    }

    // 2. 更新发言计数
    state.lastSpeechSeq = speech.sequence;

    // 3. 当前发言总数（使用 sequence — 生产中 sequence 始终等于 DB 中 visible speech 数）
    const speechCount = speech.sequence;

    // 4. 检查是否达到提炼阈值
    if (speechCount < this.config.minSpeechesBeforeExtraction) return;

    const speechesSinceLastExtraction = speechCount - state.lastExtractionSpeechCount;
    if (speechesSinceLastExtraction < this.config.speechInterval) return;

    // 5. 限流检查
    if (!this.checkRateLimit(state)) return;

    // 6. 带重试执行提炼
    const result = await this.extractWithRetry(discussionId, guestContexts, topic);
    if (!result) return; // 提炼失败（已记录日志）

    // 7. 持久化 + 广播
    await this.persistAndBroadcast(discussionId, result);

    // 8. 更新状态
    state.lastExtractionSpeechCount = speechCount;
    state.callTimestamps.push(Date.now());
  }

  /** 获取讨论提炼状态（供外部检查） */
  getState(discussionId: string): ExtractionState | undefined {
    return this.states.get(discussionId);
  }

  /** 清理讨论状态 */
  destroyState(discussionId: string): void {
    this.states.delete(discussionId);
  }

  // ─── 私有方法：限流 ──────────────────────────────

  /**
   * 滑动窗口限流检查
   *
   * 在当前时间窗口内，调用次数超过 maxCallsPerWindow 时拒绝。
   */
  private checkRateLimit(state: ExtractionState): boolean {
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindowMs;

    // 清理过期的时间戳
    state.callTimestamps = state.callTimestamps.filter((t) => t > windowStart);

    return state.callTimestamps.length < this.config.maxCallsPerWindow;
  }

  // ─── 私有方法：重试提取 ──────────────────────────

  /**
   * 带指数退避重试的 AI 提取
   *
   * @returns 提炼结果，失败返回 null
   */
  private async extractWithRetry(
    discussionId: string,
    guestContexts: Array<{
      id: string;
      name: string;
      role: string;
      title: string;
      stance: string;
    }>,
    topic?: string,
  ): Promise<ExtractionResult | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.callAIAndParse(discussionId, guestContexts, topic);
        return result;
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          console.warn(
            `[ConsensusExtractor] 讨论 ${discussionId} 提炼失败（第 ${attempt + 1}/${this.config.maxRetries + 1} 次），` +
            `${delay}ms 后重试：${lastError.message.slice(0, 100)}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error(
      `[ConsensusExtractor] 讨论 ${discussionId} 提炼失败，已达最大重试次数：${lastError?.message.slice(0, 200)}`,
    );
    return null;
  }

  // ─── 私有方法：AI 调用与解析 ────────────────────

  /**
   * 调用 AI 并解析响应
   */
  private async callAIAndParse(
    discussionId: string,
    guestContexts: Array<{
      id: string;
      name: string;
      role: string;
      title: string;
      stance: string;
    }>,
    topic?: string,
  ): Promise<ExtractionResult> {
    // 读取当前所有可见发言
    const speeches = await this.prisma.speech.findMany({
      where: { discussionId, isVisible: true },
      orderBy: { sequence: 'asc' },
    });

    // 读取已有的共识/分歧记录（供 AI 参考增量变化）
    const existingRecords = await this.prisma.consensusRecord.findMany({
      where: { discussionId },
      orderBy: { recordType: 'asc' },
    });

    // 获取话题（优先从 DB 读取）
    let resolvedTopic = topic;
    if (!resolvedTopic) {
      const discussion = await this.prisma.discussion.findUnique({
        where: { id: discussionId },
        select: { topic: true },
      });
      resolvedTopic = discussion?.topic ?? '未知话题';
    }

    const prompt = this.buildExtractionPrompt(
      resolvedTopic,
      guestContexts,
      speeches.map((s) => ({
        id: s.id,
        guestId: s.guestId,
        guestName: '', // 从 guestContexts 补全
        content: s.content,
        speechType: s.speechType,
        sequence: s.sequence,
      })),
      existingRecords.map((r) => ({
        type: r.recordType,
        content: r.content,
        relatedSpeechIds: JSON.parse(r.relatedSpeechIds) as string[],
      })),
    );

    const rawResponse = await this.callAI(prompt);
    const jsonStr = extractJSON(rawResponse);

    let data: unknown;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw new Error(`AI 返回的 JSON 格式无效：${jsonStr.slice(0, 300)}`);
    }

    const result = extractionResultSchema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`提炼 AI 响应校验失败：\n${issues}\n原始 JSON：${jsonStr.slice(0, 500)}`);
    }

    return result.data;
  }

  // ─── 私有方法：Prompt 构建 ────────────────────────

  /**
   * 构建共识/分歧提炼 Prompt
   */
  private buildExtractionPrompt(
    topic: string,
    guests: Array<{
      id: string;
      name: string;
      role: string;
      title: string;
      stance: string;
    }>,
    speeches: Array<{
      id: string;
      guestId: string;
      guestName: string;
      content: string;
      speechType: string;
      sequence: number;
    }>,
    existingRecords: Array<{
      type: string;
      content: string;
      relatedSpeechIds: string[];
    }>,
  ): string {
    const guestList = guests
      .map((g) => {
        const shortName = g.name; // full name already includes role info
        return `[${g.id}] ${shortName}（${g.role === 'HOST' ? '主持人' : '专家'}）\n  头衔：${g.title}\n  立场：${g.stance}`;
      })
      .join('\n');

    // 为每条发言补全发言人姓名
    const speechesWithNames = speeches.map((s) => {
      const guest = guests.find((g) => g.id === s.guestId);
      return `[#${s.sequence}] ${guest?.name ?? '未知'}（${s.speechType}）：${s.content}`;
    }).join('\n');

    const existingSection = existingRecords.length > 0
      ? `\n## 已有提炼结果\n共识：\n${existingRecords.filter(r => r.type === 'CONSENSUS').map(r => `  - ${r.content}`).join('\n')}\n分歧：\n${existingRecords.filter(r => r.type === 'DIVERGENCE').map(r => `  - ${r.content}`).join('\n')}`
      : '';

    return `你是 AI 圆桌讨论的实时分析引擎。你需要从当前讨论中提取已形成的共识点与分歧点。

## 讨论话题
${topic}

## 嘉宾阵容
${guestList}

## 完整发言记录（共 ${speeches.length} 条）
${speechesWithNames}
${existingSection}

## 提炼规则
- **共识点**：至少 2 位不同专家表达了相似或相容的观点，且尚未被明确反对
- **分歧点**：至少 2 位专家就同一子议题表达了明显对立或矛盾的观点
- 每条记录需关联具体的发言 ID（relatedSpeechIds），方便前端溯源
- 如果当前讨论尚未形成明确共识或分歧，返回空数组
- 至多各返回 10 条记录，优先最近形成的关键洞察

## 输出格式
严格按以下 JSON 格式输出，不要添加任何其他文字：

\`\`\`json
{
  "consensus": [
    {
      "content": "各方认同的具体共识点描述",
      "relatedSpeechIds": ["s-xxx-001", "s-xxx-005"]
    }
  ],
  "divergence": [
    {
      "content": "各方分歧的具体描述",
      "relatedSpeechIds": ["s-xxx-002", "s-xxx-003"]
    }
  ]
}
\`\`\``;
  }

  // ─── 私有方法：持久化与广播 ──────────────────────

  /**
   * 将提炼结果持久化到数据库并通过 WebSocket 广播
   *
   * 策略：全量替换 —— 删除旧记录，插入新记录，确保与 AI 输出完全一致。
   */
  private async persistAndBroadcast(
    discussionId: string,
    result: ExtractionResult,
  ): Promise<void> {
    // 1. 删除旧记录
    await this.prisma.consensusRecord.deleteMany({
      where: { discussionId },
    });

    // 2. 插入新记录
    const records: Array<{
      discussionId: string;
      recordType: string;
      content: string;
      relatedSpeechIds: string;
    }> = [];

    for (const item of result.consensus) {
      records.push({
        discussionId,
        recordType: 'CONSENSUS',
        content: item.content,
        relatedSpeechIds: JSON.stringify(item.relatedSpeechIds),
      });
    }
    for (const item of result.divergence) {
      records.push({
        discussionId,
        recordType: 'DIVERGENCE',
        content: item.content,
        relatedSpeechIds: JSON.stringify(item.relatedSpeechIds),
      });
    }

    if (records.length > 0) {
      await this.prisma.consensusRecord.createMany({ data: records });
    }

    // 3. 读取刚写入的记录（含 id/createdAt）
    const saved = await this.prisma.consensusRecord.findMany({
      where: { discussionId },
      orderBy: [{ recordType: 'asc' }, { createdAt: 'desc' }],
    });

    // 4. 构建 WS 负载并广播
    const consensusItems: ConsensusRecordItem[] = [];
    const divergenceItems: ConsensusRecordItem[] = [];

    for (const r of saved) {
      const item: ConsensusRecordItem = {
        id: r.id,
        content: r.content,
        relatedSpeechIds: JSON.parse(r.relatedSpeechIds) as string[],
        createdAt: r.createdAt.toISOString(),
      };
      if (r.recordType === 'CONSENSUS') {
        consensusItems.push(item);
      } else {
        divergenceItems.push(item);
      }
    }

    const payload: ConsensusUpdatePayload = {
      consensus: consensusItems,
      divergence: divergenceItems,
    };

    this.wsServer?.broadcastConsensusUpdate(discussionId, payload);
  }
}
