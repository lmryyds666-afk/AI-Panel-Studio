/**
 * Prisma 客户端工厂
 *
 * Prisma 7 要求通过 adapter 或 accelerateUrl 连接数据库。
 * 此处使用 @prisma/adapter-libsql 连接 SQLite。
 */

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

/**
 * 创建一个连接 SQLite 的 PrismaClient 实例
 *
 * @param dbUrl  - SQLite 文件路径，如 "file:./dev.db" 或 "file:./test.db"
 */
export function createPrismaClient(dbUrl?: string): PrismaClient {
  const url = dbUrl ?? process.env.DATABASE_URL ?? 'file:./dev.db';

  const adapter = new PrismaLibSql({
    url: url.replace(/^file:/, 'file:'), // 保持 file: 协议
  });

  return new PrismaClient({ adapter });
}
