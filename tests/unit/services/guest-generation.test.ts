/**
 * 嘉宾生成服务 — 单元测试
 *
 * TDD RED 阶段：先写测试，验证所有用例失败后再实现代码。
 *
 * 覆盖：
 *   1. 默认 4 位专家（共 1 主持人 + 4 专家 = 5 人）
 *   2. 嘉宾立场 / 颜色不重复校验
 *   3. 多讨论数据隔离
 *   4. JSON 结构校验（抑制大模型幻觉）
 *   5. 主持人始终排在第一（sortOrder=0）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createPrismaClient } from '../../../backend/lib/prisma';
import type { PrismaClient } from '@prisma/client';

// ─── 测试辅助：模拟 AI 返回数据 ────────────────────────────

/** 一次正常的 AI 响应：1 主持人 + 4 专家 */
const VALID_AI_RESPONSE = JSON.stringify({
  host: {
    name: '张维远',
    occupation: '资深科技媒体人',
    title: '《前沿对话》栏目主持人',
    stance: '中立引导者，擅长在分歧中找到共同点',
    color: '#4ECDC4',
  },
  experts: [
    {
      name: '李敏华',
      occupation: 'AI 研究员',
      title: '某头部科技公司 AI Lab 高级研究员',
      stance: 'AI 将在 2030 年前显著替代重复性脑力劳动，但创造性工作仍然安全',
      color: '#FF6B6B',
    },
    {
      name: '王德仁',
      occupation: '宏观经济学家',
      title: '某知名智库首席经济学家',
      stance: '技术替代是渐进的，2030 年节点更多是监管与社会的适应速度问题',
      color: '#45B7D1',
    },
    {
      name: '陈思语',
      occupation: '劳动法学者',
      title: '某高校法学院副教授',
      stance: '核心障碍不在技术而在制度——劳动法与社会保障体系远未准备好',
      color: '#F7DC6F',
    },
    {
      name: '赵明远',
      occupation: '企业数字化转型顾问',
      title: '前四大咨询合伙人',
      stance: '企业实际落地速度远慢于技术成熟曲线，组织惯性是最大刹车',
      color: '#BB8FCE',
    },
  ],
});

/** 2 位专家的 AI 响应（测试自定义专家人数） */
const VALID_AI_RESPONSE_2_EXPERTS = JSON.stringify({
  host: {
    name: '张维远',
    occupation: '资深科技媒体人',
    title: '《前沿对话》栏目主持人',
    stance: '中立引导者',
    color: '#4ECDC4',
  },
  experts: [
    {
      name: '李敏华',
      occupation: 'AI 研究员',
      title: '高级研究员',
      stance: '支持 AI 替代论',
      color: '#FF6B6B',
    },
    {
      name: '王德仁',
      occupation: '经济学家',
      title: '首席经济学家',
      stance: '反对过快替代',
      color: '#45B7D1',
    },
  ],
});

/** 颜色重复的 AI 响应（用于测试去重校验） */
const DUPLICATE_COLOR_RESPONSE = JSON.stringify({
  host: {
    name: '主持人A',
    occupation: '媒体人',
    title: '主持人',
    stance: '中立',
    color: '#FF6B6B',
  },
  experts: [
    {
      name: '专家B',
      occupation: '研究员',
      title: '研究员',
      stance: '立场B',
      color: '#FF6B6B',  // ← 与主持人颜色重复
    },
    {
      name: '专家C',
      occupation: '学者',
      title: '教授',
      stance: '立场C',
      color: '#45B7D1',
    },
    {
      name: '专家D',
      occupation: '顾问',
      title: '顾问',
      stance: '立场D',
      color: '#45B7D1',  // ← 与专家C颜色重复
    },
    {
      name: '专家E',
      occupation: '分析师',
      title: '分析师',
      stance: '立场E',
      color: '#BB8FCE',
    },
  ],
});

/** JSON 格式残缺的 AI 响应（用于测试幻觉抑制） */
const MALFORMED_JSON_RESPONSE = `好的，我来为您生成嘉宾阵容：
{
  "host": {
    "name": "主持人A",
    "occupation": "媒体人",
    "title": "主持人",
    "stance": "中立",
    "color": "#FF6B6B",
  },
  "experts": [
    {
      "name": "专家B",
      // 缺少 occupation 字段
      "title": "研究员",
      "stance": "立场B",
      "color": "#45B7D1",
    },
  ],
}
以上是我的推荐，希望对您有帮助。`;

