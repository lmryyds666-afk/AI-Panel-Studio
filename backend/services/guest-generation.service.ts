/**
 * 嘉宾生成服务
 *
 * 职责：
 *   1. 构建结构化 Prompt 调用 Deepseek V4 Pro
 *   2. 从 AI 输出中提取纯 JSON（容忍夹带说明文字）
 *   3. Zod 校验 JSON 结构，抑制大模型幻觉
 *   4. 写入 Guest 表（主持人与专家统一建模）
 *
 * 依赖：
 *   - DeepSeek API（兼容 OpenAI SDK）
 *   - PrismaClient + SQLite adapter
 */

import OpenAI from 'openai';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

// ─── 类型定义 ────────────────────────────────────────

/** AI 调用签名 */
export type AICaller = (prompt: string) => Promise<string>;

/** 写入数据库前的嘉宾行数据 */
interface GuestRow {
  name: string;
  role: 'HOST' | 'EXPERT';
  occupation: string;
  title: string;
  stance: string;
  color: string;
  sortOrder: number;
}

/** generateGuests 返回的数据库记录（含 id / runStatus 等字段） */
export type GuestRecord = Record<string, unknown> & {
  id: string;
  discussionId: string;
  name: string;
  role: string;
  occupation: string;
  title: string;
  stance: string;
  color: string;
  runStatus: string;
  sortOrder: number;
};

// ─── 颜色池：确保颜色鲜明可区分 ────────────────────

const COLOR_POOL = [
  '#FF6B6B', // 珊瑚红
  '#45B7D1', // 天蓝
  '#F7DC6F', // 金黄
  '#BB8FCE', // 薰衣紫
  '#4ECDC4', // 青绿
  '#FF8C42', // 活力橙
  '#2ECC71', // 翡翠绿
  '#E74C3C', // 深红
  '#3498DB', // 宝蓝
  '#F39C12', // 琥珀
];

// ─── Zod Schema：AI 响应结构校验 ─────────────────────

/** 单个人物 Schema */
const personSchema = z.object({
  name: z
    .string()
    .min(1, '姓名不能为空')
    .max(20, '姓名超过20字符')
    .refine(
      (s) => /^[一-龥a-zA-Z·\s]{1,20}$/.test(s),
      '姓名只能包含中文、英文或 ·',
    ),
  occupation: z
    .string()
    .min(1, '职业不能为空')
    .max(50, '职业超过50字符'),
  title: z
    .string()
    .min(1, 'Title不能为空')
    .max(100, 'Title超过100字符'),
  stance: z
    .string()
    .min(1, '立场不能为空')
    .max(200, '立场超过200字符'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, '颜色必须是有效的 HEX 色值（如 #FF6B6B）'),
});

/** 嘉宾阵容整体 Schema */
const aiResponseSchema = z.object({
  host: personSchema,
  experts: z
    .array(personSchema)
    .min(1, '至少需要 1 位专家'),
});

// ─── 公开方法 ────────────────────────────────────────

/**
 * 从 AI 原始输出中提取 JSON 字符串
 *
 * 处理以下情况：
 *   - AI 在 JSON 前后附加说明文字
 *   - JSON 被 ```json ... ``` 或 ``` ... ``` 包裹
 *   - JSON 中包含 // 注释
 *   - JSON 中存在尾逗号（trailing comma）
 */
export function extractJSON(raw: string): string {
  // 1. 尝试匹配 markdown 代码块中的 JSON
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const cleaned = cleanJSON(codeBlockMatch[1].trim());
    if (isValidJSON(cleaned)) return cleaned;
  }

  // 2. 尝试找到第一个完整 JSON 对象 {...}
  const firstBrace = raw.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('AI 输出中未找到 JSON 对象');
  }

  // 从第一个 { 开始，匹配完整的 JSON 对象（考虑字符串内嵌的括号）
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = firstBrace; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
  }

  if (end === -1) {
    throw new Error('AI 输出中 JSON 对象不完整（括号未闭合）');
  }

  const json = raw.slice(firstBrace, end + 1);
  const cleaned = cleanJSON(json);
  if (!isValidJSON(cleaned)) {
    throw new Error(
      `提取的 JSON 无法解析，清理后内容前 300 字符：${cleaned.slice(0, 300)}`,
    );
  }

  return cleaned;
}

