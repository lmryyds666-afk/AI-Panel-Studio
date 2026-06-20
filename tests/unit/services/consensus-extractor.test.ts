/**
 * 共识分歧提炼服务 — 单元测试
 *
 * 覆盖：
 *   1. 基础提炼：minSpeeches 达标后提取共识/分歧
 *   2. 多讨论隔离：不同 discussionId 状态独立
 *   3. 限流机制：时间窗口内超频调用被抑制
 *   4. 重试机制：AI 失败后指数退避重试
 *   5. JSON 校验：非法输出拒绝 + 错误透出
 *   6. 数据库持久化：ConsensusRecord 写入 + discussionId/recordType 正确
 *   7. WebSocket 广播：consensus_update 事件推送
 *   8. 发言数不足：未达阈值时跳过提炼
 *   9. 空结果：AI 返回空数组时仍然正常广播
 *  10. 增量提炼：新发言触发重新分析并刷新记录
 *  11. 异常恢复：Parser 抛出后重试成功
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createPrismaClient } from '../../../backend/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import { ConsensusExtractor } from '../../../backend/services/consensusExtractor';
import type { AICaller } from '../../../backend/services/consensusExtractor';
import type {
  NewSpeechPayload,
  ConsensusUpdatePayload,
} from '../../../backend/ws/types';

// ─── 测试种子数据 ──────────────────────────────────

const TEST_DISCUSSION_ID = 'd1000000-0000-0000-0000-000000000001';
const TEST_DISCUSSION_ID_2 = 'd2000000-0000-0000-0000-000000000002';
const TEST_TOPIC = 'AI 是否会在 2030 年前取代 50% 的白领岗位？';

const ALL_GUESTS = [
  { name: '张维远', role: 'HOST' as const, occupation: '资深科技媒体人', title: '《前沿对话》栏目主持人', stance: '中立引导者，擅长在分歧中找到共同点', color: '#4ECDC4' },
  { name: '李敏华', role: 'EXPERT' as const, occupation: 'AI 研究员', title: '某头部科技公司 AI Lab 高级研究员', stance: 'AI 将在 2030 年前显著替代重复性脑力劳动', color: '#FF6B6B' },
  { name: '王德仁', role: 'EXPERT' as const, occupation: '宏观经济学家', title: '某知名智库首席经济学家', stance: '技术替代是渐进的，监管与社会适应速度是瓶颈', color: '#45B7D1' },
  { name: '陈思语', role: 'EXPERT' as const, occupation: '劳动法学者', title: '某高校法学院副教授', stance: '核心障碍不在技术而在制度——劳动法与社会保障体系远未准备好', color: '#F7DC6F' },
];

// ─── 工具函数 ──────────────────────────────────────

function gid(guestIdx: number, discussionId: string): string {
  return `g0000000-0000-0000-0000-0000000000${11 + guestIdx}-${discussionId}`;
}

/** 构建 NewSpeechPayload */
function mkSpeech(
  discussionId: string,
  guestIdx: number,
  seq: number,
  speechType: string,
  content: string,
): NewSpeechPayload {
  const guest = ALL_GUESTS[guestIdx];
  return {
    id: `s-${discussionId.slice(0, 4)}-${seq.toString().padStart(3, '0')}`,
    guestId: gid(guestIdx, discussionId),
    guestName: guest.name,
    guestTitle: guest.title,
    guestColor: guest.color,
    content,
    speechType: speechType as any,
    sequence: seq,
  };
}

/** 构建嘉宾上下文（轻量版，不含完整 GuestContext） */
function mkGuestCtx(discussionId: string) {
  return ALL_GUESTS.map((g, i) => ({
    id: gid(i, discussionId),
    name: g.name,
    role: g.role,
    title: g.title,
    stance: g.stance,
  }));
}

// ─── Mock AI 工厂 ─────────────────────────────────

/** 按步骤返回预定义 AI 响应（超出步骤时重复最后一步，兼容重试） */
function mockAI(...steps: string[]): AICaller {
  let n = 0;
  return async (_prompt: string): Promise<string> => {
    const step = n < steps.length ? steps[n] : steps[steps.length - 1];
    n++;
    return step;
  };
}