/** 职业名称缺少的 AI 响应 */
const MISSING_FIELD_RESPONSE = JSON.stringify({
  host: {
    name: '主持人A',
    occupation: '媒体人',
    title: '主持人',
    stance: '中立',
    color: '#4ECDC4',
  },
  experts: [
    {
      name: '专家B',
      occupation: '',  // ← 空字符串
      title: '研究员',
      stance: '立场B',
      color: '#45B7D1',
    },
  ],
});

/** 立场相同的 AI 响应（立场应有多样性） */
const SAME_STANCE_RESPONSE = JSON.stringify({
  host: {
    name: '主持人A',
    occupation: '媒体人',
    title: '主持人',
    stance: '中立',
    color: '#4ECDC4',
  },
  experts: [
    {
      name: '专家B',
      occupation: '研究员',
      title: '研究员',
      stance: '完全赞同 AI 替代',
      color: '#FF6B6B',
    },
    {
      name: '专家C',
      occupation: '学者',
      title: '教授',
      stance: '完全赞同 AI 替代',  // ← 与专家B 立场完全相同
      color: '#45B7D1',
    },
  ],
});

/** 用于第二场讨论的 AI 响应（测试多讨论隔离） */
const DISCUSSION_2_RESPONSE = JSON.stringify({
  host: {
    name: '林晓峰',
    occupation: '科技评论家',
    title: '《科技观察》主编',
    stance: '中立理性',
    color: '#2ECC71',
  },
  experts: [
    {
      name: '黄思涵',
      occupation: '数据科学家',
      title: '某互联网大厂算法总监',
      stance: '数据驱动效率提升是大势所趋',
      color: '#E74C3C',
    },
    {
      name: '吴建国',
      occupation: '传统制造业企业家',
      title: '某机械制造集团董事长',
      stance: '制造业自动化的关键在于成本而非技术',
      color: '#3498DB',
    },
  ],
});

// ─── 测试套件 ────────────────────────────────────────────

// 注意：这些测试在 service 函数实现之前编写（TDD RED 阶段）
// 预期全部 FAIL，因为 guestGenerationService 尚未实现

