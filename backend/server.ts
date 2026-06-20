/**
 * AI Panel Studio — 后端服务入口
 *
 * Express 应用组装：中间件 → 路由 → 错误处理。
 * 导出 createApp() 便于测试注入；直接运行时启动 HTTP + WebSocket 监听。
 */
import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { createPrismaClient } from './lib/prisma';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/error-handler';
import { createDiscussionRouter } from './routes/discussions';
import { DiscussionWsServer } from './ws/websocket-server';

/**
 * 创建 Express 应用（不含 HTTP 服务器）
 *
 * @param dbUrl - SQLite 数据库路径（可选，测试时传入 test.db）
 */
export function createApp(dbUrl?: string) {
  const prisma = createPrismaClient(dbUrl);
  const app = express();

  // 全局中间件
  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  // 路由挂载
  app.use('/api', createDiscussionRouter(prisma));

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 统一错误处理（必须放在路由之后）
  app.use(errorHandler);

  return app;
}

/**
 * 创建完整服务（Express + HTTP Server + WebSocket）
 *
 * 用于生产启动，将 Socket.IO 挂载到 HTTP 服务器上。
 * WebSocket 通过 DiscussionWsServer 的 broadcast* 方法推送实时事件。
 *
 * @returns { app, httpServer, wsServer } — 供监听启动与外部推送使用
 */
export function createServer(dbUrl?: string) {
  const app = createApp(dbUrl);
  const httpServer = http.createServer(app);
  const wsServer = new DiscussionWsServer(httpServer);

  return { app, httpServer, wsServer };
}

// ─── 直接启动 ────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const { httpServer, wsServer } = createServer();
httpServer.listen(PORT, () => {
  console.log(`[AI Panel Studio] 后端服务已启动 → http://localhost:${PORT}`);
  console.log(`[AI Panel Studio] 健康检查 → http://localhost:${PORT}/health`);
  console.log(`[AI Panel Studio] WebSocket → ws://localhost:${PORT}/ws`);
  console.log(`[AI Panel Studio] 活跃讨论房间：${wsServer.getActiveRooms().length} 个`);
});