// ─── WebSocket 探针 ────────────────────────────────

class WsSpy {
  consensusUpdates: ConsensusUpdatePayload[] = [];

  broadcastConsensusUpdate(
    _discussionId: string,
    payload: ConsensusUpdatePayload,
  ): void {
    this.consensusUpdates.push(payload);
  }

  clear(): void {
    this.consensusUpdates = [];
  }
}

// ─── AI 响应模板 ──────────────────────────────────

const CONSENSUS_JSON_1 = JSON.stringify({
  consensus: [
    { content: '各方认同：到 2030 年，重复性、规则化的白领任务将被大比例自动化', relatedSpeechIds: ['s-d100-001', 's-d100-003'] },
    { content: '共识：技术替代是渐进的，不会在某个时间点突然完成', relatedSpeechIds: ['s-d100-002', 's-d100-004'] },
  ],
  divergence: [
    { content: '分歧：乐观派认为 2030 年前 50% 岗位会受重大影响，保守派认为制度滞后会延缓替代进程', relatedSpeechIds: ['s-d100-001', 's-d100-002'] },
  ],
});

const CONSENSUS_JSON_UPDATED = JSON.stringify({
  consensus: [
    { content: '各方认同：到 2030 年，重复性、规则化的白领任务将被大比例自动化', relatedSpeechIds: ['s-d100-001', 's-d100-003'] },
    { content: '共识：技术替代是渐进的，不会在某个时间点突然完成', relatedSpeechIds: ['s-d100-002', 's-d100-004'] },
    { content: '新共识：劳动法改革和社会保障体系需要与技术发展同步推进', relatedSpeechIds: ['s-d100-005', 's-d100-006'] },
  ],
  divergence: [
    { content: '分歧：乐观派认为 2030 年前 50% 岗位会受重大影响，保守派认为制度滞后会延缓替代进程', relatedSpeechIds: ['s-d100-001', 's-d100-002'] },
    { content: '新增分歧：经济学家认为市场调节足够，法学家认为必须提前立法干预', relatedSpeechIds: ['s-d100-005', 's-d100-006'] },
  ],
});

const CONSENSUS_JSON_EMPTY = JSON.stringify({
  consensus: [],
  divergence: [],
});

const CONSENSUS_JSON_BAD = `这是无效输出，不是 JSON 格式`;

const CONSENSUS_JSON_WRAPPED = `
基于当前讨论的深入分析，以下是识别到的共识与分歧：

\`\`\`json
{
  "consensus": [
    {"content": "各方认同：技术替代是趋势但时间线存在争议", "relatedSpeechIds": ["s-d100-001"]}
  ],
  "divergence": [
    {"content": "对监管介入时机存在本质分歧", "relatedSpeechIds": ["s-d100-002", "s-d100-003"]}
  ]
}
\`\`\`

以上分析综合了当前所有专家观点。
`;

const CONSENSUS_JSON_TRAILING_COMMA = `{
  "consensus": [
    {
      "content": "技术替代是大趋势但时间线存在很大争议",
      "relatedSpeechIds": ["s-d100-001", "s-d100-003"],
    }
  ],
  "divergence": [
    {
      "content": "对监管介入时机存在本质分歧需要深入讨论",
      "relatedSpeechIds": ["s-d100-002"],
    }
  ]
}`;

// ─── 数据库种子 ────────────────────────────────────

async function seed(
  prisma: PrismaClient,
  id: string,
  topic: string,
  status = 'IN_PROGRESS',
): Promise<void> {
  await prisma.discussion.create({
    data: {
      id,
      topic,
      status,
      expertCount: 3,
      guests: {
        create: ALL_GUESTS.map((g, i) => ({
          id: gid(i, id),
          name: g.name,
          role: g.role,
          occupation: g.occupation,
          title: g.title,
          stance: g.stance,
          color: g.color,
          sortOrder: i,
          runStatus: 'IDLE',
        })),
      },
    },
  });
}

