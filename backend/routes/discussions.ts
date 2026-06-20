/**
 * 讨论 REST 路由
 *
 * 所有路由挂载在 /api 前缀下：
 *   POST   /discussions                         — 创建讨论
 *   GET    /discussions                         — 获取列表
 *   GET    /discussions/:id                     — 获取详情
 *   POST   /discussions/:id/generate-guests     — 生成嘉宾
 *   POST   /discussions/:id/confirm-guests      — 确认嘉宾
 *   POST   /discussions/:id/end                 — 结束讨论
 */
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { validate } from '../middleware/validate';
import {
  createDiscussionSchema,
  listDiscussionsSchema,
  discussionIdParamsSchema,
} from '../schemas/discussion.schema';
import { createDiscussionController } from '../controllers/discussions';

/**
 * 创建讨论路由
 *
 * @param prisma - Prisma 客户端（依赖注入，便于测试）
 */
export function createDiscussionRouter(prisma: PrismaClient): Router {
  const router = Router();
  const ctrl = createDiscussionController(prisma);

  // POST /discussions — 创建讨论
  router.post(
    '/discussions',
    validate(createDiscussionSchema, 'body'),
    ctrl.create,
  );

  // GET /discussions — 获取列表
  router.get(
    '/discussions',
    validate(listDiscussionsSchema, 'query'),
    ctrl.list,
  );

  // GET /discussions/:id — 获取详情
  router.get(
    '/discussions/:id',
    validate(discussionIdParamsSchema, 'params'),
    ctrl.getDetail,
  );

  // POST /discussions/:id/generate-guests — 生成嘉宾
  router.post(
    '/discussions/:id/generate-guests',
    validate(discussionIdParamsSchema, 'params'),
    ctrl.generateGuests,
  );

  // POST /discussions/:id/confirm-guests — 确认嘉宾
  router.post(
    '/discussions/:id/confirm-guests',
    validate(discussionIdParamsSchema, 'params'),
    ctrl.confirmGuests,
  );

  // POST /discussions/:id/end — 结束讨论
  router.post(
    '/discussions/:id/end',
    validate(discussionIdParamsSchema, 'params'),
    ctrl.endDiscussion,
  );

  return router;
}
