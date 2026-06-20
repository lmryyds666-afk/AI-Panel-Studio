/**
 * 全局参数校验中间件
 *
 * 基于 Zod Schema 对请求的 body / query / params 进行校验。
 * 校验失败直接返回 400，校验成功将解析后的数据写回 req[source]。
 */
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodTypeAny } from 'zod';

/** 校验的数据来源 */
export type ValidationSource = 'body' | 'query' | 'params';

/**
 * 创建 Zod 校验中间件
 *
 * @param schema - Zod 校验 Schema
 * @param source - 校验的数据来源（默认 'body'）
 * @returns Express 中间件函数
 *
 * 使用示例：
 *   router.post('/discussions', validate(createDiscussionSchema), handler);
 *   router.get('/discussions/:id', validate(discussionIdSchema, 'params'), handler);
 */
export function validate(schema: ZodSchema | ZodTypeAny, source: ValidationSource = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      res.status(400).json({
        code: 400,
        data: null,
        message: messages.join('; '),
      });
      return;
    }

    // 用解析后的数据替换原始数据（含默认值、类型转换）
    // 注意：Express 中 req.query 是只读 getter，需用 Object.defineProperty 覆盖
    if (source === 'query') {
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
      });
    } else {
      req[source] = result.data;
    }
    next();
  };
}
