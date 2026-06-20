/**
 * 讨论 REST API — 路由 + 控制器集成测试
 *
 * TDD RED 阶段：先写测试，覆盖 6 个 REST 端点。
 * 使用 supertest 对 Express 应用发起真实 HTTP 请求。
 *
 * 覆盖：
 *   1. POST /api/discussions — 创建讨论
 *   2. GET  /api/discussions — 获取列表（含筛选/分页）
 *   3. GET  /api/discussions/:id — 获取详情
 *   4. POST /api/discussions/:id/generate-guests — 生成嘉宾
 *   5. POST /api/discussions/:id/confirm-guests — 确认嘉宾
 *   6. POST /api/discussions/:id/end — 结束讨论
 *   + 错误场景：404/409/400
 */
import {
  describe, it, expect, beforeAll, afterAll, beforeEach,
} from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createPrismaClient } from '../../../backend/lib/prisma';
import type { PrismaClient } from '@prisma/client';

// ─── 动态导入（路由尚未实现，RED 阶段会失败）─────────

let createDiscussionRouter: Function;
let errorHandler: Function;

beforeAll(async () => {
  try {
    const routeMod = await import('../../../backend/routes/discussions');
    createDiscussionRouter = routeMod.createDiscussionRouter;
  } catch {
    createDiscussionRouter = undefined as any;
  }
  try {
    const errMod = await import('../../../backend/middleware/error-handler');
    errorHandler = errMod.errorHandler;
  } catch {
    errorHandler = undefined as any;
  }
});

// ─── 测试 App 工厂 ──────────────────────────────────

function createTestApp(prisma: PrismaClient) {
  const app = express();
  app.use(express.json());

  if (createDiscussionRouter) {
    app.use('/api', createDiscussionRouter(prisma));
  }

  if (errorHandler) {
    app.use(errorHandler);
  }

  return app;
}

// ════════════════════════════════════════════════════
// 测试套件
// ════════════════════════════════════════════════════

