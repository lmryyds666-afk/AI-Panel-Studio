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
import type { SpeechScheduler } from '../services/speech-scheduler';
import type { ConsensusExtractor } from '../services/consensusExtractor';
import type { DiscussionWsServer } from '../ws/websocket-server';

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
 * 背景运行 AI 讨论调度循环
 *
 * 在 confirmGuests 后异步启动，不阻塞 HTTP 响应。
 * 按自然节奏（3-8 秒间隔）连续生成发言，直到达到最大轮数。
 */
async function runDiscussionLoop(
  discussionId: string,
  scheduler: SpeechScheduler,
  wsServer: DiscussionWsServer,
  prisma: PrismaClient,
  extractor?: ConsensusExtractor,
) {
  try {
    // 1. 启动讨论 → 生成主持人开场
    await scheduler.startDiscussion(discussionId);
    console.log(`[Scheduler] 讨论 ${discussionId} 开场发言已生成`);

    // 2. 循环生成后续发言（最多 12 轮，模拟完整讨论）
    const MAX_ROUNDS = 12;
    for (let i = 0; i < MAX_ROUNDS; i++) {
      // 模拟自然讨论节奏：3-8 秒间隔
      const delay = 3000 + Math.floor(Math.random() * 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // 检查讨论是否已被手动结束
      const ctx = scheduler.getContext(discussionId);
      if (!ctx || ctx.status === 'COMPLETED') {
        console.log(`[Scheduler] 讨论 ${discussionId} 已结束，停止调度`);
        return;
      }

      const speech = await scheduler.scheduleNext(discussionId);
      if (!speech) {
        // 达到最大发言数，自动结束
        console.log(`[Scheduler] 讨论 ${discussionId} 达到最大发言数，自动结束`);
        break;
      }

      // 实时共识/分歧提炼（异步，不阻塞发言流程）
      if (extractor && ctx) {
        const guestContexts = [...ctx.guests.values()].map((g) => ({
          id: g.id,
          name: g.name,
          role: g.role,
          title: g.title,
          stance: g.stance,
        }));
        extractor.analyzeNewSpeech(
          discussionId,
          {
            id: speech.id,
            guestId: speech.guestId,
            guestName: speech.guestName,
            guestTitle: speech.guestTitle,
            guestColor: speech.guestColor,
            content: speech.content,
            speechType: speech.speechType,
            sequence: speech.sequence,
          },
          guestContexts,
          ctx.topic,
        ).catch((err) => {
          console.warn(`[ConsensusExtractor] 讨论 ${discussionId} 异步提炼异常：${(err as Error).message}`);
        });
      }
    }

    // 3. 自动结束讨论 → 生成总结
    if (scheduler.getContext(discussionId)?.status === 'IN_PROGRESS') {
      await scheduler.endDiscussion(discussionId);
      console.log(`[Scheduler] 讨论 ${discussionId} 已自动结束`);
    }
  } catch (err) {
    console.error(`[Scheduler] 讨论 ${discussionId} 调度异常：`, (err as Error).message);
    // 尽量清理上下文
    try { scheduler.destroyContext(discussionId); } catch { /* ignore */ }
  }
}

/**
 * 创建讨论控制器工厂
 *
 * 通过闭包注入 PrismaClient、SpeechScheduler、DiscussionWsServer。
 * scheduler / wsServer 仅在生产环境传入，测试时可为 undefined。
 */
export function createDiscussionController(
  prisma: PrismaClient,
  scheduler?: SpeechScheduler,
  wsServer?: DiscussionWsServer,
  extractor?: ConsensusExtractor,
) {
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
    const id = req.params.id as string;

    const discussion = await prisma.discussion.findUnique({
      where: { id },
      include: {
        guests: {
          orderBy: { sortOrder: 'asc' },
        },
        speeches: {
          orderBy: { sequence: 'asc' },
          where: { isVisible: true },
          include: { guest: true },
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

    // Prisma v7: include 返回类型需要展开
    const disc = discussion as typeof discussion & {
      guests: Array<{
        id: string; name: string; role: string; occupation: string;
        title: string; stance: string; color: string; runStatus: string;
        sortOrder: number;
      }>;
      speeches: Array<{
        id: string; guestId: string; content: string; speechType: string;
        sequence: number; isVisible: boolean; createdAt: Date;
        guest: { id: string; name: string; title: string; color: string };
      }>;
      _count: { speeches: number; consensusRecords: number };
    };

    // 分别统计共识与分歧数量
    const consensusCount = await prisma.consensusRecord.count({
      where: { discussionId: id, recordType: 'CONSENSUS' },
    });
    const divergenceCount = await prisma.consensusRecord.count({
      where: { discussionId: id, recordType: 'DIVERGENCE' },
    });

    success(res, {
      id: disc.id,
      topic: disc.topic,
      status: disc.status,
      expertCount: disc.expertCount,
      summary: disc.summary,
      guests: disc.guests.map((g) => ({
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
      speeches: disc.speeches.map((s) => ({
        id: s.id,
        guestId: s.guestId,
        guestName: s.guest.name,
        guestTitle: s.guest.title,
        guestColor: s.guest.color,
        content: s.content,
        speechType: s.speechType,
        sequence: s.sequence,
        createdAt: s.createdAt.toISOString(),
      })),
      speechCount: disc._count.speeches,
      consensusCount,
      divergenceCount,
      createdAt: disc.createdAt.toISOString(),
      updatedAt: disc.updatedAt.toISOString(),
    });
  }

  // ══════════════════════════════════════════════════
  // 4. 生成嘉宾
  // ══════════════════════════════════════════════════

  async function generateGuests(req: Request, res: Response, _next: NextFunction) {
    const id = req.params.id as string;

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
    const id = req.params.id as string;

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

    const discWithCount = discussion as typeof discussion & {
      _count: { guests: number };
    };
    if (discWithCount._count.guests < 2) {
      throw new AppError(
        '嘉宾人数不足，至少需要 2 位嘉宾（含主持人）才能确认',
        409,
      );
    }

    const updated = await prisma.discussion.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });

    // 背景启动 AI 讨论调度循环（不阻塞响应）
    if (scheduler && wsServer) {
      runDiscussionLoop(id, scheduler, wsServer, prisma, extractor);
    }

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
    const id = req.params.id as string;

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

    // 若调度器上下文存在，通过调度器生成总结；否则直接结束
    let updated;
    if (scheduler?.getContext(id)?.status === 'IN_PROGRESS') {
      const speech = await scheduler.endDiscussion(id);
      updated = await prisma.discussion.findUnique({ where: { id } })!;
      // 广播已由 scheduler.endDiscussion 完成
      success(res, {
        id: updated!.id,
        status: 'COMPLETED',
        summary: speech.content,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    updated = await prisma.discussion.update({
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
