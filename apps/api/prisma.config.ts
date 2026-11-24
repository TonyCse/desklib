import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// Le .env est unique, à la racine du monorepo.
process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
