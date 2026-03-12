import { defineConfig, env } from 'prisma/config';
import { loadProjectEnv } from '../src/common/project-env';

loadProjectEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node ./prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
