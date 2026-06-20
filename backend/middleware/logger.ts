/**
 * 请求日志中间件
 *
 * 记录每个请求的：方法、路径、响应状态码、处理耗时。
 * 日志格式：[ISO时间戳] METHOD /path - 状态码 (耗时ms)
 */
import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();

  res.on('finish', () => {
    const duration = Math.round(performance.now() - start);
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`,
    );
  });

  next();
}
