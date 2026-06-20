/**
 * 讨论控制器
 *
 * 每个函数对应一个 REST 端点，负责：
 *   1. 从 req 中提取已校验的参数
 *   2. 调用业务 service 或直接操作数据库
 *   3. 返回标准化 JSON 响应
 *   4. 异常通过 throw 交由 errorHandler 中间件处理
 */
import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../types/errors';

/**
 * 标准化成功响应
 */
function success<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    code: 0,
    data,
    message: 'ok',
  });
}

/**
 * 创建讨论控制器工厂
 *
 * 通过闭包注入 PrismaClient，便于测试时替换为测试数据库。
 */
export function createDiscussionController(prisma: PrismaClient) {
  // ══════════════════════════════════════════════════
  // 1. 创建讨论
  // ══════════════════════════════════════════════════

  async function create(req: Request, res: Response, _next: NextFunction) {
    const { topic, expertCount } = req.body;

    const discussion = await prisma.discussion.create({
      data: {
        topic,
        expertCount,
        status: 'SETUP',
      },
    });

    success(res, {
      id: discussion.id,
      topic: discussion.topic,
      status: discussion.status,
      expertCount: discussion.expertCount,
      createdAt: discussion.createdAt.toISOString(),
      updatedAt: discussion.updatedAt.toISOString(),
    }, 201);
  }

  // ══════════════════════════════════════════════════
  // 2. 获取讨论列表
  // ══════════════════════════════════════════════════

  async function list(req: Request, res: Response, _next: NextFunction) {
    const { status, page, pageSize } = req.query as any;

    const where: Record<string, string> = {};
    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      prisma.discussion.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { guests: true },
          },
        },
      }),
      prisma.discussion.count({ where }),
    ]);

    success(res, {
      items: items.map((d) => ({
        id: d.id,
        topic: d.topic,
        status: d.status,
        expertCount: d.expertCount,
        guestCount: d._count.guests,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  }

  // ══════════════════════════════════════════════════
  // 3. 获取讨论详情
  // ══════════════════════════════════════════════════

  async function getDetail(req: Request, res: Response, _next: NextFunction) {
    const { id } = req.params;

    const discussion = await prisma.discussion.findUnique({
      where: { id },
      include: {
        guests: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            speeches: true,
            consensusRecords: true,
          },
        },
      },
    });

    if (!discussion) {
      throw new AppError('讨论不存在', 404);
    }

    // 分别统计共识与分歧数量
    const consensusCount = await prisma.consensusRecord.count({
      where: { discussionId: id, recordType: 'CONSENSUS' },
    });
    const divergenceCount = await prisma.consensusRecord.count({
      where: { discussionId: id, recordType: 'DIVERGENCE' },
    });

    success(res, {
      id: discussion.id,
      topic: discussion.topic,
      status: discussion.status,
      expertCount: discussion.expertCount,
      summary: discussion.summary,
      guests: discussion.guests.map((g) => ({
        id: g.id,
        name: g.name,
        role: g.role,
        occupation: g.occupation,
        title: g.title,
        stance: g.stance,
        color: g.color,
        runStatus: g.runStatus,
        sortOrder: g.sortOrder,
      })),
      speechCount: discussion._count.speeches,
      consensusCount,
      divergenceCount,
      createdAt: discussion.createdAt.toISOString(),
      updatedAt: discussion.updatedAt.toISOString(),
    });
  }

  // ══════════════════════════════════════════════════
  // 4. 生成嘉宾
  // ══════════════════════════════════════════════════

  async function generateGuests(req: Request, res: Response, _next: NextFunction) {
    const { id } = req.params;

    // 查找讨论（校验存在性与状态）
    const discussion = await prisma.discussion.findUnique({ where: { id } });
    if (!discussion) {
      throw new AppError('讨论不存在', 404);
    }
    if (discussion.status !== 'SETUP') {
      throw new AppError(
        `当前讨论状态为 ${discussion.status}，不允许生成嘉宾`,
        409,
      );
    }

    // 动态导入 guest-generation service 和 DeepSeek caller
    const { generateGuests: generateGuestsService } = await import(
      '../services/guest-generation.service'
    );
    const { createDeepSeekCaller } = await import(
      '../services/guest-generation.service'
    );

    let guests;
    try {
      const callAI = createDeepSeekCaller();
      guests = await generateGuestsService(
        discussion.topic,
        discussion.expertCount,
        id,
        callAI,
        prisma,
      );
    } catch (err) {
      // AI 调用失败 → 500
      throw new AppError(
        `嘉宾生成失败：${(err as Error).message}`,
        500,
      );
    }

    success(res, {
      discussionId: id,
      guests: guests.map((g: any) => ({
        id: g.id,
        name: g.name,
        role: g.role,
        occupation: g.occupation,
        title: g.title,
        stance: g.stance,
        color: g.color,
        sortOrder: g.sortOrder,
      })),
    });
  }

  // ══════════════════════════════════════════════════
  // 5. 确认嘉宾阵容
  // ══════════════════════════════════════════════════

  async function confirmGuests(req: Request, res: Response, _next: NextFunction) {
    const { id } = req.params;

    const discussion = await prisma.discussion.findUnique({
      where: { id },
      include: { _count: { select: { guests: true } } },
    });

    if (!discussion) {
      throw new AppError('讨论不存在', 404);
    }
    if (discussion.status !== 'SETUP') {
      throw new AppError(
        `当前讨论状态为 ${discussion.status}，不允许确认嘉宾`,
        409,
      );
    }
    if (discussion._count.guests < 2) {
      throw new AppError(
        '嘉宾人数不足，至少需要 2 位嘉宾（含主持人）才能确认',
        409,
      );
    }

    const updated = await prisma.discussion.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });

    success(res, {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });
  }

  // ══════════════════════════════════════════════════
  // 6. 结束讨论
  // ══════════════════════════════════════════════════

  async function endDiscussion(req: Request, res: Response, _next: NextFunction) {
    const { id } = req.params;

    const discussion = await prisma.discussion.findUnique({ where: { id } });
    if (!discussion) {
      throw new AppError('讨论不存在', 404);
    }
    if (discussion.status !== 'IN_PROGRESS') {
      throw new AppError(
        `当前讨论状态为 ${discussion.status}，不允许结束`,
        409,
      );
    }

    // MVP: 直接结束，summary 后续由 AI 调度服务异步生成
    const updated = await prisma.discussion.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    success(res, {
      id: updated.id,
      status: updated.status,
      summary: updated.summary,
      updatedAt: updated.updatedAt.toISOString(),
    });
  }

  return { create, list, getDetail, generateGuests, confirmGuests, endDiscussion };
}
