/**
 * 参数校验中间件 — 单元测试
 *
 * TDD RED 阶段：先写测试，验证参数校验、错误消息格式、discussion_id 强制校验。
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { z } from 'zod';

// 动态导入（中间件文件可能尚未创建）
let validate: Function;

beforeAll(async () => {
  try {
    const mod = await import('../../../backend/middleware/validate');
    validate = mod.validate;
  } catch {
    validate = undefined as any;
  }
});

// ─── 测试辅助：创建 mock req/res/next ───────────────

function mockReq(overrides: Record<string, any> = {}): any {
  return {
    body: {} as any,
    query: {} as any,
    params: {} as any,
    ...overrides,
  };
}

function mockRes(): any {
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

function mockNext(): any {
  const wrapper: any = function () { wrapper.called = true; };
  wrapper.called = false;
  return wrapper;
}

// ─── Zod 测试 Schema ────────────────────────────────

const testBodySchema = z.object({
  topic: z.string().min(1, '话题不能为空').max(200, '话题不超过200字符'),
  expertCount: z.number().int().min(2).max(8).default(4),
});

const testParamsSchema = z.object({
  id: z.string().uuid('discussion_id 必须是有效的 UUID'),
});

// ════════════════════════════════════════════════════
// 测试套件
// ════════════════════════════════════════════════════

describe('validate 中间件 (body)', () => {
  it('正确请求体应调用 next()', () => {
    const middleware = validate(testBodySchema, 'body');
    const req = mockReq({ body: { topic: '测试话题', expertCount: 4 } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(true);
    expect(res._statusCode).toBeUndefined();
    // 验证 parsed body 包含默认值
    expect(req.body.expertCount).toBe(4);
  });

  it('缺少必填字段 topic 时应返回 400', () => {
    const middleware = validate(testBodySchema, 'body');
    const req = mockReq({ body: { expertCount: 4 } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
    expect(res._json).toBeDefined();
    expect(res._json.code).toBe(400);
    expect(res._json.data).toBeNull();
    expect(res._json.message).toContain('topic');
  });

  it('topic 为空字符串时应返回 400', () => {
    const middleware = validate(testBodySchema, 'body');
    const req = mockReq({ body: { topic: '', expertCount: 4 } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
    expect(res._json.message).toContain('话题不能为空');
  });

  it('topic 超过 200 字符时应返回 400', () => {
    const middleware = validate(testBodySchema, 'body');
    const req = mockReq({ body: { topic: 'A'.repeat(201), expertCount: 4 } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
  });

  it('expertCount 小于 2 时应返回 400', () => {
    const middleware = validate(testBodySchema, 'body');
    const req = mockReq({ body: { topic: '测试', expertCount: 1 } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
  });

  it('expertCount 大于 8 时应返回 400', () => {
    const middleware = validate(testBodySchema, 'body');
    const req = mockReq({ body: { topic: '测试', expertCount: 10 } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
  });

  it('不传 expertCount 时应使用默认值 4', () => {
    const middleware = validate(testBodySchema, 'body');
    const req = mockReq({ body: { topic: '测试话题' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(true);
    expect(req.body.expertCount).toBe(4);
  });
});

describe('validate 中间件 (params)', () => {
  it('正确的 UUID 路径参数应调用 next()', () => {
    const middleware = validate(testParamsSchema, 'params');
    const req = mockReq({ params: { id: 'd7a1c9e2-3f4b-4a5c-8d6e-1f2a3b4c5d6e' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(true);
  });

  it('非 UUID 格式的 discussion_id 应返回 400', () => {
    const middleware = validate(testParamsSchema, 'params');
    const req = mockReq({ params: { id: 'not-a-valid-uuid' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
    expect(res._json.message).toContain('UUID');
  });

  it('缺少 discussion_id 时应返回 400', () => {
    const middleware = validate(testParamsSchema, 'params');
    const req = mockReq({ params: {} });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
  });
});

describe('validate 中间件 (query)', () => {
  it('正确查询参数应调用 next()', () => {
    const querySchema = z.object({
      status: z.enum(['SETUP', 'IN_PROGRESS', 'COMPLETED']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    });
    const middleware = validate(querySchema, 'query');
    const req = mockReq({ query: { page: '2', pageSize: '10' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(true);
    expect(req.query.page).toBe(2);
    expect(req.query.pageSize).toBe(10);
  });

  it('无效 status 值应返回 400', () => {
    const querySchema = z.object({
      status: z.enum(['SETUP', 'IN_PROGRESS', 'COMPLETED']).optional(),
    });
    const middleware = validate(querySchema, 'query');
    const req = mockReq({ query: { status: 'INVALID' } });
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.called).toBe(false);
    expect(res._statusCode).toBe(400);
  });
});
