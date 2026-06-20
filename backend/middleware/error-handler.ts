/**
 * 统一错误处理中间件
 *
 * 捕获所有 throw / next(err) 传递的错误，转换为标准化 JSON 响应：
 *   - ZodError   → 400（参数校验失败）
 *   - AppError   → 使用其 statusCode
 *   - Error      → 500（不泄露内部消息）
 *   - 其他类型    → 500
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../types/errors';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod 校验错误 → 400
  if (err instanceof ZodError) {
    const messages = err.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    res.status(400).json({
      code: 400,
      data: null,
      message: messages.join('; '),
    });
    return;
  }

  // 自定义应用错误 → 使用其 statusCode
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.statusCode,
      data: null,
      message: err.message,
    });
    return;
  }

  // 普通 Error → 500（不泄露内部错误详情）
  if (err instanceof Error) {
    res.status(500).json({
      code: 500,
      data: null,
      message: '服务端内部错误',
    });
    return;
  }

  // 未知类型错误 → 500
  res.status(500).json({
    code: 500,
    data: null,
    message: '服务端内部错误',
  });
}