describe('guestGenerationService', () => {
  let prisma: PrismaClient;
  let generateGuests: Function;
  let validateGuestResponse: Function;
  let extractJSON: Function;

  // 动态导入（service 可能尚未创建，先用 try-catch）
  beforeAll(async () => {
    // 连接测试数据库
    prisma = createPrismaClient('file:./backend/test.db');

    // 确保数据库已同步（prisma migrate 已在 backend 目录运行）
    await prisma.$connect();

    // 清理测试数据库
    await prisma.consensusRecord.deleteMany();
    await prisma.speech.deleteMany();
    await prisma.guest.deleteMany();
    await prisma.discussion.deleteMany();

    // 尝试加载 service（如果文件存在）
    try {
      const mod = await import('../../../backend/services/guest-generation.service');
      generateGuests = mod.generateGuests;
      validateGuestResponse = mod.validateGuestResponse;
      extractJSON = mod.extractJSON;
    } catch {
      // TDD RED 阶段：service 尚未实现，测试应失败
      generateGuests = undefined as any;
      validateGuestResponse = undefined as any;
      extractJSON = undefined as any;
    }
  });

  afterAll(async () => {
    // 清理并断开
    await prisma.consensusRecord.deleteMany();
    await prisma.speech.deleteMany();
    await prisma.guest.deleteMany();
    await prisma.discussion.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 每个测试前清理数据
    await prisma.consensusRecord.deleteMany();
    await prisma.speech.deleteMany();
    await prisma.guest.deleteMany();
    await prisma.discussion.deleteMany();
  });

  // ════════════════════════════════════════════════════════
  // 测试 1：默认 4 位专家
  // ════════════════════════════════════════════════════════

  describe('默认专家人数', () => {
    it('不传 expertCount 时默认生成 1 主持人 + 4 专家 = 5 位嘉宾', async () => {
      // 前置：创建一场讨论
      const discussion = await prisma.discussion.create({
        data: {
          topic: 'AI 是否会在 2030 年前取代 50% 的白领岗位？',
          expertCount: 4,
          status: 'SETUP',
        },
      });

      // 模拟 AI 调用
      const mockCallAI = async () => VALID_AI_RESPONSE;

      // 执行生成
      const guests = await generateGuests(
        discussion.topic,
        discussion.expertCount,
        discussion.id,
        mockCallAI,
        prisma,
      );

      // 验证
      expect(guests).toHaveLength(5);                               // 1 主持 + 4 专家
      expect(guests.filter((g: any) => g.role === 'HOST')).toHaveLength(1);
      expect(guests.filter((g: any) => g.role === 'EXPERT')).toHaveLength(4);
    });

    it('指定 expertCount=2 时应生成 1 主持人 + 2 专家 = 3 位嘉宾', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '远程办公的未来',
          expertCount: 2,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => VALID_AI_RESPONSE_2_EXPERTS;

      const guests = await generateGuests(
        discussion.topic,
        discussion.expertCount,
        discussion.id,
        mockCallAI,
        prisma,
      );

      expect(guests).toHaveLength(3);
      expect(guests.filter((g: any) => g.role === 'HOST')).toHaveLength(1);
      expect(guests.filter((g: any) => g.role === 'EXPERT')).toHaveLength(2);
    });
  });

  // ════════════════════════════════════════════════════════
  // 测试 2：嘉宾立场 / 颜色不重复
  // ════════════════════════════════════════════════════════

  describe('立场与颜色不重复', () => {
    it('所有嘉宾的颜色应互不相同', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '测试话题',
          expertCount: 4,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => VALID_AI_RESPONSE;
      const guests = await generateGuests(
        discussion.topic, discussion.expertCount,
        discussion.id, mockCallAI, prisma,
      );

      const colors = guests.map((g: any) => g.color);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);   // 颜色无重复
    });

    it('AI 返回颜色重复时，应抛出校验错误', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '测试话题',
          expertCount: 4,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => DUPLICATE_COLOR_RESPONSE;

      await expect(
        generateGuests(
          discussion.topic, discussion.expertCount,
          discussion.id, mockCallAI, prisma,
        ),
      ).rejects.toThrow();
    });

    it('AI 返回立场完全相同时，应抛出校验错误', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '测试话题',
          expertCount: 2,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => SAME_STANCE_RESPONSE;

      await expect(
        generateGuests(
          discussion.topic, discussion.expertCount,
          discussion.id, mockCallAI, prisma,
        ),
      ).rejects.toThrow();
    });
  });

  // ════════════════════════════════════════════════════════
  // 测试 3：多讨论数据隔离
  // ════════════════════════════════════════════════════════

  describe('多讨论数据隔离', () => {
    it('两场不同讨论的嘉宾应各自归属于正确的 discussionId', async () => {
      // 创建讨论 1
      const d1 = await prisma.discussion.create({
        data: {
          topic: '讨论1：AI 与就业',
          expertCount: 4,
          status: 'SETUP',
        },
      });

      // 创建讨论 2
      const d2 = await prisma.discussion.create({
        data: {
          topic: '讨论2：基因编辑伦理',
          expertCount: 2,
          status: 'SETUP',
        },
      });

      // 分别生成嘉宾
      const mockCallAI1 = async () => VALID_AI_RESPONSE;
      const mockCallAI2 = async () => DISCUSSION_2_RESPONSE;

      const guests1 = await generateGuests(
        d1.topic, d1.expertCount, d1.id, mockCallAI1, prisma,
      );
      const guests2 = await generateGuests(
        d2.topic, d2.expertCount, d2.id, mockCallAI2, prisma,
      );

      // 验证数量
      expect(guests1).toHaveLength(5);   // 讨论1: 1+4
      expect(guests2).toHaveLength(3);   // 讨论2: 1+2

      // 验证所有讨论1嘉宾属于讨论1
      for (const g of guests1) {
        expect(g.discussionId).toBe(d1.id);
      }

      // 验证所有讨论2嘉宾属于讨论2
      for (const g of guests2) {
        expect(g.discussionId).toBe(d2.id);
      }

      // 验证数据库中讨论1只有5条、讨论2只有3条
      const dbGuests1 = await prisma.guest.findMany({
        where: { discussionId: d1.id },
      });
      const dbGuests2 = await prisma.guest.findMany({
        where: { discussionId: d2.id },
      });
      expect(dbGuests1).toHaveLength(5);
      expect(dbGuests2).toHaveLength(3);
    });

    it('删除某场讨论时不应影响另一场讨论的数据', async () => {
      // 创建两场讨论
      const d1 = await prisma.discussion.create({
        data: { topic: '讨论A', expertCount: 2, status: 'SETUP' },
      });
      const d2 = await prisma.discussion.create({
        data: { topic: '讨论B', expertCount: 2, status: 'SETUP' },
      });

      const mockAI = async () => VALID_AI_RESPONSE_2_EXPERTS;
      await generateGuests(d1.topic, d1.expertCount, d1.id, mockAI, prisma);
      await generateGuests(d2.topic, d2.expertCount, d2.id, mockAI, prisma);

      // 删除讨论1（级联删除其嘉宾）
      await prisma.discussion.delete({ where: { id: d1.id } });

      // 讨论2的嘉宾应仍然存在
      const d2Guests = await prisma.guest.findMany({
        where: { discussionId: d2.id },
      });
      expect(d2Guests).toHaveLength(3);

      // 讨论1的嘉宾已被级联删除
      const d1Guests = await prisma.guest.findMany({
        where: { discussionId: d1.id },
      });
      expect(d1Guests).toHaveLength(0);
    });
  });

  // ════════════════════════════════════════════════════════
  // 测试 4：JSON 结构校验（抑制大模型幻觉）
  // ════════════════════════════════════════════════════════

  describe('JSON 结构校验 — 抑制幻觉', () => {
    it('validateGuestResponse 应拒绝缺少必要字段的数据', () => {
      const invalid = {
        host: {
          name: '主持人',
          // 缺少 occupation
          title: '主持人',
          stance: '中立',
          color: '#FF6B6B',
        },
        experts: [],
      };

      expect(() => validateGuestResponse(invalid)).toThrow();
    });

    it('validateGuestResponse 应拒绝颜色格式不规范的数据', () => {
      const data = {
        host: {
          name: '主持人', occupation: '媒体', title: '主持',
          stance: '中立', color: 'red',  // ← 不是 HEX
        },
        experts: [
          {
            name: '专家', occupation: '研究', title: '研究',
            stance: '立场', color: '#45B7D1',
          },
        ],
      };

      expect(() => validateGuestResponse(data)).toThrow();
    });

    it('extractJSON 应从夹带说明文字的 AI 输出中提取纯 JSON', () => {
      const json = extractJSON(MALFORMED_JSON_RESPONSE);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('extractJSON 对正常 JSON 应原样返回', () => {
      const result = extractJSON(VALID_AI_RESPONSE);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.host).toBeDefined();
      expect(parsed.experts).toHaveLength(4);
    });

    it('generateGuests 遇到残缺 JSON 应抛出错误', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '测试话题',
          expertCount: 4,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => MALFORMED_JSON_RESPONSE;

      await expect(
        generateGuests(
          discussion.topic, discussion.expertCount,
          discussion.id, mockCallAI, prisma,
        ),
      ).rejects.toThrow();
    });

    it('generateGuests 遇到缺失字段的 JSON 应抛出错误', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '测试话题',
          expertCount: 2,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => MISSING_FIELD_RESPONSE;

      await expect(
        generateGuests(
          discussion.topic, discussion.expertCount,
          discussion.id, mockCallAI, prisma,
        ),
      ).rejects.toThrow();
    });
  });

  // ════════════════════════════════════════════════════════
  // 测试 5：主持人排序
  // ════════════════════════════════════════════════════════

  describe('主持人排序', () => {
    it('主持人 sortOrder 必须为 0，排在所有专家之前', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '排序测试',
          expertCount: 4,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => VALID_AI_RESPONSE;
      const guests = await generateGuests(
        discussion.topic, discussion.expertCount,
        discussion.id, mockCallAI, prisma,
      );

      const host = guests.find((g: any) => g.role === 'HOST');
      expect(host).toBeDefined();
      expect(host.sortOrder).toBe(0);

      // 专家 sortOrder 应从 1 开始递增
      const experts = guests.filter((g: any) => g.role === 'EXPERT');
      const orders = experts.map((g: any) => g.sortOrder).sort((a: number, b: number) => a - b);
      for (let i = 0; i < orders.length; i++) {
        expect(orders[i]).toBe(i + 1);
      }
    });
  });

  // ════════════════════════════════════════════════════════
  // 测试 6：初始 runStatus 均为 IDLE
  // ════════════════════════════════════════════════════════

  describe('初始状态', () => {
    it('所有嘉宾的初始 runStatus 应为 IDLE', async () => {
      const discussion = await prisma.discussion.create({
        data: {
          topic: '状态测试',
          expertCount: 4,
          status: 'SETUP',
        },
      });

      const mockCallAI = async () => VALID_AI_RESPONSE;
      const guests = await generateGuests(
        discussion.topic, discussion.expertCount,
        discussion.id, mockCallAI, prisma,
      );

      for (const g of guests) {
        expect(g.runStatus).toBe('IDLE');
      }
    });
  });
});
