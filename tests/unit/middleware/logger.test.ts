/**
 * 请求日志中间件 — 单元测试
 *
 * TDD RED 阶段：验证日志输出格式与 next() 调用。
 */
import { describe, it, expect, beforeAll, jest } from '@jest/globals';

// 动态导入
let requestLogger: Function;

beforeAll(async () => {
  try {
    const mod = await import('../../../backend/middleware/logger');
    requestLogger = mod.requestLogger;
  } catch {
    requestLogger = undefined as any;
  }
});

// ════════════════════════════════════════════════════
// 测试套件
// ════════════════════════════════════════════════════

describe('requestLogger 中间件', () => {
  it('应调用 next() 继续请求处理', () => {
    const req: any = { method: 'GET', originalUrl: '/api/discussions' };
    const res: any = {
      statusCode: 200,
      on: jest.fn(),
    };
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('应在响应完成时输出日志', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const req: any = { method: 'POST', originalUrl: '/api/discussions' };
    const res: any = {
      statusCode: 201,
      on: jest.fn((event: string, handler: Function) => {
        if (event === 'finish') {
          // 立即触发 finish 以验证日志输出
          handler();
        }
      }),
    };
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(consoleSpy).toHaveBeenCalled();
    const logMsg = consoleSpy.mock.calls[0]?.join(' ') ?? '';
    expect(logMsg).toContain('POST');
    expect(logMsg).toContain('/api/discussions');

    consoleSpy.mockRestore();
  });

  it('应在日志中记录状态码', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const req: any = { method: 'GET', originalUrl: '/api/discussions/d7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e' };
    const res: any = {
      statusCode: 404,
      on: jest.fn((event: string, handler: Function) => {
        if (event === 'finish') handler();
      }),
    };
    const next = jest.fn();

    requestLogger(req, res, next);

    const logMsg = consoleSpy.mock.calls[0]?.join(' ') ?? '';
    expect(logMsg).toContain('404');

    consoleSpy.mockRestore();
  });
});