/**
 * 清理 AI 输出中的非标准 JSON 内容：
 *   - 移除单行注释（// ...）
 *   - 移除尾逗号（, 后紧跟 } 或 ]）
 */
function cleanJSON(raw: string): string {
  return (
    raw
      // 移除 // 单行注释（不处理字符串内的 //，对大模型输出而言够用）
      .replace(/\/\/.*$/gm, '')
      // 移除尾逗号：逗号后可有空白，然后 } 或 ]
      .replace(/,\s*(\}|\])/g, '$1')
  );
}

/** 判断字符串是否为合法 JSON */
function isValidJSON(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * 校验 AI 生成的嘉宾数据
 *
 * 校验规则：
 *   - Zod 基础字段校验（name/occupation/title/stance/color 格式）
 *   - 颜色不重复
 *   - 姓名不重复
 *   - 立场不重复（需要多样性）
 *   - 专家数量匹配
 *
 * @returns 校验通过后的标准化数据
 * @throws ZodError | Error 校验失败时抛出详细错误
 */
export function validateGuestResponse(
  data: unknown,
  expectedExpertCount?: number,
): { host: z.infer<typeof personSchema>; experts: z.infer<typeof personSchema>[] } {
  // 基础 Zod 校验
  const parsed = aiResponseSchema.parse(data);

  const allPersons = [parsed.host, ...parsed.experts];
  const experts = parsed.experts;

  // 颜色不重复
  const colors = allPersons.map((p) => p.color.toLowerCase());
  const uniqueColors = new Set(colors);
  if (uniqueColors.size !== colors.length) {
    throw new Error(
      `颜色存在重复：${colors.length} 位嘉宾但只有 ${uniqueColors.size} 种颜色。` +
        '请确保主持人及每位专家的颜色互不相同。',
    );
  }

  // 姓名不重复
  const names = allPersons.map((p) => p.name);
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    throw new Error(`姓名存在重复：${[...new Set(duplicates)].join('、')}`);
  }

  // 立场不重复（需要观点多样性）
  const stances = allPersons.map((p) => p.stance.trim());
  const uniqueStances = new Set(stances);
  if (uniqueStances.size !== stances.length) {
    throw new Error(
      '立场存在重复：每位嘉宾（含主持人）的立场应互不相同，以确保讨论多样性。',
    );
  }

  // 专家数量校验（可选：调用方知道期望人数时可以传入）
  if (expectedExpertCount !== undefined && experts.length !== expectedExpertCount) {
    throw new Error(
      `专家数量不匹配：期望 ${expectedExpertCount} 位，AI 返回了 ${experts.length} 位`,
    );
  }

  return parsed;
}

/**
 * 构建调用 Deepseek 的 Prompt
 *
 * 设计要求：
 *   - 明确角色分工（主持人 vs 专家）
 *   - 要求立场对立、观点多样
 *   - 颜色从预设池中分配（每人不同）
 *   - 严格 JSON 输出、无额外文字
 *   - 指定颜色池避免 AI 随机生成相近色
 */
export function buildPrompt(topic: string, expertCount: number): string {
  const colorList = COLOR_POOL.slice(0, expertCount + 1).join('、');
  return `你是人工智能圆桌讨论的嘉宾生成器。用户将提供一个讨论话题，你需要生成由 1 位主持人和 ${expertCount} 位专家组成的圆桌阵容。

## 角色要求

**主持人**：
- 职业应为资深媒体人/科技评论家/行业观察者
- 立场中立，善于引导和串联讨论
- 能从不同专家的观点中找到提问角度

**专家**：
- 每位专家必须代表截然不同的立场或视角
- 职业、专业背景应多元化（技术、经济、法律、社会学、伦理、商业等）
- 不同专家的立场应形成观点碰撞（如乐观 vs 悲观、激进 vs 保守、技术视角 vs 社会视角）
- 避免生成立场相近的专家

## 颜色分配
每位嘉宾必须分配一种独特的颜色（HEX 格式），从以下颜色池中选择：
${colorList}

主持人和专家各选一种，颜色不可重复。

## 讨论话题
${topic}

## 输出格式
严格按以下 JSON 格式输出，不要添加任何其他文字说明：

\`\`\`json
{
  "host": {
    "name": "中文姓名",
    "occupation": "职业",
    "title": "具体头衔",
    "stance": "对该话题的立场（1-2句话）",
    "color": "#XXXXXX"
  },
  "experts": [
    {
      "name": "中文姓名",
      "occupation": "职业",
      "title": "具体头衔",
      "stance": "对该话题的立场（1-2句话，与其他人形成对比）",
      "color": "#XXXXXX"
    }
  ]
}
\`\`\``;
}

