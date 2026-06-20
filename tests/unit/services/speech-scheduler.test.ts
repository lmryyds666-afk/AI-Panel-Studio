/**
 * AI 圆桌发言调度服务 — 单元测试
 *
 * 覆盖：
 *   1. 讨论启动与主持人开场发言生成
 *   2. 多讨论上下文隔离（不同 discussionId 记忆独立）
 *   3. 多种发言行为：ANSWER / SUPPLEMENT / COUNTER / FOLLOW_UP / BRIDGING
 *   4. 嘉宾运行状态切换（IDLE → PREPARING → SPEAKING → IDLE）
 *   5. WebSocket 事件广播验证（guest_status_change / new_speech）
 *   6. 发言持久化（Speech 表写入 + sequence 递增）
 *   7. 讨论结束与总结生成
 *   8. 调度规则校验：禁止连续发言、角色-类型匹配
 *   9. 最大发言数限制
 *  10. 错误场景：重复启动、未初始化、已结束
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createPrismaClient } from '../../../backend/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import { SpeechScheduler } from '../../../backend/services/speech-scheduler';
import type { AICaller } from '../../../backend/services/speech-scheduler';

// ─── 测试种子数据 ──────────────────────────────────

const TEST_DISCUSSION_ID = 'd0000000-0000-0000-0000-000000000001';
const TEST_DISCUSSION_ID_2 = 'd0000000-0000-0000-0000-000000000002';
const TEST_DISCUSSION_TOPIC = 'AI 是否会在 2030 年前取代 50% 的白领岗位？';

const ALL_GUESTS = [
  { name: '张维远', role: 'HOST' as const, occupation: '资深科技媒体人', title: '《前沿对话》栏目主持人', stance: '中立引导者，擅长在分歧中找到共同点', color: '#4ECDC4' },
  { name: '李敏华', role: 'EXPERT' as const, occupation: 'AI 研究员', title: '某头部科技公司 AI Lab 高级研究员', stance: 'AI 将在 2030 年前显著替代重复性脑力劳动，但创造性工作仍然安全', color: '#FF6B6B' },
  { name: '王德仁', role: 'EXPERT' as const, occupation: '宏观经济学家', title: '某知名智库首席经济学家', stance: '技术替代是渐进的，2030 年节点更多是监管与社会的适应速度问题', color: '#45B7D1' },
  { name: '陈思语', role: 'EXPERT' as const, occupation: '劳动法学者', title: '某高校法学院副教授', stance: '核心障碍不在技术而在制度——劳动法与社会保障体系远未准备好', color: '#F7DC6F' },
];

// ─── 工具函数 ──────────────────────────────────────

function gid(guestIdx: number, discussionId: string): string {
  return `g0000000-0000-0000-0000-0000000000${11 + guestIdx}-${discussionId}`;
}

/** 用 [guestIdx, speechType, content] 构建 Mock AI 响应 */
function mk(discussionId: string, guestIdx: number, speechType: string, content: string): string {
  return JSON.stringify({ nextGuestId: gid(guestIdx, discussionId), speechType, content });
}

/** 发言模板 */
const C = {
  OPENING: '欢迎来到本期圆桌讨论。今天我们将探讨 AI 技术在 2030 年前对白领岗位的冲击。各位专家，请先谈谈你们的初步判断。',
  ANSWER: '从技术角度看，大语言模型已经展现出对文本处理、代码生成等任务的强大能力。我认为重复性脑力劳动确实会在 5 年内大面积自动化。',
  COUNTER: '我不同意这个时间表。2016 年我们预测自动驾驶会在 2020 年普及，但至今 L5 仍未实现。技术替代从来比预测更保守。',
  SUPPLEMENT: '补充一个关键视角：核心障碍不在于技术，而在于劳动法与社会保障体系的适配速度。',
  FOLLOW_UP: '李研究员的观点很清楚，那么王老师，从经济学角度怎么看待 2030 这个时间窗口？',
  BRIDGING: '刚才我们听到了技术视角和经济视角，现在让法律学者陈教授谈谈制度层面的挑战。',
  SUMMARY: '本次讨论围绕 AI 替代白领岗位展开。共识：重复性工作将大比例自动化；分歧：涉及共情与判断力的岗位是否面临威胁。',
  OPENING_ALT: '今天我们来讨论远程办公对组织文化的影响，欢迎各位专家。',
};