describe('Discussion REST API', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof express>;

  beforeAll(async () => {
    prisma = createPrismaClient('file:./backend/test.db');
    await prisma.$connect();
    app = createTestApp(prisma);
  });

  afterAll(async () => {
    // 清理测试数据
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
  });

  // ══════════════════════════════════════════════════
  // 1. 创建讨论
  // ══════════════════════════════════════════════════

  describe('POST /api/discussions — 创建讨论', () => {
    it('正确请求应返回 201，同时返回标准化响应格式', async () => {
      const res = await request(app)
        .post('/api/discussions')
        .send({ topic: 'AI 与未来就业', expertCount: 4 })
        .expect(201);

      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.topic).toBe('AI 与未来就业');
      expect(res.body.data.status).toBe('SETUP');
      expect(res.body.data.expertCount).toBe(4);
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('不传 expertCount 应默认使用 4', async () => {
      const res = await request(app)
        .post('/api/discussions')
        .send({ topic: '远程办公的未来' })
        .expect(201);

      expect(res.body.data.expertCount).toBe(4);
    });

    it('topic 为空应返回 400', async () => {
      const res = await request(app)
        .post('/api/discussions')
        .send({ topic: '' })
        .expect(400);

      expect(res.body.code).toBe(400);
      expect(res.body.data).toBeNull();
    });

    it('缺少 topic 字段应返回 400', async () => {
      const res = await request(app)
        .post('/api/discussions')
        .send({ expertCount: 4 })
        .expect(400);

      expect(res.body.code).toBe(400);
    });

    it('topic 超过 200 字符应返回 400', async () => {
      const res = await request(app)
        .post('/api/discussions')
        .send({ topic: 'A'.repeat(201), expertCount: 4 })
        .expect(400);

      expect(res.body.code).toBe(400);
    });

    it('expertCount < 2 应返回 400', async () => {
      const res = await request(app)
        .post('/api/discussions')
        .send({ topic: '测试', expertCount: 1 })
        .expect(400);

      expect(res.body.code).toBe(400);
    });

    it('expertCount > 8 应返回 400', async () => {
      const res = await request(app)
        .post('/api/discussions')
        .send({ topic: '测试', expertCount: 9 })
        .expect(400);

      expect(res.body.code).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════
  // 2. 获取讨论列表
  // ══════════════════════════════════════════════════

  describe('GET /api/discussions — 获取列表', () => {
    it('空列表应返回 items=[] 且 total=0', async () => {
      const res = await request(app)
        .get('/api/discussions')
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('应返回所有讨论，默认分页参数生效', async () => {
      // 创建 3 个讨论
      await prisma.discussion.createMany({
        data: [
          { topic: '话题 A', expertCount: 4, status: 'SETUP' },
          { topic: '话题 B', expertCount: 2, status: 'SETUP' },
          { topic: '话题 C', expertCount: 3, status: 'IN_PROGRESS' },
        ],
      });

      const res = await request(app)
        .get('/api/discussions')
        .expect(200);

      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(20);
    });

    it('按 status 筛选应正确过滤', async () => {
      await prisma.discussion.createMany({
        data: [
          { topic: '话题 A', status: 'SETUP' },
          { topic: '话题 B', status: 'IN_PROGRESS' },
          { topic: '话题 C', status: 'SETUP' },
        ],
      });

      const res = await request(app)
        .get('/api/discussions?status=SETUP')
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      for (const item of res.body.data.items) {
        expect(item.status).toBe('SETUP');
      }
    });

    it('无效 status 值应返回 400', async () => {
      const res = await request(app)
        .get('/api/discussions?status=INVALID')
        .expect(400);

      expect(res.body.code).toBe(400);
    });

    it('列表应按 updatedAt 降序排列', async () => {
      const d1 = await prisma.discussion.create({
        data: { topic: '旧话题', status: 'SETUP' },
      });
      // 稍后创建第二个
      const d2 = await prisma.discussion.create({
        data: { topic: '新话题', status: 'SETUP' },
      });

      const res = await request(app)
        .get('/api/discussions')
        .expect(200);

      expect(res.body.data.items[0].id).toBe(d2.id);
      expect(res.body.data.items[1].id).toBe(d1.id);
    });

    it('guestCount 应反映实际嘉宾人数', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '有嘉宾的讨论', status: 'SETUP' },
      });
      // 创建 3 位嘉宾
      await prisma.guest.createMany({
        data: [
          { discussionId: disc.id, name: '嘉宾A', role: 'HOST', occupation: '主持', title: '主持', stance: '中立', color: '#FF6B6B', sortOrder: 0 },
          { discussionId: disc.id, name: '嘉宾B', role: 'EXPERT', occupation: '专家', title: '专家', stance: '立场B', color: '#45B7D1', sortOrder: 1 },
          { discussionId: disc.id, name: '嘉宾C', role: 'EXPERT', occupation: '专家', title: '专家', stance: '立场C', color: '#F7DC6F', sortOrder: 2 },
        ],
      });

      const res = await request(app)
        .get('/api/discussions')
        .expect(200);

      const item = res.body.data.items.find((i: any) => i.id === disc.id);
      expect(item.guestCount).toBe(3);
    });
  });

  // ══════════════════════════════════════════════════
  // 3. 获取讨论详情
  // ══════════════════════════════════════════════════

  describe('GET /api/discussions/:id — 获取详情', () => {
    it('存在时应返回完整讨论信息含嘉宾列表', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '详细讨论', expertCount: 2, status: 'SETUP' },
      });
      await prisma.guest.create({
        data: {
          discussionId: disc.id, name: '主持人', role: 'HOST',
          occupation: '媒体人', title: '主持', stance: '中立',
          color: '#4ECDC4', sortOrder: 0,
        },
      });

      const res = await request(app)
        .get(`/api/discussions/${disc.id}`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(disc.id);
      expect(res.body.data.topic).toBe('详细讨论');
      expect(res.body.data.guests).toHaveLength(1);
      expect(res.body.data.speechCount).toBe(0);
      expect(res.body.data.consensusCount).toBe(0);
      expect(res.body.data.divergenceCount).toBe(0);
    });

    it('不存在的 discussion_id 应返回 404', async () => {
      const res = await request(app)
        .get('/api/discussions/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.code).toBe(404);
      expect(res.body.data).toBeNull();
    });

    it('非 UUID 格式 id 应返回 400', async () => {
      const res = await request(app)
        .get('/api/discussions/not-a-uuid')
        .expect(400);

      expect(res.body.code).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════
  // 4. 生成嘉宾
  // ══════════════════════════════════════════════════

  describe('POST /api/discussions/:id/generate-guests — 生成嘉宾', () => {
    it('SETUP 状态的讨论应能生成嘉宾（需要 DEEPSEEK_API_KEY）', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: 'AI 与就业', expertCount: 2, status: 'SETUP' },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/generate-guests`)
        .send();

      // 有 API Key → 200；无 Key → 500，但响应格式应符合规范
      if (res.status === 200) {
        expect(res.body.code).toBe(0);
        expect(res.body.data.discussionId).toBe(disc.id);
        expect(res.body.data.guests).toBeDefined();
        expect(Array.isArray(res.body.data.guests)).toBe(true);
      } else {
        expect(res.status).toBe(500);
        expect(res.body.code).toBe(500);
        expect(res.body.message).toBeDefined();
        expect(res.body.message).toContain('嘉宾生成失败');
      }
    });

    it('COMPLETED 状态应返回 409', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '已结束', expertCount: 2, status: 'COMPLETED' },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/generate-guests`)
        .send()
        .expect(409);

      expect(res.body.code).toBe(409);
    });

    it('IN_PROGRESS 状态应返回 409', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '进行中', expertCount: 2, status: 'IN_PROGRESS' },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/generate-guests`)
        .send()
        .expect(409);

      expect(res.body.code).toBe(409);
    });

    it('不存在的讨论应返回 404', async () => {
      const res = await request(app)
        .post('/api/discussions/00000000-0000-0000-0000-000000000000/generate-guests')
        .send()
        .expect(404);

      expect(res.body.code).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════
  // 5. 确认嘉宾
  // ══════════════════════════════════════════════════

  describe('POST /api/discussions/:id/confirm-guests — 确认嘉宾', () => {
    it('SETUP 状态且有嘉宾时应切换到 IN_PROGRESS', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '确认测试', expertCount: 2, status: 'SETUP' },
      });
      // 必须有至少 2 位嘉宾
      await prisma.guest.createMany({
        data: [
          { discussionId: disc.id, name: '主持人', role: 'HOST', occupation: '媒体', title: '主持', stance: '中立', color: '#4ECDC4', sortOrder: 0 },
          { discussionId: disc.id, name: '专家A', role: 'EXPERT', occupation: '研究', title: '研究员', stance: '乐观', color: '#FF6B6B', sortOrder: 1 },
          { discussionId: disc.id, name: '专家B', role: 'EXPERT', occupation: '经济', title: '经济学家', stance: '悲观', color: '#45B7D1', sortOrder: 2 },
        ],
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/confirm-guests`)
        .send()
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('IN_PROGRESS');

      // 验证数据库已更新
      const updated = await prisma.discussion.findUnique({ where: { id: disc.id } });
      expect(updated?.status).toBe('IN_PROGRESS');
    });

    it('嘉宾不足 2 人时应返回 409', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '无嘉宾', expertCount: 2, status: 'SETUP' },
      });
      // 仅 1 位嘉宾
      await prisma.guest.create({
        data: { discussionId: disc.id, name: '主持人', role: 'HOST', occupation: '媒体', title: '主持', stance: '中立', color: '#4ECDC4', sortOrder: 0 },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/confirm-guests`)
        .send()
        .expect(409);

      expect(res.body.code).toBe(409);
    });

    it('COMPLETED 状态应返回 409', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '已结束', expertCount: 2, status: 'COMPLETED' },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/confirm-guests`)
        .send()
        .expect(409);

      expect(res.body.code).toBe(409);
    });
  });

  // ══════════════════════════════════════════════════
  // 6. 结束讨论
  // ══════════════════════════════════════════════════

  describe('POST /api/discussions/:id/end — 结束讨论', () => {
    it('IN_PROGRESS 状态应能结束讨论', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '结束测试', expertCount: 2, status: 'IN_PROGRESS' },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/end`)
        .send()
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('COMPLETED');

      // 验证数据库已更新
      const updated = await prisma.discussion.findUnique({ where: { id: disc.id } });
      expect(updated?.status).toBe('COMPLETED');
    });

    it('SETUP 状态应返回 409', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '未开始', expertCount: 2, status: 'SETUP' },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/end`)
        .send()
        .expect(409);

      expect(res.body.code).toBe(409);
    });

    it('已 COMPLETED 状态应返回 409', async () => {
      const disc = await prisma.discussion.create({
        data: { topic: '已结束', expertCount: 2, status: 'COMPLETED' },
      });

      const res = await request(app)
        .post(`/api/discussions/${disc.id}/end`)
        .send()
        .expect(409);

      expect(res.body.code).toBe(409);
    });

    it('不存在的讨论应返回 404', async () => {
      const res = await request(app)
        .post('/api/discussions/00000000-0000-0000-0000-000000000000/end')
        .send()
        .expect(404);

      expect(res.body.code).toBe(404);
    });
  });
});