/**
 * 核心函数：生成嘉宾阵容
 *
 * 流程：
 *   1. buildPrompt → 构建 prompt
 *   2. callAI → 调用大模型
 *   3. extractJSON → 提取纯 JSON
 *   4. validateGuestResponse → 结构校验（抑制幻觉）
 *   5. 写入数据库 → 返回 Guest 列表
 *
 * @param topic        - 讨论话题
 * @param expertCount  - 期望专家人数（不含主持人）
 * @param discussionId - 讨论 ID
 * @param callAI       - AI 调用函数（测试时可 mock）
 * @param prisma       - Prisma 客户端
 * @returns 写入数据库后的嘉宾列表（含 id）
 */
export async function generateGuests(
  topic: string,
  expertCount: number,
  discussionId: string,
  callAI: AICaller,
  prisma: PrismaClient,
): Promise<GuestRecord[]> {
  // 1. 清理旧嘉宾（幂等：重复生成时覆盖旧数据）
  await prisma.guest.deleteMany({ where: { discussionId } });

  // 2. 调用 AI
  const prompt = buildPrompt(topic, expertCount);
  const rawResponse = await callAI(prompt);

  // 3. 提取 JSON
  let jsonStr: string;
  try {
    jsonStr = extractJSON(rawResponse);
  } catch (err) {
    throw new Error(
      `AI 输出 JSON 提取失败：${(err as Error).message}\n` +
        `原始输出前 500 字符：${rawResponse.slice(0, 500)}`,
    );
  }

  // 4. 解析 + 校验
  let data: unknown;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    throw new Error(`AI 返回的 JSON 格式无效：${jsonStr.slice(0, 300)}`);
  }

  const validated = validateGuestResponse(data, expertCount);

  // 5. 写入数据库（含 runStatus = IDLE）
  const guestRows: GuestRow[] = [
    {
      name: validated.host.name,
      role: 'HOST',
      occupation: validated.host.occupation,
      title: validated.host.title,
      stance: validated.host.stance,
      color: validated.host.color,
      sortOrder: 0,
    },
    ...validated.experts.map((expert, index) => ({
      name: expert.name,
      role: 'EXPERT' as const,
      occupation: expert.occupation,
      title: expert.title,
      stance: expert.stance,
      color: expert.color,
      sortOrder: index + 1,
    })),
  ];

  await prisma.guest.createMany({
    data: guestRows.map((g) => ({ discussionId, ...g, runStatus: 'IDLE' })),
  });

  // 6. 返回写入后的完整记录（含 id、discussionId、runStatus 等所有字段）
  return prisma.guest.findMany({
    where: { discussionId },
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * 创建 DeepSeek AI 调用函数（生产环境使用）
 *
 * DeepSeek API 兼容 OpenAI SDK：
 *   - baseURL: https://api.deepseek.com
 *   - model: deepseek-chat (V3) / deepseek-reasoner (R1)
 *
 * 用户可根据需要指定模型，默认使用 deepseek-chat。
 */
export function createDeepSeekCaller(apiKey?: string, model?: string): AICaller {
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error('DEEPSEEK_API_KEY 环境变量未设置');
  }

  const client = new OpenAI({
    apiKey: key,
    baseURL: 'https://api.deepseek.com',
  });

  const modelName = model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

  return async (prompt: string): Promise<string> => {
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content:
            '你是一个严格按 JSON 格式输出的嘉宾生成器。只输出 JSON，不添加任何解释或额外文字。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8, // 稍高温度促进多样性
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('DeepSeek API 返回空内容');
    }
    return content;
  };
}
