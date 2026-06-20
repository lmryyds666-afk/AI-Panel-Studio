/**
 * AI 圆桌发言调度服务
 *
 * 职责：
 *   1. 管理每场讨论的独立上下文（嘉宾阵容 + 发言历史 + 运行状态）
 *   2. 调用 DeepSeek 大模型决策下一位发言者并生成 1-2 句发言
 *   3. 自动维护嘉宾运行状态（IDLE → PREPARING → SPEAKING → IDLE）
 *   4. 发言入库 + 通过 WebSocket 实时广播
 *
 * 核心调度规则：
 *   - 拒绝机械轮流发言
 *   - 主持人控场（开场 / 追问 / 串联 / 总结）
 *   - 专家三种行为（主动回应 ANSWER / 补充 SUPPLEMENT / 反驳 COUNTER）
 *   - 每次发言 1-2 短句
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
  GuestStatusChangePayload,
  NewSpeechPayload,
  SummaryPushPayload,
  DiscussionStateChangePayload,
} from '../ws/types';

// ─── 类型定义 ────────────────────────────────────────

/** AI 调用签名（与 guest-generation.service.ts 共用同一类型） */
export type AICaller = (prompt: string) => Promise<string>;

/** 发言类型 */
export type SpeechType =
  | 'OPENING'    // 主持人开场
  | 'FOLLOW_UP'  // 主持人追问
  | 'BRIDGING'   // 主持人串联
  | 'ANSWER'     // 专家回应
  | 'SUPPLEMENT' // 专家补充
  | 'COUNTER'    // 专家反驳
  | 'SUMMARY';   // 主持人总结

/** 嘉宾运行状态 */
export type RunStatus = 'IDLE' | 'PREPARING' | 'SPEAKING';

/** 内存中的嘉宾上下文 */
export interface GuestContext {
  id: string;
  name: string;
  role: 'HOST' | 'EXPERT';
  title: string;
  stance: string;
  color: string;
  runStatus: RunStatus;
  sortOrder: number;
}

/** 内存中的发言记录 */
export interface SpeechRecord {
  id: string;
  guestId: string;
  guestName: string;
  guestTitle: string;
  guestColor: string;
  content: string;
  speechType: SpeechType;
  sequence: number;
  createdAt: string;
}

/** 单场讨论的完整上下文 */
export interface DiscussionContext {
  discussionId: string;
  topic: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  expertCount: number;
  guests: Map<string, GuestContext>;
  /** 按 sortOrder 排序的嘉宾 ID 列表 */
  guestOrder: string[];
  speeches: SpeechRecord[];
  speechCount: number;
  /** 主持人嘉宾 ID */
  hostId: string;
}

/** AI 调度决策响应 */
const scheduleResponseSchema = z.object({
  nextGuestId: z.string().min(1, 'nextGuestId 不能为空'),
  speechType: z.enum([
    'OPENING', 'FOLLOW_UP', 'BRIDGING',
    'ANSWER', 'SUPPLEMENT', 'COUNTER',
    'SUMMARY',
  ] as const, { message: 'speechType 必须是有效的发言类型' }),
  content: z
    .string()
    .min(1, '发言内容不能为空')
    .max(300, '发言内容超过 300 字符（应为 1-2 短句）'),
});

type ScheduleDecision = z.infer<typeof scheduleResponseSchema>;

/** 调度器配置 */
export interface SchedulerConfig {
  /** 最大发言轮数（达到后自动总结），默认 30 */
  maxSpeeches?: number;
  /** 上下文窗口保留的最近发言数，默认 15 */
  contextWindowSize?: number;
}

// ─── JSON 提取工具（复用 guest-generation 的逻辑）────

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
// SpeechScheduler 核心类
// ════════════════════════════════════════════════════════

export class SpeechScheduler {
  /** 活跃讨论上下文（按 discussionId 隔离） */
  private contexts = new Map<string, DiscussionContext>();
  private config: Required<SchedulerConfig>;

  constructor(
    private prisma: PrismaClient,
    private callAI: AICaller,
    private wsServer?: DiscussionWsServer,
    config?: SchedulerConfig,
  ) {
    this.config = {
      maxSpeeches: config?.maxSpeeches ?? 30,
      contextWindowSize: config?.contextWindowSize ?? 15,
    };
  }

  // ─── 公开方法 ────────────────────────────────────

