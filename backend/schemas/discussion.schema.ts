/**
 * 讨论相关 Zod 校验 Schema
 *
 * 覆盖所有 REST 端点的入参校验：
 *   - body（创建讨论）
 *   - query（列表查询）
 *   - params（discussion_id UUID）
 */
import { z } from 'zod';

/** POST /api/discussions — 创建讨论 */
export const createDiscussionSchema = z.object({
  topic: z
    .string()
    .min(1, '话题不能为空')
    .max(200, '话题不超过200字符'),
  expertCount: z
    .number()
    .int('专家人数必须为整数')
    .min(2, '专家人数至少为2')
    .max(8, '专家人数最多为8')
    .default(4),
});

/** GET /api/discussions — 列表查询参数 */
export const listDiscussionsSchema = z.object({
  status: z
    .enum(['SETUP', 'IN_PROGRESS', 'COMPLETED'], {
      message: '状态值只能是 SETUP、IN_PROGRESS 或 COMPLETED',
    })
    .optional(),
  page: z.coerce
    .number()
    .int('页码必须为整数')
    .min(1, '页码最小为1')
    .catch(1),
  pageSize: z.coerce
    .number()
    .int('每页数量必须为整数')
    .min(1, '每页数量最小为1')
    .max(100, '每页数量最大为100')
    .catch(20),
});

/** 路径参数：discussion_id（UUID 格式） */
export const discussionIdParamsSchema = z.object({
  id: z.string().uuid('discussion_id 必须是有效的 UUID'),
});