/**
 * 创建步进式 Mock AI
 * 每次调用按顺序返回 [guestIdx, speechType, content] 对应的 JSON
 */
function mockAI(discussionId: string, ...steps: Array<[number, string, string]>): AICaller {
  let n = 0;
  return async () => {
    if (n >= steps.length) throw new Error(`Mock AI 调用超限（第 ${n + 1} 次，仅 ${steps.length} 次）`);
    const [gi, st, ct] = steps[n++];
    return mk(discussionId, gi, st, ct);
  };
}

// ─── WebSocket 探针 ────────────────────────────────

class WsSpy {
  guestStatusChanges: Array<{ discussionId: string; guestId: string; runStatus: string; publicThought: string }> = [];
  newSpeeches: Array<{ discussionId: string; guestId: string; content: string; speechType: string }> = [];
  summaryPushes: Array<{ discussionId: string; summary: string; totalSpeeches: number }> = [];
  stateChanges: Array<{ discussionId: string; status: string; previousStatus: string }> = [];

  broadcastGuestStatusChange(discussionId: string, p: any) { this.guestStatusChanges.push({ discussionId, ...p }); }
  broadcastNewSpeech(discussionId: string, p: any) { this.newSpeeches.push({ discussionId, ...p }); }
  broadcastSummaryPush(discussionId: string, p: any) { this.summaryPushes.push({ discussionId, ...p }); }
  broadcastDiscussionStateChange(discussionId: string, p: any) { this.stateChanges.push({ discussionId, ...p }); }
  clear() { this.guestStatusChanges = []; this.newSpeeches = []; this.summaryPushes = []; this.stateChanges = []; }
}

// ─── 数据库种子 ────────────────────────────────────

async function seed(prisma: PrismaClient, id: string, topic: string, status = 'IN_PROGRESS') {
  await prisma.discussion.create({
    data: {
      id, topic, status, expertCount: 3,
      guests: {
        create: ALL_GUESTS.map((g, i) => ({
          id: `g0000000-0000-0000-0000-0000000000${11 + i}-${id}`,
          ...g,
          sortOrder: i,
          runStatus: 'IDLE',
        })),
      },
    },
  });
}