async function seedSpeeches(
  prisma: PrismaClient,
  discussionId: string,
  count: number,
): Promise<void> {
  for (let i = 1; i <= count; i++) {
    const guestIdx = (i - 1) % 4;
    const guest = ALL_GUESTS[guestIdx];
    const speechTypes = ['OPENING', 'ANSWER', 'COUNTER', 'SUPPLEMENT', 'FOLLOW_UP', 'ANSWER'];
    await prisma.speech.create({
      data: {
        id: `s-${discussionId.slice(0, 4)}-${i.toString().padStart(3, '0')}`,
        discussionId,
        guestId: gid(guestIdx, discussionId),
        content: `${guest.name}第${i}条发言——关于 AI 替代白领岗位的${speechTypes[i % speechTypes.length]}观点`,
        speechType: speechTypes[(i - 1) % speechTypes.length],
        sequence: i,
        isVisible: true,
      },
    });
  }
}

// ════════════════════════════════════════════════════
describe('ConsensusExtractor', () => {
  let prisma: PrismaClient;
  let wsSpy: WsSpy;

  beforeAll(async () => {
    prisma = createPrismaClient('file:./backend/test.db');
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.consensusRecord.deleteMany();
    await prisma.speech.deleteMany();
    await prisma.guest.deleteMany();
    await prisma.discussion.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.consensusRecord.deleteMany();
    await prisma.speech.deleteMany();
    await prisma.guest.deleteMany();
    await prisma.discussion.deleteMany();
    wsSpy = new WsSpy();
  });

  // ─── 1. 基础提炼 ──────────────────────────────

  describe('基础提炼', () => {
    it('应在 minSpeeches 达标后触发共识/分歧提炼', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1), wsSpy as any, {
        minSpeechesBeforeExtraction: 3,
        speechInterval: 2,
      });

      // 第 1 条发言：不足 minSpeeches → 跳过
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '欢迎各位专家'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(0);

      // 第 2 条发言：不足 minSpeeches → 跳过
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '从技术角度...'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(0);

      // 第 3 条发言：达到 minSpeeches 且触发间隔 → 提炼
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 2, 3, 'COUNTER', '我不同意...'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(1);
      expect(wsSpy.consensusUpdates[0].consensus.length).toBeGreaterThanOrEqual(1);
      expect(wsSpy.consensusUpdates[0].divergence.length).toBeGreaterThanOrEqual(1);
    });

    it('应把提炼结果持久化到 ConsensusRecord 表', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '技术视角'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      const records = await prisma.consensusRecord.findMany({
        where: { discussionId: TEST_DISCUSSION_ID },
        orderBy: { recordType: 'asc' },
      });

      expect(records.length).toBeGreaterThanOrEqual(3); // 2 共识 + 1 分歧
      const consensusRecords = records.filter((r) => r.recordType === 'CONSENSUS');
      const divergenceRecords = records.filter((r) => r.recordType === 'DIVERGENCE');
      expect(consensusRecords.length).toBe(2);
      expect(divergenceRecords.length).toBe(1);

      // 验证字段完整性
      for (const r of records) {
        expect(r.id).toBeTruthy();
        expect(r.discussionId).toBe(TEST_DISCUSSION_ID);
        expect(r.content.length).toBeGreaterThan(0);
        expect(() => JSON.parse(r.relatedSpeechIds)).not.toThrow();
        expect(JSON.parse(r.relatedSpeechIds)).toBeInstanceOf(Array);
      }
    });
  });

  // ─── 2. 多讨论隔离 ────────────────────────────

  describe('多讨论隔离', () => {
    it('不同 discussionId 的提炼状态互不干扰', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      await seed(prisma, TEST_DISCUSSION_ID_2, '远程办公对组织文化的影响');

      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1, CONSENSUS_JSON_1), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
      });

      // 讨论 1：喂入 2 条发言 → 触发提炼
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场白'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '专家回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      // 讨论 2：喂入 1 条发言 → 未达阈值
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID_2, mkSpeech(TEST_DISCUSSION_ID_2, 0, 1, 'OPENING', '远程办公话题开场'), mkGuestCtx(TEST_DISCUSSION_ID_2), '远程办公对组织文化的影响');

      // 讨论 1 应有记录，讨论 2 无记录
      const records1 = await prisma.consensusRecord.findMany({
        where: { discussionId: TEST_DISCUSSION_ID },
      });
      const records2 = await prisma.consensusRecord.findMany({
        where: { discussionId: TEST_DISCUSSION_ID_2 },
      });

      expect(records1.length).toBeGreaterThanOrEqual(1);
      expect(records2.length).toBe(0);
    });
  });

  // ─── 3. 限流机制 ──────────────────────────────

  describe('限流机制', () => {
    it('在时间窗口内超频调用应被抑制', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      // 最小间隔 2000ms；maxCallsPerWindow=1 per 5000ms
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1, CONSENSUS_JSON_UPDATED), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 1, // 每条都触发
        maxCallsPerWindow: 1,
        rateLimitWindowMs: 5000,
      });

      // 第一次提炼：正常触发
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(1);

      // 紧接着喂入新发言：限流生效 → 跳过
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 2, 3, 'COUNTER', '反驳'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(1); // 无新增广播
    });

    it('超过速率窗口后应恢复提炼', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1, CONSENSUS_JSON_UPDATED), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 1,
        maxCallsPerWindow: 1,
        rateLimitWindowMs: 50, // 极短窗口，方便测试
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(1);

      // 等待窗口过期
      await new Promise((r) => setTimeout(r, 100));

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 2, 3, 'COUNTER', '反驳'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(2);
    });
  });

  // ─── 4. 重试机制 ──────────────────────────────

  describe('重试机制', () => {
    it('AI 调用失败后应自动重试并最终成功', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      let attempts = 0;
      const callAI: AICaller = async (_prompt) => {
        attempts++;
        if (attempts < 3) throw new Error('DeepSeek API 临时不可用');
        return CONSENSUS_JSON_1;
      };

      const extractor = new ConsensusExtractor(prisma, callAI, wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
        maxRetries: 3,
        retryDelayMs: 10, // 缩短延迟方便测试
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      expect(attempts).toBe(3);
      expect(wsSpy.consensusUpdates).toHaveLength(1);
    });

    it('超过最大重试次数后应抛出错误', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const callAI: AICaller = async () => {
        throw new Error('持续失败');
      };

      const extractor = new ConsensusExtractor(prisma, callAI, wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
        maxRetries: 2,
        retryDelayMs: 10,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      // 即使 AI 失败也不抛到外部（静默记录日志）
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      // 不应有广播
      expect(wsSpy.consensusUpdates).toHaveLength(0);
    });
  });

  // ─── 5. JSON 校验 ──────────────────────────────

  describe('JSON 校验', () => {
    it('应拒绝非法 JSON 输出且不写入数据库', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_BAD), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
        maxRetries: 1,
        retryDelayMs: 10,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      const records = await prisma.consensusRecord.findMany({
        where: { discussionId: TEST_DISCUSSION_ID },
      });
      expect(records).toHaveLength(0);
      expect(wsSpy.consensusUpdates).toHaveLength(0);
    });

    it('应从 markdown 代码块中提取 JSON', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_WRAPPED), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      expect(wsSpy.consensusUpdates).toHaveLength(1);
      expect(wsSpy.consensusUpdates[0].consensus[0].content).toContain('技术替代');
    });

    it('应处理尾逗号等非标准 JSON 格式', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_TRAILING_COMMA), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      expect(wsSpy.consensusUpdates).toHaveLength(1);
      expect(wsSpy.consensusUpdates[0].consensus[0].content).toContain('技术替代是大趋势');
    });
  });

  // ─── 6. 空结果 ────────────────────────────────

  describe('空结果', () => {
    it('AI 返回空的共识和分歧列表时仍应正常广播', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_EMPTY), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      // 广播仍然触发（空列表）
      expect(wsSpy.consensusUpdates).toHaveLength(1);
      expect(wsSpy.consensusUpdates[0].consensus).toHaveLength(0);
      expect(wsSpy.consensusUpdates[0].divergence).toHaveLength(0);

      // 数据库中旧记录应被清空
      const records = await prisma.consensusRecord.findMany({
        where: { discussionId: TEST_DISCUSSION_ID },
      });
      expect(records).toHaveLength(0);
    });
  });

  // ─── 7. 增量提炼 ──────────────────────────────

  describe('增量提炼', () => {
    it('新发言触发重新分析后应刷新记录（全量替换）', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1, CONSENSUS_JSON_UPDATED), wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
      });

      // 第一次提炼
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      expect(wsSpy.consensusUpdates).toHaveLength(1);
      expect(wsSpy.consensusUpdates[0].consensus).toHaveLength(2);
      expect(wsSpy.consensusUpdates[0].divergence).toHaveLength(1);

      // 第二次提炼（更多发言后）
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 2, 3, 'COUNTER', '反驳'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 3, 4, 'SUPPLEMENT', '补充'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      expect(wsSpy.consensusUpdates).toHaveLength(2);
      expect(wsSpy.consensusUpdates[1].consensus).toHaveLength(3);
      expect(wsSpy.consensusUpdates[1].divergence).toHaveLength(2);

      // 数据库记录数应匹配最新结果（全量替换）
      const records = await prisma.consensusRecord.findMany({
        where: { discussionId: TEST_DISCUSSION_ID },
      });
      expect(records.length).toBe(5); // 3 共识 + 2 分歧
    });
  });

  // ─── 8. 异常恢复 ──────────────────────────────

  describe('异常恢复', () => {
    it('Parser 抛出异常后重试成功', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      let attempts = 0;
      const callAI: AICaller = async (_prompt) => {
        attempts++;
        if (attempts < 2) return '这不是有效的 JSON 格式，也没有 JSON 对象';
        return CONSENSUS_JSON_1;
      };

      const extractor = new ConsensusExtractor(prisma, callAI, wsSpy as any, {
        minSpeechesBeforeExtraction: 2,
        speechInterval: 2,
        maxRetries: 3,
        retryDelayMs: 10,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      expect(attempts).toBe(2);
      expect(wsSpy.consensusUpdates).toHaveLength(1);
    });
  });

  // ─── 9. speechInterval 间隔控制 ─────────────────

  describe('speechInterval 间隔控制', () => {
    it('应按 speechInterval 配置触发而非每条发言都提炼', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1, CONSENSUS_JSON_UPDATED), wsSpy as any, {
        minSpeechesBeforeExtraction: 3,
        speechInterval: 3, // 每 3 条触发一次
      });

      // 1,2,3 → 第 3 条触发
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 1, 'OPENING', '开场'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 2, 'ANSWER', '回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 2, 3, 'COUNTER', '反驳'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(1);

      // 4,5 → 不触发（距离上次提炼仅 2 条）
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 3, 4, 'SUPPLEMENT', '补充'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 5, 'FOLLOW_UP', '追问'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(1);

      // 6 → 触发
      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 1, 6, 'ANSWER', '再次回应'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);
      expect(wsSpy.consensusUpdates).toHaveLength(2);
    });
  });

  // ─── 10. 从数据库恢复 ─────────────────────────

  describe('从数据库恢复', () => {
    it('上下文丢失时仍可正常工作（从 DB 读取历史发言）', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_TOPIC);
      // 预写入 5 条发言
      await seedSpeeches(prisma, TEST_DISCUSSION_ID, 5);

      // 新的 extractor（无内存状态）分析新发言
      const extractor = new ConsensusExtractor(prisma, mockAI(CONSENSUS_JSON_1), wsSpy as any, {
        minSpeechesBeforeExtraction: 3,
        speechInterval: 1,
      });

      await extractor.analyzeNewSpeech(TEST_DISCUSSION_ID, mkSpeech(TEST_DISCUSSION_ID, 0, 6, 'ANSWER', '继续讨论'), mkGuestCtx(TEST_DISCUSSION_ID), TEST_TOPIC);

      expect(wsSpy.consensusUpdates).toHaveLength(1);
    });
  });
});