  /**
   * 启动讨论，初始化上下文并生成主持人开场发言
   *
   * 仅当讨论状态为 IN_PROGRESS 且尚未初始化上下文时可调用。
   * 自动从数据库加载嘉宾阵容，生成 OPENING 发言。
   *
   * @returns 生成的开场发言记录
   */
  async startDiscussion(discussionId: string): Promise<SpeechRecord> {
    if (this.contexts.has(discussionId)) {
      throw new Error(`讨论 ${discussionId} 上下文已存在，请勿重复启动`);
    }

    // 从数据库加载讨论 + 嘉宾
    const discussion = await this.prisma.discussion.findUnique({
      where: { id: discussionId },
      include: { guests: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!discussion) {
      throw new Error(`讨论 ${discussionId} 不存在`);
    }
    if (discussion.status !== 'IN_PROGRESS') {
      throw new Error(`讨论状态为 ${discussion.status}，无法启动调度（需要 IN_PROGRESS）`);
    }

    const guests = new Map<string, GuestContext>();
    const guestOrder: string[] = [];
    let hostId = '';

    for (const g of discussion.guests) {
      const guestCtx: GuestContext = {
        id: g.id,
        name: g.name,
        role: g.role as 'HOST' | 'EXPERT',
        title: g.title,
        stance: g.stance,
        color: g.color,
        runStatus: 'IDLE',
        sortOrder: g.sortOrder,
      };
      guests.set(g.id, guestCtx);
      guestOrder.push(g.id);
      if (g.role === 'HOST') hostId = g.id;
    }

    if (!hostId) {
      throw new Error(`讨论 ${discussionId} 缺少主持人`);
    }

    // 初始化上下文
    const ctx: DiscussionContext = {
      discussionId,
      topic: discussion.topic,
      status: 'IN_PROGRESS',
      expertCount: discussion.expertCount,
      guests,
      guestOrder,
      speeches: [],
      speechCount: 0,
      hostId,
    };
    this.contexts.set(discussionId, ctx);

    // 调用 AI 生成主持人开场发言
    const prompt = this.buildOpeningPrompt(ctx);
    const rawResponse = await this.callAI(prompt);
    const decision = this.parseScheduleDecision(rawResponse, ctx);

    if (decision.speechType !== 'OPENING') {
      throw new Error(`开场发言必须是 OPENING，AI 返回了 ${decision.speechType}`);
    }
    if (decision.nextGuestId !== hostId) {
      throw new Error(`开场发言必须由主持人发表，AI 选择了 ${decision.nextGuestId}`);
    }

    const speech = await this.generateAndBroadcast(
      ctx,
      hostId,
      'OPENING',
      decision.content,
    );

    return speech;
  }

  /**
   * 调度下一轮发言
   *
   * 由 AI 分析当前讨论进展，选择最合适的下一位发言者，
   * 生成 1-2 句发言内容，写入数据库并广播。
   *
   * @returns 生成的发言记录，若讨论已达最大轮数则返回 null
   */
  async scheduleNext(discussionId: string): Promise<SpeechRecord | null> {
    const ctx = this.contexts.get(discussionId);
    if (!ctx) {
      throw new Error(`讨论 ${discussionId} 上下文未初始化，请先调用 startDiscussion`);
    }
    if (ctx.status === 'COMPLETED') {
      throw new Error(`讨论 ${discussionId} 已结束`);
    }

    // 检查是否达到最大发言数
    if (ctx.speechCount >= this.config.maxSpeeches) {
      return null;
    }

    // 构建调度 Prompt → 调用 AI → 解析决策
    const prompt = this.buildSchedulingPrompt(ctx);
    const rawResponse = await this.callAI(prompt);
    const decision = this.parseScheduleDecision(rawResponse, ctx);

    // 验证决策合法性
    this.validateDecision(decision, ctx);

    // 生成发言并广播
    const speech = await this.generateAndBroadcast(
      ctx,
      decision.nextGuestId,
      decision.speechType,
      decision.content,
    );

    return speech;
  }

  /**
   * 结束讨论，生成主持人总结
   *
   * 将讨论状态切换为 COMPLETED，生成 SUMMARY 发言，
   * 更新数据库 discussion.summary 字段并广播。
   *
   * @returns 总结发言记录
   */
  async endDiscussion(discussionId: string): Promise<SpeechRecord> {
    const ctx = this.contexts.get(discussionId);
    if (!ctx) {
      throw new Error(`讨论 ${discussionId} 上下文未初始化`);
    }
    if (ctx.status === 'COMPLETED') {
      throw new Error(`讨论 ${discussionId} 已结束`);
    }

    ctx.status = 'COMPLETED';

    // 生成主持人总结
    const prompt = this.buildSummaryPrompt(ctx);
    const rawResponse = await this.callAI(prompt);
    const decision = this.parseScheduleDecision(rawResponse, ctx);

    const speech = await this.generateAndBroadcast(
      ctx,
      ctx.hostId,
      'SUMMARY',
      decision.content,
    );

    // 写入 discussion.summary
    await this.prisma.discussion.update({
      where: { id: discussionId },
      data: { summary: decision.content },
    });

    // 广播状态变更 + 总结推送
    this.broadcastDiscussionStateChange(discussionId, 'COMPLETED', 'IN_PROGRESS');
    this.broadcastSummaryPush(discussionId, decision.content, ctx.speechCount);

    // 上下文保留（标记为 COMPLETED），供查询使用
    // 外部可通过 destroyContext 手动清理

    return speech;
  }

  // ─── 上下文查询 ──────────────────────────────────

  /** 获取活跃讨论上下文（供外部检查状态） */
  getContext(discussionId: string): DiscussionContext | undefined {
    return this.contexts.get(discussionId);
  }

  /** 获取所有活跃讨论 ID */
  getActiveDiscussions(): string[] {
    return [...this.contexts.keys()];
  }

  /** 清理指定讨论上下文（异常恢复用） */
  destroyContext(discussionId: string): void {
    this.contexts.delete(discussionId);
  }

  // ─── 私有方法：调度决策 ──────────────────────────

  /**
   * 构建开场白 Prompt
   *
   * 专门用于第一轮发言（主持人 OPENING），无需决策下一发言人。
   */
  private buildOpeningPrompt(ctx: DiscussionContext): string {
    const guestList = ctx.guestOrder
      .map((gid) => {
        const g = ctx.guests.get(gid)!;
        return `[${g.id}] ${g.name}（${g.role === 'HOST' ? '主持人' : '专家'}）— ${g.title}\n  立场：${g.stance}`;
      })
      .join('\n');

    return `你是 AI 圆桌讨论的主持人。请发表开场白。

## 讨论话题
${ctx.topic}

## 嘉宾阵容
${guestList}

## 要求
- 主持人（${ctx.hostId}）以中立视角开场
- 简要介绍话题背景，引导讨论方向
- 控制在 1-2 句，50-150 字
- 不要点评任何具体专家的观点（讨论尚未开始）

## 输出格式
严格按以下 JSON 格式输出，不要添加任何其他文字：

\`\`\`json
{
  "nextGuestId": "${ctx.hostId}",
  "speechType": "OPENING",
  "content": "开场白（1-2句，50-150字）"
}
\`\`\``;
  }

  /**
   * 构建 AI 调度决策 Prompt
   *
   * 包含讨论话题、嘉宾阵容（含立场）、近期发言历史、
   * 严格调度规则。AI 返回 JSON 格式的调度决策。
   */
  private buildSchedulingPrompt(ctx: DiscussionContext): string {
    const guestList = ctx.guestOrder
      .map((gid) => {
        const g = ctx.guests.get(gid)!;
        return `[${g.id}] ${g.name}（${g.role === 'HOST' ? '主持人' : '专家'}）— ${g.title}\n  立场：${g.stance}`;
      })
      .join('\n');

    const recentSpeeches = ctx.speeches.length > 0
      ? ctx.speeches
          .slice(-this.config.contextWindowSize)
          .map((s) => `[#${s.sequence}] ${s.guestName}（${s.speechType}）：${s.content}`)
          .join('\n\n')
      : '（尚无发言，这是第一轮讨论）';

    const isFirstSpeech = ctx.speeches.length === 0;
    const speechInstruction = isFirstSpeech
      ? '这是讨论开场，必须由主持人（hostId）发表 OPENING 开场白。'
      : `当前已进行 ${ctx.speechCount} 轮发言。请根据讨论进展，选择最合适的下一位发言者。`;

    const recentGuestIds = ctx.speeches.slice(-3).map(s => s.guestId);
    const avoidRepeat = recentGuestIds.length > 0
      ? `\n- **禁止选择最近发言的嘉宾**：${recentGuestIds.join('、')}（避免同一人连续发言）`
      : '';

    return `你是 AI 圆桌讨论的调度与发言生成引擎。你需要同时决策「下一位发言者」并生成其「发言内容」。

## 讨论话题
${ctx.topic}

## 嘉宾阵容
${guestList}

## 历史发言
${recentSpeeches}

## 调度规则
${speechInstruction}

**选择发言者规则**：
- 主持人（${ctx.hostId}）负责：开场 OPENING、追问 FOLLOW_UP、串联/转场 BRIDGING、总结 SUMMARY
- 专家负责：主动回应 ANSWER、补充他人观点 SUPPLEMENT、反驳不同观点 COUNTER
- **严禁机械轮流发言**，应根据讨论内容的逻辑需要选择发言者
- 鼓励观点碰撞：优先选择立场对立的专家进行反驳 COUNTER${avoidRepeat}
- 当讨论充分展开后（≥5 轮），主持人应适时进行串联 BRIDGING 或追问 FOLLOW_UP

**发言内容规则**：
- 每次发言严格控制在 1-2 句，50-150 字
- 内容必须符合发言者的立场和身份
- COUNTER 发言应有明确的反对论据
- SUPPLEMENT 发言应在他人观点基础上提供增量信息

## 输出格式
严格按以下 JSON 格式输出，不要添加任何其他文字：

\`\`\`json
{
  "nextGuestId": "嘉宾ID（从以上嘉宾列表中选择）",
  "speechType": "OPENING|FOLLOW_UP|BRIDGING|ANSWER|SUPPLEMENT|COUNTER",
  "content": "1-2句发言内容，50-150字"
}
\`\`\``;
  }

  /**
   * 构建总结 Prompt
   */
  private buildSummaryPrompt(ctx: DiscussionContext): string {
    const guestList = ctx.guestOrder
      .map((gid) => {
        const g = ctx.guests.get(gid)!;
        return `${g.name}（${g.role === 'HOST' ? '主持人' : '专家'}）：${g.stance}`;
      })
      .join('\n');

    const allSpeeches = ctx.speeches
      .map((s) => `[#${s.sequence}] ${s.guestName}（${s.speechType}）：${s.content}`)
      .join('\n');

    return `你是 AI 圆桌讨论的主持人。讨论即将结束，请发表总结陈词。

## 讨论话题
${ctx.topic}

## 嘉宾阵容
${guestList}

## 完整发言记录（共 ${ctx.speechCount} 条）
${allSpeeches}

## 总结要求
- 用 2-4 句话概括讨论的主要共识与核心分歧
- 指出讨论中揭示的关键盲点或未来方向
- 语气中立、凝练

## 输出格式
严格按 JSON 输出：
\`\`\`json
{
  "nextGuestId": "${ctx.hostId}",
  "speechType": "SUMMARY",
  "content": "总结内容（2-4句）"
}
\`\`\``;
  }

  /**
   * 解析 AI 调度决策
   */
  private parseScheduleDecision(raw: string, ctx: DiscussionContext): ScheduleDecision {
    let jsonStr: string;
    try {
      jsonStr = extractJSON(raw);
    } catch (err) {
      throw new Error(
        `调度 AI 输出 JSON 提取失败：${(err as Error).message}\n` +
        `原始输出前 500 字符：${raw.slice(0, 500)}`,
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw new Error(`调度 AI 返回的 JSON 格式无效：${jsonStr.slice(0, 300)}`);
    }

    const result = scheduleResponseSchema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(
        `调度 AI 响应校验失败（讨论 ${ctx.discussionId}）：\n${issues}\n` +
        `原始 JSON：${jsonStr.slice(0, 500)}`,
      );
    }

    return result.data;
  }

  /**
   * 验证调度决策的合法性
   */
  private validateDecision(decision: ScheduleDecision, ctx: DiscussionContext): void {
    const guest = ctx.guests.get(decision.nextGuestId);
    if (!guest) {
      throw new Error(
        `AI 返回的嘉宾 ID "${decision.nextGuestId}" 不在当前讨论嘉宾列表中`,
      );
    }

    // 主持人专属发言类型
    const hostSpeechTypes: SpeechType[] = ['OPENING', 'FOLLOW_UP', 'BRIDGING', 'SUMMARY'];
    const expertSpeechTypes: SpeechType[] = ['ANSWER', 'SUPPLEMENT', 'COUNTER'];

    if (guest.role === 'HOST' && expertSpeechTypes.includes(decision.speechType as any)) {
      throw new Error(
        `主持人 ${guest.name} 不能使用专家发言类型 "${decision.speechType}"`,
      );
    }

    if (guest.role === 'EXPERT' && hostSpeechTypes.includes(decision.speechType as any)) {
      throw new Error(
        `专家 ${guest.name} 不能使用主持人发言类型 "${decision.speechType}"`,
      );
    }

    // 同一嘉宾不能连续发言
    if (ctx.speeches.length > 0) {
      const lastSpeech = ctx.speeches[ctx.speeches.length - 1];
      if (lastSpeech.guestId === decision.nextGuestId) {
        throw new Error(
          `AI 返回的发言者 ${guest.name} 与上一轮相同，违反调度规则`,
        );
      }
    }
  }

  // ─── 私有方法：发言生成与广播 ────────────────────

  /**
   * 执行完整的发言生成流程：
   * 1. 更新嘉宾状态 IDLE → PREPARING（广播）
   * 2. PREPARING → SPEAKING（广播）
   * 3. 写入 Speech 表
   * 4. 更新上下文
   * 5. 广播 new_speech
   * 6. SPEAKING → IDLE（广播）
   */
  private async generateAndBroadcast(
    ctx: DiscussionContext,
    guestId: string,
    speechType: SpeechType,
    content: string,
  ): Promise<SpeechRecord> {
    const guest = ctx.guests.get(guestId);
    if (!guest) {
      throw new Error(`嘉宾 ${guestId} 不存在于讨论 ${ctx.discussionId} 中`);
    }

    // 1. IDLE → PREPARING
    this.updateGuestStatus(ctx, guest, 'PREPARING', `正在整理关于「${ctx.topic.slice(0, 30)}」的观点…`);

    // 短暂"思考延迟"后进入发言状态（MVP 简化：直接切换）
    // 2. PREPARING → SPEAKING
    this.updateGuestStatus(ctx, guest, 'SPEAKING', content.slice(0, 60));

    // 3. 写入数据库
    const sequence = ctx.speechCount + 1;
    const speech = await this.prisma.speech.create({
      data: {
        discussionId: ctx.discussionId,
        guestId: guest.id,
        content,
        speechType,
        sequence,
        isVisible: true,
      },
    });

    // 4. 更新上下文
    const speechRecord: SpeechRecord = {
      id: speech.id,
      guestId: guest.id,
      guestName: guest.name,
      guestTitle: guest.title,
      guestColor: guest.color,
      content,
      speechType,
      sequence,
      createdAt: speech.createdAt.toISOString(),
    };
    ctx.speeches.push(speechRecord);
    ctx.speechCount = sequence;

    // 5. 广播 new_speech
    this.broadcastNewSpeech(ctx.discussionId, speechRecord);

    // 6. SPEAKING → IDLE
    this.updateGuestStatus(ctx, guest, 'IDLE', '');

    return speechRecord;
  }

  /**
   * 更新嘉宾运行状态并广播 WebSocket 事件
   */
  private updateGuestStatus(
    ctx: DiscussionContext,
    guest: GuestContext,
    newStatus: RunStatus,
    publicThought: string,
  ): void {
    guest.runStatus = newStatus;

    const payload: GuestStatusChangePayload = {
      guestId: guest.id,
      runStatus: newStatus,
      publicThought,
    };

    this.wsServer?.broadcastGuestStatusChange(ctx.discussionId, payload);
  }

  // ─── 私有方法：WebSocket 广播 ────────────────────

  private broadcastNewSpeech(discussionId: string, speech: SpeechRecord): void {
    const payload: NewSpeechPayload = {
      id: speech.id,
      guestId: speech.guestId,
      guestName: speech.guestName,
      guestTitle: speech.guestTitle,
      guestColor: speech.guestColor,
      content: speech.content,
      speechType: speech.speechType,
      sequence: speech.sequence,
    };
    this.wsServer?.broadcastNewSpeech(discussionId, payload);
  }

  private broadcastDiscussionStateChange(
    discussionId: string,
    status: 'COMPLETED',
    previousStatus: 'IN_PROGRESS',
  ): void {
    const payload: DiscussionStateChangePayload = { status, previousStatus };
    this.wsServer?.broadcastDiscussionStateChange(discussionId, payload);
  }

  private broadcastSummaryPush(
    discussionId: string,
    summary: string,
    totalSpeeches: number,
  ): void {
    const payload: SummaryPushPayload = { summary, totalSpeeches };
    this.wsServer?.broadcastSummaryPush(discussionId, payload);
  }
}
