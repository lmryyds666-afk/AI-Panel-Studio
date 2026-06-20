/**
 * 统一错误处理中间件 — 单元测试
 *
 * TDD RED 阶段：验证各类错误的标准化响应格式。
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { ZodError } from 'zod';

// 动态导入
let errorHandler: Function;
let AppError: any;

beforeAll(async () => {
  try {
    const mod = await import('../../../backend/middleware/error-handler');
    errorHandler = mod.errorHandler;
  } catch {
    errorHandler = undefined as any;
  }
  try {
    const typesMod = await import('../../../backend/types/errors');
    AppError = typesMod.AppError;
  } catch {
    AppError = undefined as any;
  }
});

// ─── 辅助函数 ────────────────────────────────────────

function mockReq() {
  return { method: 'POST', url: '/api/discussions' };
}

function mockRes() {
  const res: any = {};
  res.status = function (code: number) {
    res._statusCode = code;
    return res;
  };
  res.json = function (data: any) {
    res._json = data;
    return res;
  };
  return res;
}

function mockNext() {
  return () => {};
}

// ════════════════════════════════════════════════════
// 测试套件
// ════════════════════════════════════════════════════

describe('errorHandler 中间件', () => {
  it('ZodError 应返回 400 及字段校验详情', () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    // 构造一个 ZodError
    const zodError = new ZodError([
      {
        code: 'too_small',
        minimum: 1,
        type: 'string',
        inclusive: true,
        exact: false,
        message: '话题不能为空',
        path: ['topic'],
      },
      {
        code: 'too_big',
        maximum: 200,
        type: 'string',
        inclusive: true,
        exact: false,
        message: '话题不超过200字符',
        path: ['topic'],
      },
    ]);

    errorHandler(zodError, req, res, next);

    expect(res._statusCode).toBe(400);
    expect(res._json).toBeDefined();
    expect(res._json.code).toBe(400);
    expect(res._json.data).toBeNull();
    expect(res._json.message).toContain('topic');
  });

  it('AppError 应返回其指定的状态码和消息', () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    const notFoundError = new AppError('讨论不存在', 404);

    errorHandler(notFoundError, req, res, next);

    expect(res._statusCode).toBe(404);
    expect(res._json.code).toBe(404);
    expect(res._json.message).toBe('讨论不存在');
  });

  it('AppError 默认状态码为 500', () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    const err = new AppError('未知服务端错误');

    errorHandler(err, req, res, next);

    expect(res._statusCode).toBe(500);
    expect(res._json.code).toBe(500);
    expect(res._json.message).toBe('未知服务端错误');
  });

  it('状态冲突 AppError 应返回 409', () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    const conflictError = new AppError('当前讨论状态为 COMPLETED，不允许生成嘉宾', 409);

    errorHandler(conflictError, req, res, next);

    expect(res._statusCode).toBe(409);
    expect(res._json.code).toBe(409);
  });

  it('普通 Error 应返回 500，不泄露内部详情', () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    const genericError = new Error('数据库连接失败: connection refused');

    errorHandler(genericError, req, res, next);

    expect(res._statusCode).toBe(500);
    expect(res._json.code).toBe(500);
    expect(res._json.data).toBeNull();
    // 消息不应泄露内部错误详情
    expect(res._json.message).not.toContain('connection refused');
  });

  it('未知类型错误（非 Error 实例）应返回 500', () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    errorHandler('一个字符串错误', req, res, next);

    expect(res._statusCode).toBe(500);
    expect(res._json.code).toBe(500);
    expect(res._json.message).toBe('服务端内部错误');
  });
});