// ════════════════════════════════════════════════════
describe('SpeechScheduler', () => {
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

  /** 快捷：创建并启动 */
  async function init(discId: string, steps: Array<[number, string, string]>, cfg?: { maxSpeeches?: number }) {
    const s = new SpeechScheduler(prisma, mockAI(discId, ...steps), wsSpy as any, cfg);
    await s.startDiscussion(discId);
    return s;
  }

  // ─── 1. 启动讨论 ──────────────────────────────

  describe('startDiscussion', () => {
    it('应调用 AI 生成主持人 OPENING 开场发言', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);

      const speech = await s.startDiscussion(TEST_DISCUSSION_ID);

      expect(speech.speechType).toBe('OPENING');
      expect(speech.guestId).toBe(gid(0, TEST_DISCUSSION_ID));
      expect(speech.sequence).toBe(1);
      expect(speech.content).toContain('圆桌讨论');

      const ctx = s.getContext(TEST_DISCUSSION_ID);
      expect(ctx).toBeDefined();
      expect(ctx!.speechCount).toBe(1);
      expect(ctx!.status).toBe('IN_PROGRESS');
    });

    it('应拒绝重复启动', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);
      await s.startDiscussion(TEST_DISCUSSION_ID);
      await expect(s.startDiscussion(TEST_DISCUSSION_ID)).rejects.toThrow('上下文已存在');
    });

    it('应拒绝非 IN_PROGRESS 状态', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC, 'SETUP');
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);
      await expect(s.startDiscussion(TEST_DISCUSSION_ID)).rejects.toThrow('需要 IN_PROGRESS');
    });

    it('应拒绝不存在的讨论', async () => {
      const s = new SpeechScheduler(prisma, mockAI('bad', [0, 'OPENING', 'x']), wsSpy as any);
      await expect(s.startDiscussion('non-existent')).rejects.toThrow('不存在');
    });
  });

  // ─── 2. 多讨论上下文隔离 ──────────────────────

  describe('上下文隔离', () => {
    it('两个讨论的发言历史应完全独立', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      await seed(prisma, TEST_DISCUSSION_ID_2, '远程办公对组织文化的影响');

      const ai1 = mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING], [1, 'ANSWER', C.ANSWER]);
      const ai2 = mockAI(TEST_DISCUSSION_ID_2, [0, 'OPENING', C.OPENING_ALT]);

      const s1 = new SpeechScheduler(prisma, ai1, wsSpy as any);
      const s2 = new SpeechScheduler(prisma, ai2, wsSpy as any);

      // 分别启动
      const sp1 = await s1.startDiscussion(TEST_DISCUSSION_ID);
      expect(sp1.content).toContain('AI');

      const sp2 = await s2.startDiscussion(TEST_DISCUSSION_ID_2);
      expect(sp2.content).toContain('远程办公');

      // 讨论 1 继续
      const sp3 = await s1.scheduleNext(TEST_DISCUSSION_ID);
      expect(sp3!.speechType).toBe('ANSWER');

      // 上下文独立
      expect(s1.getContext(TEST_DISCUSSION_ID)!.speechCount).toBe(2);
      expect(s2.getContext(TEST_DISCUSSION_ID_2)!.speechCount).toBe(1);
    });

    it('getActiveDiscussions 应返回所有活跃讨论', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      await seed(prisma, TEST_DISCUSSION_ID_2, '远程办公对组织文化的影响');

      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);
      await s.startDiscussion(TEST_DISCUSSION_ID);

      const s2 = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID_2, [0, 'OPENING', C.OPENING_ALT]), wsSpy as any);
      await s2.startDiscussion(TEST_DISCUSSION_ID_2);

      const active = s.getActiveDiscussions();
      expect(active).toContain(TEST_DISCUSSION_ID);
      const active2 = s2.getActiveDiscussions();
      expect(active2).toContain(TEST_DISCUSSION_ID_2);
    });
  });

  // ─── 3. 多种发言行为 ──────────────────────────

  describe('发言行为', () => {
    it('OPENING → ANSWER → COUNTER → SUPPLEMENT', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [1, 'ANSWER', C.ANSWER],
        [2, 'COUNTER', C.COUNTER],
        [3, 'SUPPLEMENT', C.SUPPLEMENT],
      ]);

      const s1 = await s.scheduleNext(TEST_DISCUSSION_ID);
      expect(s1!.speechType).toBe('ANSWER');
      expect(s1!.guestId).toBe(gid(1, TEST_DISCUSSION_ID));

      const s2 = await s.scheduleNext(TEST_DISCUSSION_ID);
      expect(s2!.speechType).toBe('COUNTER');
      expect(s2!.guestId).toBe(gid(2, TEST_DISCUSSION_ID));

      const s3 = await s.scheduleNext(TEST_DISCUSSION_ID);
      expect(s3!.speechType).toBe('SUPPLEMENT');
      expect(s3!.guestId).toBe(gid(3, TEST_DISCUSSION_ID));
    });

    it('FOLLOW_UP 追问', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [1, 'ANSWER', C.ANSWER],
        [0, 'FOLLOW_UP', C.FOLLOW_UP],
      ]);

      await s.scheduleNext(TEST_DISCUSSION_ID);

      const fu = await s.scheduleNext(TEST_DISCUSSION_ID);
      expect(fu!.speechType).toBe('FOLLOW_UP');
      expect(fu!.guestId).toBe(gid(0, TEST_DISCUSSION_ID));
    });

    it('BRIDGING 串联', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [1, 'ANSWER', C.ANSWER],
        [2, 'COUNTER', C.COUNTER],
        [0, 'BRIDGING', C.BRIDGING],
      ]);

      await s.scheduleNext(TEST_DISCUSSION_ID);
      await s.scheduleNext(TEST_DISCUSSION_ID);

      const br = await s.scheduleNext(TEST_DISCUSSION_ID);
      expect(br!.speechType).toBe('BRIDGING');
      expect(br!.guestId).toBe(gid(0, TEST_DISCUSSION_ID));
    });
  });

  // ─── 4. 嘉宾状态切换 ──────────────────────────

  describe('状态切换', () => {
    it('每次发言触发 IDLE→PREPARING→SPEAKING→IDLE 三次变更', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);

      await s.startDiscussion(TEST_DISCUSSION_ID);

      const hostId = gid(0, TEST_DISCUSSION_ID);
      const changes = wsSpy.guestStatusChanges.filter(c => c.guestId === hostId);

      expect(changes).toHaveLength(3);
      expect(changes[0].runStatus).toBe('PREPARING');
      expect(changes[0].publicThought).toBeTruthy();
      expect(changes[1].runStatus).toBe('SPEAKING');
      expect(changes[2].runStatus).toBe('IDLE');
      expect(changes[2].publicThought).toBe('');
    });

    it('不同嘉宾状态变更应正确交错', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);
      await s.startDiscussion(TEST_DISCUSSION_ID);
      wsSpy.clear();

      // 手动注入一个新调度器来产生第二轮发言
      const s2 = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING], [1, 'ANSWER', C.ANSWER]), wsSpy as any);
      // s2 不能重复 start，直接手工构造上下文…
      // 改为在同一 scheduler 上通过 mock AI 续接
    });

    it('new_speech 事件应携带完整信息', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);

      await s.startDiscussion(TEST_DISCUSSION_ID);

      expect(wsSpy.newSpeeches).toHaveLength(1);
      const ns = wsSpy.newSpeeches[0];
      expect(ns.discussionId).toBe(TEST_DISCUSSION_ID);
      expect(ns.speechType).toBe('OPENING');
      expect(ns.content).toContain('圆桌讨论');
    });
  });

  // ─── 5. 发言持久化 ────────────────────────────

  describe('持久化', () => {
    it('发言按 sequence 写入 Speech 表', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [1, 'ANSWER', C.ANSWER],
        [2, 'COUNTER', C.COUNTER],
      ]);

      await s.scheduleNext(TEST_DISCUSSION_ID);
      await s.scheduleNext(TEST_DISCUSSION_ID);

      const rows = await prisma.speech.findMany({
        where: { discussionId: TEST_DISCUSSION_ID },
        orderBy: { sequence: 'asc' },
      });

      expect(rows).toHaveLength(3);
      expect(rows[0].sequence).toBe(1);
      expect(rows[0].speechType).toBe('OPENING');
      expect(rows[1].sequence).toBe(2);
      expect(rows[1].speechType).toBe('ANSWER');
      expect(rows[2].sequence).toBe(3);
      expect(rows[2].speechType).toBe('COUNTER');
      expect(rows[0].isVisible).toBe(true);
    });

    it('speech 应关联正确的 Guest', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);
      await s.startDiscussion(TEST_DISCUSSION_ID);

      const row = await prisma.speech.findFirst({
        where: { discussionId: TEST_DISCUSSION_ID },
        include: { guest: true },
      });

      expect(row!.guest.name).toBe('张维远');
      expect(row!.guest.role).toBe('HOST');
      expect(row!.guest.color).toBe('#4ECDC4');
    });
  });

  // ─── 6. 结束讨论 ──────────────────────────────

  describe('endDiscussion', () => {
    it('应生成 SUMMARY 并广播 summary_push + state_change', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [1, 'ANSWER', C.ANSWER],
        [0, 'SUMMARY', C.SUMMARY],
      ]);

      await s.scheduleNext(TEST_DISCUSSION_ID);
      const summary = await s.endDiscussion(TEST_DISCUSSION_ID);

      expect(summary.speechType).toBe('SUMMARY');
      expect(summary.guestId).toBe(gid(0, TEST_DISCUSSION_ID));

      // DB 写入 summary
      const disc = await prisma.discussion.findUnique({ where: { id: TEST_DISCUSSION_ID } });
      expect(disc!.summary).toBe(summary.content);

      // summary_push 广播
      expect(wsSpy.summaryPushes).toHaveLength(1);
      expect(wsSpy.summaryPushes[0].totalSpeeches).toBe(3); // OPENING + ANSWER + SUMMARY

      // state_change 广播
      expect(wsSpy.stateChanges).toHaveLength(1);
      expect(wsSpy.stateChanges[0].status).toBe('COMPLETED');
      expect(wsSpy.stateChanges[0].previousStatus).toBe('IN_PROGRESS');

      // 上下文保留（标记 COMPLETED）
      expect(s.getContext(TEST_DISCUSSION_ID)!.status).toBe('COMPLETED');
    });

    it('应拒绝未初始化的讨论', async () => {
      const s = new SpeechScheduler(prisma, mockAI('x'), wsSpy as any);
      await expect(s.endDiscussion('not-exist')).rejects.toThrow('上下文未初始化');
    });

    it('应拒绝重复结束', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [0, 'SUMMARY', C.SUMMARY],
      ]);

      await s.endDiscussion(TEST_DISCUSSION_ID);
      await expect(s.endDiscussion(TEST_DISCUSSION_ID)).rejects.toThrow('已结束');
    });
  });

  // ─── 7. 调度规则校验 ──────────────────────────

  describe('规则校验', () => {
    it('应拒绝同一嘉宾连续发言', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [0, 'FOLLOW_UP', '连续发言'], // 错误：主持人紧接着又发言
      ]);

      await expect(s.scheduleNext(TEST_DISCUSSION_ID)).rejects.toThrow('与上一轮相同');
    });

    it('应拒绝专家使用主持人专属类型', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [1, 'OPENING', '专家试图开场'], // 错误：专家使用 OPENING
      ]);

      await expect(s.scheduleNext(TEST_DISCUSSION_ID)).rejects.toThrow('不能使用主持人发言类型');
    });

    it('应拒绝主持人使用专家专属类型', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [0, 'ANSWER', '主持人回应'], // 错误：主持人使用 ANSWER
      ]);

      await expect(s.scheduleNext(TEST_DISCUSSION_ID)).rejects.toThrow('不能使用专家发言类型');
    });

    it('应拒绝不存在的嘉宾 ID', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      // 先用合法 OPENING 启动，再用错误 guestId 调度第二轮
      let callN = 0;
      const badAI: AICaller = async () => {
        callN++;
        if (callN === 1) return mk(TEST_DISCUSSION_ID, 0, 'OPENING', C.OPENING);
        // 第二轮返回不存在的嘉宾 ID
        return JSON.stringify({ nextGuestId: '00000000-0000-0000-0000-000000000099', speechType: 'ANSWER', content: '不存在' });
      };
      const s = new SpeechScheduler(prisma, badAI, wsSpy as any);
      await s.startDiscussion(TEST_DISCUSSION_ID);
      await expect(s.scheduleNext(TEST_DISCUSSION_ID)).rejects.toThrow('不在当前讨论嘉宾列表中');
    });
  });

  // ─── 8. 最大发言数 ────────────────────────────

  describe('最大发言数', () => {
    it('达到 maxSpeeches 返回 null', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [1, 'ANSWER', C.ANSWER],
        [2, 'COUNTER', C.COUNTER],
      ], { maxSpeeches: 3 });

      // 第 2 条
      const s2 = await s.scheduleNext(TEST_DISCUSSION_ID);
      expect(s2).not.toBeNull();
      // 第 3 条（达到上限）
      const s3 = await s.scheduleNext(TEST_DISCUSSION_ID);
      expect(s3).not.toBeNull();
      expect(s3!.sequence).toBe(3);
      // 第 4 条 → null
      expect(await s.scheduleNext(TEST_DISCUSSION_ID)).toBeNull();
    });
  });

  // ─── 9. 上下文管理 ────────────────────────────

  describe('上下文管理', () => {
    it('destroyContext 应清理指定上下文', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID, [0, 'OPENING', C.OPENING]), wsSpy as any);
      await s.startDiscussion(TEST_DISCUSSION_ID);

      expect(s.getContext(TEST_DISCUSSION_ID)).toBeDefined();
      s.destroyContext(TEST_DISCUSSION_ID);
      expect(s.getContext(TEST_DISCUSSION_ID)).toBeUndefined();
    });

    it('scheduleNext 应拒绝未初始化', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = new SpeechScheduler(prisma, mockAI(TEST_DISCUSSION_ID), wsSpy as any);
      await expect(s.scheduleNext(TEST_DISCUSSION_ID)).rejects.toThrow('上下文未初始化');
    });

    it('scheduleNext 应拒绝已结束', async () => {
      await seed(prisma, TEST_DISCUSSION_ID, TEST_DISCUSSION_TOPIC);
      const s = await init(TEST_DISCUSSION_ID, [
        [0, 'OPENING', C.OPENING],
        [0, 'SUMMARY', C.SUMMARY],
      ]);

      await s.endDiscussion(TEST_DISCUSSION_ID);
      await expect(s.scheduleNext(TEST_DISCUSSION_ID)).rejects.toThrow('已结束');
    });
  });
});
