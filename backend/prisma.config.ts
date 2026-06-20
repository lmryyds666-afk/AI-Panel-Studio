import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    directory: './prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
  seed: {
    run: 'npx ts-node prisma/seed.ts',
  },
});
